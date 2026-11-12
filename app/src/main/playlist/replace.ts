import type { ReplaceRequest, SearchResult, Track } from '@shared/ipc'
import { isUnavailable } from '@shared/tracks'
import { antiBlockArgs } from '@shared/antiblock'
import { getDb } from '../db'
import { createLibrary } from '../db/library'
import { resolveToolPaths } from '../deps'
import { getSettings } from '../settings/store'
import { run } from '../runner'
import { buildEnrichArgs, buildListArgs, cookieArgs } from '../ytdlp/args'
import { parseLine } from '../ytdlp/parse'
import { FLAT_FIELDS, INFO_FIELDS, parseEnrichInfo, parseFlatEntry, parseYoutubeUrl, thumbnailFor, watchUrl } from '../ytdlp/info'
import { classifyError, splitVideoError } from '../ytdlp/errors'

// Substituição de faixas indisponíveis por outro vídeo, mantendo a posição na playlist.
// A substituição fica salva por playlist (tabela `replacements`) e é aplicada sempre que a playlist é lida.

const SEARCH_RESULTS = 8

const lib = () => createLibrary(getDb())
const extraArgs = (): string[] => [...antiBlockArgs(getSettings().antiBlock, false), ...cookieArgs(getSettings())]

/** Executa o yt-dlp e coleta as linhas estruturadas + erros. */
async function collect(bin: string, args: string[]): Promise<{ data: Array<Record<string, unknown>>; errors: string[]; code: number | null }> {
  const data: Array<Record<string, unknown>> = []
  const errors: string[] = []
  const onLine = (line: string): void => {
    const p = parseLine(line)
    if (p.type === 'entry' || p.type === 'info') data.push(p.data)
    else if (p.type === 'error') errors.push(p.message)
  }
  const { code } = await run(bin, args, { onStdout: onLine, onStderr: onLine }).done
  return { data, errors, code }
}

/** Busca no YouTube (`ytsearchN:`), listagem rápida sem enriquecer. */
export async function searchVideos(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const tools = await resolveToolPaths()
  const { data, errors } = await collect(tools.ytdlp, buildListArgs(`ytsearch${SEARCH_RESULTS}:${q}`, FLAT_FIELDS, tools.deno, extraArgs()))
  if (!data.length && errors.length) throw new Error(classifyError(splitVideoError(errors.at(-1)!).message).reason)
  return data
    .map((d) => parseFlatEntry(d))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((e) => ({ videoId: e.id, url: watchUrl(e.id), title: e.title ?? e.id, channel: e.channel, duration: e.duration, thumbnail: thumbnailFor(e.id) }))
}

/** Aceita link do YouTube ou id de 11 caracteres. */
function videoIdFrom(input: string): string | null {
  const s = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  return parseYoutubeUrl(s).videoId
}

/**
 * Valida o vídeo substituto (extração completa: disponibilidade, formatos, tamanho), grava-o no cache
 * e registra a substituição. Lança erro legível se o substituto também estiver indisponível.
 */
export async function replaceTrack(req: ReplaceRequest): Promise<Track> {
  const id = videoIdFrom(req.url)
  if (!id) throw new Error('Link inválido: cole um link de vídeo do YouTube (watch?v=…, youtu.be/…) ou o id.')
  if (id === req.originalId) throw new Error('Esse é o próprio vídeo original.')

  const tools = await resolveToolPaths()
  const fields = [...INFO_FIELDS, 'title', 'channel', 'uploader']
  const { data, errors } = await collect(tools.ytdlp, buildEnrichArgs([watchUrl(id)], fields, tools.deno, extraArgs()))
  const raw = data[0]
  if (!raw) {
    const msg = errors.at(-1) ? splitVideoError(errors.at(-1)!).message : 'sem resposta do yt-dlp'
    // só a 1ª frase: o yt-dlp anexa longos textos de ajuda (cookies, FAQ…)
    const short = msg.split(/(?<=\.)\s/)[0]
    throw new Error(`Não foi possível usar esse vídeo: ${classifyError(msg).reason} (${short})`)
  }
  const flat = parseFlatEntry(raw)
  const info = parseEnrichInfo(raw)
  if (!flat || !info) throw new Error('Resposta inesperada do yt-dlp.')
  if (isUnavailable(info.availability)) throw new Error(`Esse vídeo também está indisponível: ${info.availabilityReason ?? info.availability}.`)

  const l = lib()
  l.upsertFlatEntry(flat)
  l.saveEnriched(info)
  l.setReplacement(req.playlistId, req.originalId, id)
  const row = l.getRow(req.playlistId, req.originalId, l.indexOf(req.playlistId, req.originalId))
  if (!row) throw new Error('Faixa original não encontrada na playlist.')
  return row
}

export function unreplaceTrack(playlistId: string, originalId: string): Track {
  const l = lib()
  l.clearReplacement(playlistId, originalId)
  const row = l.getRow(playlistId, originalId, l.indexOf(playlistId, originalId))
  if (!row) throw new Error('Faixa original não encontrada na playlist.')
  return row
}
