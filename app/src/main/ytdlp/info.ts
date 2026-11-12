import type { AudioFormat, Availability } from '@shared/ipc'

// Interpretação dos JSONs impressos pelo yt-dlp com `--print "%(.{campos})j"`.
// Campos nulos são omitidos pelo yt-dlp, por isso tudo é opcional.

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export const thumbnailFor = (videoId: string): string => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
export const watchUrl = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`

/** Campos pedidos na listagem flat. */
export const FLAT_FIELDS = [
  'id', 'title', 'duration', 'channel', 'uploader', 'availability', 'live_status',
  'playlist_id', 'playlist_title', 'playlist_count', 'playlist_index', 'playlist_uploader', 'playlist_channel'
]

/** Campos pedidos no enriquecimento (com `-f bestaudio`, os campos de formato são do formato escolhido). */
export const INFO_FIELDS = [
  'id', 'upload_date', 'timestamp', 'availability', 'duration', 'live_status', 'age_limit',
  'format_id', 'ext', 'acodec', 'abr', 'asr', 'filesize', 'filesize_approx', 'format_note', 'language', 'formats'
]

export interface FlatEntry {
  id: string
  /**
   * `null` quando a playlist não informa o título. Na prática, isso acontece com vídeos
   * privados/removidos (o YouTube devolve só o id), confirmado em playlist real.
   */
  title: string | null
  channel: string | null
  duration: number | null
  /** Disponibilidade já conhecida pela listagem (privado/removido/restrito) ou `null`. */
  availability: Availability | null
  availabilityReason: string | null
  index: number | null
  playlist: { id: string; title: string; count: number | null; channel: string | null } | null
}

export function parseFlatEntry(j: Record<string, unknown>): FlatEntry | null {
  const id = str(j.id)
  if (!id) return null
  const title = str(j.title)
  let availability: Availability | null = null
  let availabilityReason: string | null = null
  const av = str(j.availability)
  if (/^\[private video\]$/i.test(title ?? '') || av === 'private') {
    availability = 'private'
    availabilityReason = 'vídeo privado'
  } else if (/^\[deleted video\]$/i.test(title ?? '')) {
    availability = 'deleted'
    availabilityReason = 'vídeo removido'
  } else if (av === 'needs_auth' || av === 'subscriber_only' || av === 'premium_only') {
    availability = 'restricted'
    availabilityReason = av === 'subscriber_only' ? 'exclusivo para membros' : av === 'premium_only' ? 'exclusivo YouTube Premium' : 'requer login'
  }
  const playlistId = str(j.playlist_id)
  return {
    id,
    title,
    channel: str(j.channel) ?? str(j.uploader),
    duration: num(j.duration),
    availability,
    availabilityReason,
    index: num(j.playlist_index),
    playlist: playlistId
      ? {
          id: playlistId,
          title: str(j.playlist_title) ?? playlistId,
          count: num(j.playlist_count),
          channel: str(j.playlist_channel) ?? str(j.playlist_uploader)
        }
      : null
  }
}

function toAudioFormat(f: Record<string, unknown>, duration: number | null): AudioFormat | null {
  const formatId = str(f.format_id)
  const acodec = str(f.acodec)
  const vcodec = str(f.vcodec)
  // só formatos de áudio puro com codec conhecido (exclui HLS 233/234 sem metadados)
  if (!formatId || !acodec || acodec === 'none' || (vcodec && vcodec !== 'none')) return null
  const abr = num(f.abr) ?? num(f.tbr)
  const exact = num(f.filesize) ?? num(f.filesize_approx)
  const estimate = exact == null && abr != null && duration != null ? Math.round((abr * 1000 * duration) / 8) : null
  const note = str(f.format_note)
  return {
    formatId,
    ext: str(f.ext) ?? '?',
    acodec,
    abr,
    asr: num(f.asr),
    filesize: exact ?? estimate,
    filesizeIsEstimate: exact == null,
    note,
    language: str(f.language),
    drc: /drc/i.test(formatId) || /drc/i.test(note ?? '')
  }
}

export interface EnrichedInfo {
  id: string
  uploadDate: string | null
  timestamp: number | null
  duration: number | null
  availability: Availability
  availabilityReason: string | null
  bestFormat: AudioFormat | null
  formats: AudioFormat[]
  sizeBytes: number | null
  sizeIsEstimate: boolean
}

export function parseEnrichInfo(j: Record<string, unknown>): EnrichedInfo | null {
  const id = str(j.id)
  if (!id) return null
  const duration = num(j.duration)
  const formats = (Array.isArray(j.formats) ? j.formats : [])
    .map((f) => toAudioFormat(f as Record<string, unknown>, duration))
    .filter((f): f is AudioFormat => f !== null)
  const bestFormat = toAudioFormat({ ...j, vcodec: 'none' }, duration)

  let availability: Availability = 'available'
  let availabilityReason: string | null = null
  const av = str(j.availability)
  const live = str(j.live_status)
  if (av === 'private') {
    availability = 'private'
    availabilityReason = 'vídeo privado'
  } else if (av === 'needs_auth' || av === 'subscriber_only' || av === 'premium_only') {
    availability = 'restricted'
    availabilityReason = av === 'subscriber_only' ? 'exclusivo para membros' : av === 'premium_only' ? 'exclusivo YouTube Premium' : 'requer login'
  } else if (live === 'is_live' || live === 'is_upcoming') {
    availability = 'unavailable'
    availabilityReason = live === 'is_live' ? 'transmissão ao vivo' : 'estreia agendada'
  }

  return {
    id,
    uploadDate: str(j.upload_date),
    timestamp: num(j.timestamp),
    duration,
    availability,
    availabilityReason,
    bestFormat,
    formats,
    sizeBytes: bestFormat?.filesize ?? null,
    sizeIsEstimate: bestFormat?.filesizeIsEstimate ?? true
  }
}

/** Extrai o ID de playlist (`list=`) ou de vídeo (`v=` / youtu.be) de uma URL. */
export function parseYoutubeUrl(url: string): { listId: string | null; videoId: string | null } {
  try {
    const u = new URL(url.trim())
    const listId = u.searchParams.get('list')
    let videoId = u.searchParams.get('v')
    if (!videoId && /(^|\.)youtu\.be$/.test(u.hostname)) videoId = u.pathname.slice(1) || null
    if (!videoId) videoId = u.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/)?.[1] ?? null
    return { listId, videoId }
  } catch {
    return { listId: null, videoId: null }
  }
}
