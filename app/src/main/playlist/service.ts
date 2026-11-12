import { randomUUID } from 'node:crypto'
import { IpcChannels, type PlaylistEvent, type PlaylistInfo, type PlaylistLoadOptions, type Track } from '@shared/ipc'
import { broadcast } from '../events'
import { resolveToolPaths } from '../deps'
import { getDb } from '../db'
import { createLibrary, type Library } from '../db/library'
import { parseYoutubeUrl } from '../ytdlp/info'
import { classifyError, splitVideoError } from '../ytdlp/errors'
import { listPlaylist } from './list'
import { enrichVideos } from './enrich'
import { getSettings } from '../settings/store'
import { antiBlockArgs, PROFILES } from '@shared/antiblock'
import { cookieArgs } from '../ytdlp/args'

// Orquestra: cache → listagem flat → enriquecimento em background.
// Só uma playlist é carregada por vez; carregar outra cancela a anterior.

// concorrência e pausas do enriquecimento vêm do perfil anti-bloqueio (R13)
const ENRICH_CHUNK = 10
const FLUSH_MS = 250

let current: { loadId: string; cancel: () => Promise<void> } | null = null
let library: Library | null = null
const lib = (): Library => (library ??= createLibrary(getDb()))

/** Id estável para o cache: o `list=` da URL, ou `video:<id>` para vídeo único. */
function cacheKey(url: string): string | null {
  const { listId, videoId } = parseYoutubeUrl(url)
  return listId ?? (videoId ? `video:${videoId}` : null)
}

export async function cancelPlaylistLoad(): Promise<void> {
  const c = current
  current = null
  await c?.cancel()
}

export async function loadPlaylist(url: string, opts: PlaylistLoadOptions = {}): Promise<{ loadId: string }> {
  await cancelPlaylistLoad()
  const tools = await resolveToolPaths()
  const loadId = randomUUID()
  let cancelled = false
  const cancelers: Array<() => Promise<void>> = []
  current = {
    loadId,
    cancel: async () => {
      cancelled = true
      await Promise.all(cancelers.map((c) => c()))
    }
  }

  const send = (e: PlaylistEvent): void => {
    if (!cancelled) broadcast(IpcChannels.playlistEvent, e)
  }

  // Agrupa faixas e emite no máximo a cada FLUSH_MS (evita milhares de eventos IPC).
  let buffer: Track[] = []
  let timer: NodeJS.Timeout | null = null
  const flush = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    if (buffer.length) send({ loadId, type: 'tracks', tracks: buffer })
    buffer = []
  }
  const queueTrack = (t: Track | null): void => {
    if (!t) return
    buffer.push(t)
    timer ??= setTimeout(flush, FLUSH_MS)
  }

  void (async () => {
    // 1. cache: mostra imediatamente o que já se conhece
    const key = cacheKey(url)
    const cached = key ? lib().getPlaylist(key) : null
    if (cached) {
      send({ loadId, type: 'info', playlist: cached })
      const tracks = lib().getPlaylistTracks(cached.id)
      if (tracks.length) send({ loadId, type: 'tracks', tracks })
    }

    // 2. listagem flat (sempre: detecta faixas novas/removidas)
    let playlist: PlaylistInfo | null = null
    const order: string[] = []
    const seen = new Set<string>()
    const { handle, result } = listPlaylist(tools.ytdlp, tools.deno, url, {
      onEntry: (e) => {
        if (!playlist) {
          playlist = e.playlist
            ? { id: e.playlist.id, url, title: e.playlist.title, channel: e.playlist.channel, count: e.playlist.count, isSingleVideo: false }
            : { id: `video:${e.id}`, url, title: e.title ?? e.id, channel: e.channel, count: 1, isSingleVideo: true }
          lib().upsertPlaylist(playlist)
          send({ loadId, type: 'info', playlist })
        }
        if (seen.has(e.id)) return // duplicata na mesma playlist: mantém a 1ª posição
        seen.add(e.id)
        order.push(e.id)
        lib().upsertFlatEntry(e)
        queueTrack(lib().getRow((playlist as PlaylistInfo).id, e.id, order.length))
      },
      onWarning: (message) => send({ loadId, type: 'warning', message })
    }, cookieArgs(getSettings()))
    cancelers.push(() => handle.kill())
    const listed = await result
    flush()
    if (cancelled || listed.cancelled) return
    if (!listed.ok || !playlist) {
      const raw = listed.error
      const reason = raw ? classifyError(splitVideoError(raw).message).reason : null
      send({
        loadId,
        type: 'error',
        message: raw ? `Não foi possível carregar: ${reason} (${raw})` : 'Nenhum vídeo encontrado nesse link.'
      })
      return
    }
    lib().setPlaylistItems((playlist as PlaylistInfo).id, order)
    send({ loadId, type: 'listed', videoIds: order })

    // 3. enriquecimento: só o que falta (ou tudo, com refresh)
    const tracks = lib().getPlaylistTracks((playlist as PlaylistInfo).id)
    const indexOf = new Map(tracks.map((t) => [t.rowId, t.index]))
    const todo = tracks
      .filter((t) => t.availability !== 'private' && t.availability !== 'deleted')
      .filter((t) => !t.replacedFrom) // substituídas: o substituto já foi validado; o original não interessa
      .filter((t) => opts.refresh || t.enrichedAt == null)
      .map((t) => t.rowId)
    if (todo.length === 0) {
      send({ loadId, type: 'enriched' })
      return
    }

    let done = 0
    send({ loadId, type: 'enrich-progress', done, total: todo.length })
    const enrich = enrichVideos(todo, {
      ytdlp: tools.ytdlp,
      denoPath: tools.deno,
      concurrency: PROFILES[getSettings().antiBlock]?.enrichConcurrency ?? 1,
      extraArgs: [...antiBlockArgs(getSettings().antiBlock, false), ...cookieArgs(getSettings())],
      chunkSize: ENRICH_CHUNK,
      onResult: (r) => {
        if (r.ok) lib().saveEnriched(r.info)
        else if (r.error.availability) lib().markUnavailable(r.id, r.error.availability, r.error.reason)
        done++
        queueTrack(lib().getRow((playlist as PlaylistInfo).id, r.id, indexOf.get(r.id) ?? 0))
        send({ loadId, type: 'enrich-progress', done, total: todo.length })
      },
      onRateLimit: (message) =>
        send({
          loadId,
          type: 'warning',
          message: `O YouTube limitou as requisições; enriquecimento pausado. Tente de novo mais tarde. (${message})`
        })
    })
    cancelers.push(enrich.cancel)
    await enrich.done
    flush()
    send({ loadId, type: 'enriched' })
    if (current?.loadId === loadId) current = null
  })().catch((e: Error) => {
    flush()
    send({ loadId, type: 'error', message: e.message })
  })

  return { loadId }
}
