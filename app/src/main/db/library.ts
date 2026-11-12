import type { DatabaseSync } from 'node:sqlite'
import type { AudioFormat, Availability, PlaylistInfo, ReplacedFrom, Track } from '@shared/ipc'
import type { EnrichedInfo, FlatEntry } from '../ytdlp/info'
import { thumbnailFor, watchUrl } from '../ytdlp/info'
import { transaction } from './index'

// Repositório de playlists e vídeos. Recebe o DatabaseSync para ser testável com ':memory:'.

interface VideoRow {
  id: string
  title: string
  channel: string | null
  duration: number | null
  upload_date: string | null
  availability: Availability
  availability_reason: string | null
  size_bytes: number | null
  size_is_estimate: number
  best_format_json: string | null
  formats_json: string | null
  enriched_at: number | null
}

const parseJson = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

/**
 * Monta a faixa. `rowId` = identidade da linha (vídeo original); quando há substituição,
 * `row` é o vídeo substituto e `replacedFrom` traz os dados do original.
 */
export function rowToTrack(row: VideoRow, index: number, rowId: string = row.id, replacedFrom: ReplacedFrom | null = null): Track {
  return {
    rowId,
    videoId: row.id,
    url: watchUrl(row.id),
    index,
    title: row.title,
    channel: row.channel,
    duration: row.duration,
    thumbnail: thumbnailFor(row.id),
    uploadDate: row.upload_date,
    availability: row.availability,
    availabilityReason: row.availability_reason,
    sizeBytes: row.size_bytes,
    sizeIsEstimate: row.size_is_estimate === 1,
    bestFormat: parseJson<AudioFormat | null>(row.best_format_json, null),
    formats: parseJson<AudioFormat[]>(row.formats_json, []),
    enrichedAt: row.enriched_at,
    replacedFrom
  }
}

export function createLibrary(db: DatabaseSync) {
  const stmts = {
    upsertPlaylist: db.prepare(`
      INSERT INTO playlists (id, url, title, channel, count, is_single, fetched_at)
      VALUES (:id, :url, :title, :channel, :count, :is_single, :fetched_at)
      ON CONFLICT(id) DO UPDATE SET url = excluded.url, title = excluded.title, channel = excluded.channel,
        count = excluded.count, is_single = excluded.is_single, fetched_at = excluded.fetched_at`),
    getPlaylist: db.prepare('SELECT * FROM playlists WHERE id = ?'),
    // Dados da listagem flat: não sobrescreve os do enriquecimento.
    // - Título ausente ou "[Private video]" → mantém o título já conhecido.
    // - Disponibilidade: usa a da flat se for concreta (privado/removido/restrito); senão, detecta mudança:
    //     sumiu o título de um vídeo que estava ok  → 'pending' (re-checar: provavelmente ficou privado/removido)
    //     voltou o título de um vídeo privado/removido → 'pending' (re-checar: pode ter voltado)
    //   'unavailable' (bloqueio regional/Content ID) NÃO é re-checado: esses vídeos sempre têm título na flat,
    //   e re-checar a cada carregamento só gastaria requisições.
    //   Em ambos os casos zera enriched_at para o enriquecimento rodar de novo.
    // (No UPDATE do SQLite, todas as expressões leem os valores antigos da linha.)
    upsertFlat: db.prepare(`
      INSERT INTO videos (id, title, channel, duration, availability, availability_reason, updated_at)
      VALUES (:id, COALESCE(:title, :id), :channel, :duration, COALESCE(:availability, 'pending'), :reason, :now)
      ON CONFLICT(id) DO UPDATE SET
        title = CASE WHEN :title IS NULL OR :availability IN ('private', 'deleted') THEN videos.title ELSE :title END,
        channel = COALESCE(:channel, videos.channel),
        duration = COALESCE(:duration, videos.duration),
        availability = CASE
          WHEN :availability IS NOT NULL THEN :availability
          WHEN :title IS NULL AND videos.availability NOT IN ('private', 'deleted', 'unavailable') THEN 'pending'
          WHEN :title IS NOT NULL AND videos.availability IN ('private', 'deleted') THEN 'pending'
          ELSE videos.availability END,
        availability_reason = CASE
          WHEN :availability IS NOT NULL THEN :reason
          WHEN :title IS NULL AND videos.availability NOT IN ('private', 'deleted', 'unavailable') THEN NULL
          WHEN :title IS NOT NULL AND videos.availability IN ('private', 'deleted') THEN NULL
          ELSE videos.availability_reason END,
        enriched_at = CASE
          WHEN :availability IS NULL AND :title IS NULL AND videos.availability NOT IN ('private', 'deleted', 'unavailable') THEN NULL
          WHEN :availability IS NULL AND :title IS NOT NULL AND videos.availability IN ('private', 'deleted') THEN NULL
          ELSE videos.enriched_at END,
        updated_at = :now`),
    updateEnriched: db.prepare(`
      UPDATE videos SET upload_date = :upload_date, timestamp = :timestamp, duration = COALESCE(:duration, duration),
        availability = :availability, availability_reason = :reason, size_bytes = :size_bytes,
        size_is_estimate = :size_is_estimate, best_format_json = :best, formats_json = :formats,
        enriched_at = :now, updated_at = :now
      WHERE id = :id`),
    markUnavailable: db.prepare(`
      UPDATE videos SET availability = :availability, availability_reason = :reason, enriched_at = :now, updated_at = :now
      WHERE id = :id`),
    deleteItems: db.prepare('DELETE FROM playlist_items WHERE playlist_id = ?'),
    insertItem: db.prepare('INSERT OR IGNORE INTO playlist_items (playlist_id, video_id, idx) VALUES (?, ?, ?)'),
    tracksOf: db.prepare(`
      SELECT v.*, i.idx FROM playlist_items i JOIN videos v ON v.id = i.video_id
      WHERE i.playlist_id = ? ORDER BY i.idx`),
    getVideo: db.prepare('SELECT * FROM videos WHERE id = ?'),
    replacementsOf: db.prepare('SELECT original_id, replacement_id FROM replacements WHERE playlist_id = ?'),
    getReplacement: db.prepare('SELECT replacement_id FROM replacements WHERE playlist_id = ? AND original_id = ?'),
    setReplacement: db.prepare(`
      INSERT INTO replacements (playlist_id, original_id, replacement_id, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(playlist_id, original_id) DO UPDATE SET replacement_id = excluded.replacement_id, created_at = excluded.created_at`),
    clearReplacement: db.prepare('DELETE FROM replacements WHERE playlist_id = ? AND original_id = ?')
  }

  /** Aplica a substituição (se houver) à linha `original` da playlist. */
  const withReplacement = (original: VideoRow, index: number, replacementId: string | undefined): Track => {
    const rep = replacementId ? (stmts.getVideo.get(replacementId) as VideoRow | undefined) : undefined
    if (!rep) return rowToTrack(original, index)
    return rowToTrack(rep, index, original.id, {
      videoId: original.id,
      title: original.title,
      availability: original.availability,
      availabilityReason: original.availability_reason
    })
  }

  return {
    upsertPlaylist(p: PlaylistInfo): void {
      stmts.upsertPlaylist.run({
        id: p.id, url: p.url, title: p.title, channel: p.channel, count: p.count,
        is_single: p.isSingleVideo ? 1 : 0, fetched_at: Date.now()
      })
    },

    getPlaylist(id: string): PlaylistInfo | null {
      const r = stmts.getPlaylist.get(id) as
        | { id: string; url: string; title: string; channel: string | null; count: number | null; is_single: number }
        | undefined
      return r ? { id: r.id, url: r.url, title: r.title, channel: r.channel, count: r.count, isSingleVideo: r.is_single === 1 } : null
    },

    upsertFlatEntry(e: FlatEntry): void {
      stmts.upsertFlat.run({
        id: e.id, title: e.title, channel: e.channel, duration: e.duration,
        availability: e.availability, reason: e.availabilityReason, now: Date.now()
      })
    },

    saveEnriched(info: EnrichedInfo): void {
      stmts.updateEnriched.run({
        id: info.id, upload_date: info.uploadDate, timestamp: info.timestamp, duration: info.duration,
        availability: info.availability, reason: info.availabilityReason, size_bytes: info.sizeBytes,
        size_is_estimate: info.sizeIsEstimate ? 1 : 0,
        best: info.bestFormat ? JSON.stringify(info.bestFormat) : null,
        formats: JSON.stringify(info.formats), now: Date.now()
      })
    },

    markUnavailable(id: string, availability: Availability, reason: string): void {
      stmts.markUnavailable.run({ id, availability, reason, now: Date.now() })
    },

    /** Substitui a lista de itens da playlist (ordem atual). Duplicatas mantêm a 1ª posição. */
    setPlaylistItems(playlistId: string, videoIds: string[]): void {
      transaction(db, () => {
        stmts.deleteItems.run(playlistId)
        videoIds.forEach((id, i) => stmts.insertItem.run(playlistId, id, i + 1))
      })
    },

    getPlaylistTracks(playlistId: string): Track[] {
      const reps = new Map(
        (stmts.replacementsOf.all(playlistId) as Array<{ original_id: string; replacement_id: string }>).map((r) => [r.original_id, r.replacement_id])
      )
      return (stmts.tracksOf.all(playlistId) as unknown as Array<VideoRow & { idx: number }>).map((r) => withReplacement(r, r.idx, reps.get(r.id)))
    },

    /** Linha da playlist (com substituição aplicada, se houver). */
    getRow(playlistId: string, originalId: string, index: number): Track | null {
      const r = stmts.getVideo.get(originalId) as VideoRow | undefined
      if (!r) return null
      const rep = stmts.getReplacement.get(playlistId, originalId) as { replacement_id: string } | undefined
      return withReplacement(r, index, rep?.replacement_id)
    },

    setReplacement(playlistId: string, originalId: string, replacementId: string): void {
      stmts.setReplacement.run(playlistId, originalId, replacementId, Date.now())
    },

    clearReplacement(playlistId: string, originalId: string): void {
      stmts.clearReplacement.run(playlistId, originalId)
    },

    /** Posição atual da linha na playlist (0 se não estiver nela). */
    indexOf(playlistId: string, videoId: string): number {
      const r = db.prepare('SELECT idx FROM playlist_items WHERE playlist_id = ? AND video_id = ?').get(playlistId, videoId) as { idx: number } | undefined
      return r?.idx ?? 0
    },

    getTrack(videoId: string, index: number): Track | null {
      const r = stmts.getVideo.get(videoId) as VideoRow | undefined
      return r ? rowToTrack(r, index) : null
    }
  }
}

export type Library = ReturnType<typeof createLibrary>
