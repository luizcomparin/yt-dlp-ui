// Regras puras sobre faixas: ordenação (R4), filtros (R6) e escolha de formato (R1).
// Compartilhadas entre UI e main, e testadas em tracks.test.ts.
import type { AudioFormat, AudioPreference, Availability, Track } from './ipc'

// ---------- disponibilidade ----------

/** Faixas que certamente não podem ser baixadas. `restricted` pode funcionar com cookies. */
export const isUnavailable = (a: Availability): boolean => a === 'private' || a === 'deleted' || a === 'unavailable'

// ---------- ordenação ----------

export type SortKey = 'playlist' | 'date' | 'title' | 'duration' | 'size'
export type SortDir = 'asc' | 'desc'
export interface SortSpec {
  key: SortKey
  dir: SortDir
}

export const SORT_PRESETS: Array<{ id: string; label: string; sort: SortSpec }> = [
  { id: 'playlist', label: 'Ordem da playlist', sort: { key: 'playlist', dir: 'asc' } },
  { id: 'playlist-rev', label: 'Ordem inversa', sort: { key: 'playlist', dir: 'desc' } },
  { id: 'newest', label: 'Mais recentes', sort: { key: 'date', dir: 'desc' } },
  { id: 'oldest', label: 'Mais antigas', sort: { key: 'date', dir: 'asc' } },
  { id: 'title', label: 'Título (A–Z)', sort: { key: 'title', dir: 'asc' } },
  { id: 'duration', label: 'Mais curtas', sort: { key: 'duration', dir: 'asc' } },
  { id: 'duration-rev', label: 'Mais longas', sort: { key: 'duration', dir: 'desc' } }
]

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

function sortValue(t: Track, key: SortKey, pref: AudioPreference): string | number | null {
  switch (key) {
    case 'playlist':
      return t.index
    case 'date':
      return t.uploadDate
    case 'title':
      return t.title
    case 'duration':
      return t.duration
    case 'size':
      return pickFormat(t, pref)?.filesize ?? t.sizeBytes
  }
}

/**
 * Ordena sem mutar. Valores ausentes (ex.: data ainda não enriquecida) vão sempre para o fim,
 * qualquer que seja a direção. Empates mantêm a ordem da playlist.
 */
export function sortTracks(tracks: Track[], sort: SortSpec, pref: AudioPreference = 'best'): Track[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...tracks].sort((a, b) => {
    const va = sortValue(a, sort.key, pref)
    const vb = sortValue(b, sort.key, pref)
    if (va == null && vb == null) return a.index - b.index
    if (va == null) return 1
    if (vb == null) return -1
    const cmp = typeof va === 'string' && typeof vb === 'string' ? collator.compare(va, vb) : (va as number) - (vb as number)
    return cmp !== 0 ? cmp * sign : a.index - b.index
  })
}

// ---------- ordem personalizada ----------

/** sortId da ordem montada à mão (mover faixas pelo número da posição). Não está em SORT_PRESETS. */
export const CUSTOM_SORT_ID = 'custom'
export const CUSTOM_SORT_LABEL = 'Personalizada'

/**
 * Aplica uma ordem manual (lista de rowIds). Faixas que não estão nela (ex.: chegaram depois)
 * vão para o fim, na ordem da playlist; ids que saíram da playlist são ignorados.
 */
export function applyCustomOrder(tracks: Track[], custom: string[]): Track[] {
  const pos = new Map(custom.map((id, i) => [id, i]))
  return [...tracks].sort((a, b) => {
    const pa = pos.get(a.rowId)
    const pb = pos.get(b.rowId)
    if (pa != null && pb != null) return pa - pb
    if (pa != null) return -1
    if (pb != null) return 1
    return a.index - b.index
  })
}

/** Ordena pela opção escolhida em "Ordenar" (preset ou personalizada). */
export function orderTracks(tracks: Track[], sortId: string, customOrder: string[] | null, pref: AudioPreference = 'best'): Track[] {
  if (sortId === CUSTOM_SORT_ID && customOrder) return applyCustomOrder(tracks, customOrder)
  const sort = (SORT_PRESETS.find((p) => p.id === sortId) ?? SORT_PRESETS[0]).sort
  return sortTracks(tracks, sort, pref)
}

/**
 * Move `id` para a posição `position` (1 = primeira), deslocando as demais.
 * Ex.: da 60 para a 2 → a que estava na 2 vai para a 3, e assim por diante. Posição fora da faixa é limitada.
 */
export function moveToPosition(ids: string[], id: string, position: number): string[] {
  const from = ids.indexOf(id)
  if (from < 0) return ids
  const out = ids.filter((x) => x !== id)
  const to = Math.min(Math.max(Math.round(position) - 1, 0), out.length)
  out.splice(to, 0, id)
  return out
}

// ---------- numeração ----------

/** Prefixo da numeração de arquivos ("07", "007"…): largura mínima 2, ou a do total. */
export function numberPrefix(n: number, total: number): string {
  return String(n).padStart(Math.max(2, String(total).length), '0')
}

// ---------- filtros ----------

/**
 * Faixa que precisa ser substituída por outro vídeo: indisponível (privada/removida/bloqueada) ou
 * restrita sem formatos (a extração falhou), e ainda não substituída.
 */
export const needsReplacement = (t: Track): boolean =>
  !t.replacedFrom && (isUnavailable(t.availability) || (t.availability === 'restricted' && t.formats.length === 0))

/** Filtro de disponibilidade (R6 + substituição). */
export type AvailabilityFilter = 'all' | 'available' | 'needs-replacement' | 'replaced' | 'errors'

export const AVAILABILITY_FILTERS: Array<{ id: AvailabilityFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'available', label: 'Só disponíveis' },
  { id: 'needs-replacement', label: 'Precisam substituir' },
  { id: 'replaced', label: 'Substituídas' },
  { id: 'errors', label: 'Erros de download' }
]

/**
 * @param errorVideoIds vídeos cujo download falhou (vem da fila; a faixa em si não sabe disso).
 *                     Usado só pelo filtro 'errors'.
 */
export function matchesAvailability(t: Track, f: AvailabilityFilter, errorVideoIds?: ReadonlySet<string>): boolean {
  switch (f) {
    case 'all':
      return true
    case 'available':
      return !isUnavailable(t.availability)
    case 'needs-replacement':
      return needsReplacement(t)
    case 'replaced':
      return !!t.replacedFrom
    case 'errors':
      return !!errorVideoIds?.has(t.videoId)
  }
}

export interface TrackFilter {
  text: string
  availability: AvailabilityFilter
  /** Vídeos com download em erro (para o filtro 'errors'). */
  errorVideoIds?: ReadonlySet<string>
}

const normalize = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function filterTracks(tracks: Track[], f: TrackFilter): Track[] {
  const q = normalize(f.text.trim())
  return tracks.filter((t) => {
    if (!matchesAvailability(t, f.availability, f.errorVideoIds)) return false
    if (q && !normalize(`${t.title} ${t.channel ?? ''}`).includes(q)) return false
    return true
  })
}

// ---------- formato ----------

/** Expressão `-f` do yt-dlp para cada preferência. Sempre com fallback para o melhor áudio. */
export function formatSelector(pref: AudioPreference): string {
  switch (pref) {
    case 'opus':
      return 'bestaudio[acodec=opus]/bestaudio'
    case 'm4a':
      return 'bestaudio[ext=m4a]/bestaudio'
    default:
      return 'bestaudio'
  }
}

const bestBy = (formats: AudioFormat[], pred: (f: AudioFormat) => boolean): AudioFormat | null =>
  formats.filter((f) => pred(f) && !f.drc).sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0] ?? null

/**
 * Formato que será baixado para a faixa (para mostrar tamanho/codec antes do download).
 * `overrideId` = escolha manual do usuário para aquela faixa.
 */
export function pickFormat(t: Track, pref: AudioPreference, overrideId?: string): AudioFormat | null {
  if (overrideId) {
    const f = t.formats.find((x) => x.formatId === overrideId)
    if (f) return f
  }
  if (pref === 'opus') return bestBy(t.formats, (f) => f.acodec === 'opus') ?? t.bestFormat
  if (pref === 'm4a') return bestBy(t.formats, (f) => f.ext === 'm4a') ?? t.bestFormat
  return t.bestFormat
}

/** Rótulo curto de um formato: "opus 137k · 3.9 MB" é montado na UI; aqui só codec + bitrate. */
export function formatLabel(f: AudioFormat): string {
  const codec = f.acodec === 'opus' ? 'opus' : f.acodec.startsWith('mp4a') ? 'aac' : f.acodec
  return `${codec} ${f.abr ? Math.round(f.abr) + 'k' : '?'}${f.drc ? ' (drc)' : ''}`
}
