import { create } from 'zustand'
import type { PlaylistEvent, PlaylistInfo, Track } from '@shared/ipc'
import { isUnavailable, SORT_PRESETS, type AvailabilityFilter } from '@shared/tracks'
import { nameKey } from '@shared/duplicates'
import { savedSelection } from './session'

export { isUnavailable }

interface PlaylistState {
  loadId: string | null
  url: string
  playlist: PlaylistInfo | null
  tracks: Record<string, Track>
  /** rowIds (vídeo original de cada linha) na ordem da playlist. */
  order: string[]
  status: 'idle' | 'listing' | 'enriching' | 'ready' | 'error'
  enrich: { done: number; total: number } | null
  warnings: string[]
  error: string | null

  // ---- visão (fase 3) ----
  /** id de SORT_PRESETS (R4). Também define a ordem de download. */
  sortId: string
  filterText: string
  /** Filtro R6: exibir privados/removidos/indisponíveis. */
  availabilityFilter: AvailabilityFilter
  /** Seleção para download (rowId → true). */
  selected: Record<string, boolean>
  /** Escolha manual de formato por faixa (rowId → format_id). */
  formatOverride: Record<string, string>
  lastClicked: string | null
  /** Vídeos já baixados na pasta de destino atual (download archive, R9). */
  archived: Record<string, true>
  /** Arquivos de áudio da pasta por chave de nome (duplicadas por nome, R14). */
  fileKeys: Record<string, string>
  /** Baixadas pelo app em outra pasta (videoId → pasta). */
  elsewhere: Record<string, string>

  load(url: string, refresh?: boolean): Promise<void>
  cancel(): Promise<void>
  applyEvent(e: PlaylistEvent): void

  setSort(id: string): void
  setFilterText(text: string): void
  setAvailabilityFilter(f: AvailabilityFilter): void
  /** Alterna uma faixa; com shift, aplica o mesmo valor ao intervalo desde o último clique (na ordem visível). */
  toggle(videoId: string, shift: boolean, visible: string[]): void
  setSelected(ids: string[], value: boolean): void
  invertSelection(ids: string[]): void
  setFormatOverride(videoId: string, formatId: string | null): void
  /** Relê archive, arquivos da pasta e downloads em outras pastas (ao trocar de pasta, carregar playlist ou terminar downloads). */
  refreshFolder(outputDir: string): Promise<void>
  markArchived(ids: string[]): void
  /** Substitui uma linha (após substituir/desfazer substituição). */
  setRow(t: Track): void
  /** Linha com a janela "substituir" aberta. */
  replacing: string | null
  setReplacing(rowId: string | null): void
}

/** Arquivo da pasta com o mesmo nome do título (possível duplicada, R14), ou null. */
export const fileMatch = (t: Track, fileKeys: Record<string, string>): string | null => fileKeys[nameKey(t.title)] ?? null

/** Já está na pasta: no archive (baixada pelo app) ou arquivo com o mesmo nome (R9/R14). */
export const alreadyInFolder = (t: Track, s: { archived: Record<string, true>; fileKeys: Record<string, string> }): boolean =>
  !!s.archived[t.videoId] || !!fileMatch(t, s.fileKeys)

/** Seleção padrão de uma faixa nova: disponível e ainda não presente na pasta. */
const defaultSelected = (t: Track, s: { archived: Record<string, true>; fileKeys: Record<string, string> }): boolean =>
  !isUnavailable(t.availability) && !alreadyInFolder(t, s)

const byIndex = (tracks: Record<string, Track>) => (a: string, b: string) =>
  (tracks[a]?.index ?? 0) - (tracks[b]?.index ?? 0)

const cleanError = (e: unknown): string =>
  (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export const usePlaylist = create<PlaylistState>((set, get) => ({
  loadId: null,
  url: '',
  playlist: null,
  tracks: {},
  order: [],
  status: 'idle',
  enrich: null,
  warnings: [],
  error: null,
  sortId: SORT_PRESETS[0].id,
  filterText: '',
  availabilityFilter: 'all',
  selected: {},
  formatOverride: {},
  lastClicked: null,
  archived: {},
  fileKeys: {},
  elsewhere: {},
  replacing: null,

  load: async (url, refresh = false) => {
    const prevUrl = get().url
    const sameUrl = prevUrl === url
    // outra playlist: começa da seleção/formatos salvos dela (sessão anterior), ou do zero
    const saved = sameUrl ? null : savedSelection(url)
    set({
      url, playlist: null, tracks: {}, order: [], status: 'listing', enrich: null, warnings: [], error: null, loadId: null,
      // recarregar a mesma playlist preserva seleção e formatos escolhidos
      ...(sameUrl
        ? {}
        : {
            selected: saved?.selected ?? {},
            formatOverride: saved?.formatOverride ?? {},
            lastClicked: null,
            // ao trocar de playlist a busca é limpa; na abertura do app (sem playlist anterior) mantém a restaurada
            ...(prevUrl ? { filterText: '' } : {})
          })
    })
    // o archive precisa estar lido antes das faixas chegarem (define a seleção padrão)
    const outputDir = (await window.api.settings.get()).outputDir
    await get().refreshFolder(outputDir)
    try {
      const { loadId } = await window.api.playlist.load(url, { refresh })
      // eventos podem ter chegado antes do invoke retornar: adota o loadId deles se já existir
      if (!get().loadId) set({ loadId })
    } catch (e) {
      set({ status: 'error', error: cleanError(e) })
    }
  },

  cancel: async () => {
    await window.api.playlist.cancel()
    set((s) => ({ status: s.order.length ? 'ready' : 'idle', loadId: null }))
  },

  applyEvent: (e) =>
    set((s) => {
      // ignora eventos de carregamentos antigos
      if (s.loadId && e.loadId !== s.loadId) return {}
      const base = s.loadId ? {} : { loadId: e.loadId }
      switch (e.type) {
        case 'info':
          return { ...base, playlist: e.playlist }
        case 'tracks': {
          const tracks = { ...s.tracks }
          const order = [...s.order]
          const selected = { ...s.selected }
          for (const t of e.tracks) {
            // linhas são identificadas por rowId (vídeo original); videoId pode ser o substituto
            const prev = tracks[t.rowId]
            if (!prev) {
              order.push(t.rowId)
              // novas faixas entram selecionadas, exceto indisponíveis e já baixadas
              if (!(t.rowId in selected)) selected[t.rowId] = defaultSelected(t, s)
            } else if (!isUnavailable(prev.availability) && isUnavailable(t.availability)) {
              selected[t.rowId] = false // descobriu-se indisponível no enriquecimento
            }
            tracks[t.rowId] = t
          }
          order.sort(byIndex(tracks))
          return { ...base, tracks, order, selected }
        }
        case 'listed': {
          // lista final: remove faixas do cache que saíram da playlist e reindexa
          const tracks: Record<string, Track> = {}
          e.videoIds.forEach((id, i) => {
            if (s.tracks[id]) tracks[id] = { ...s.tracks[id], index: i + 1 }
          })
          return { ...base, tracks, order: e.videoIds.filter((id) => tracks[id]), status: 'enriching' }
        }
        case 'enrich-progress':
          return { ...base, enrich: { done: e.done, total: e.total }, status: 'enriching' }
        case 'enriched':
          return { ...base, status: 'ready' }
        case 'warning':
          return { ...base, warnings: [...s.warnings, e.message] }
        case 'error':
          return { ...base, status: 'error', error: e.message }
      }
    }),

  setSort: (sortId) => set({ sortId }),
  setFilterText: (filterText) => set({ filterText }),
  setAvailabilityFilter: (availabilityFilter) => set({ availabilityFilter }),

  toggle: (videoId, shift, visible) =>
    set((s) => {
      const value = !s.selected[videoId]
      const selected = { ...s.selected }
      const from = s.lastClicked ? visible.indexOf(s.lastClicked) : -1
      const to = visible.indexOf(videoId)
      if (shift && from >= 0 && to >= 0) {
        const [a, b] = from < to ? [from, to] : [to, from]
        for (let i = a; i <= b; i++) {
          const t = s.tracks[visible[i]]
          if (t && !isUnavailable(t.availability)) selected[visible[i]] = value
        }
      } else {
        selected[videoId] = value
      }
      return { selected, lastClicked: videoId }
    }),

  setSelected: (ids, value) =>
    set((s) => {
      const selected = { ...s.selected }
      for (const id of ids) {
        const t = s.tracks[id]
        selected[id] = value && !!t && !isUnavailable(t.availability)
      }
      return { selected }
    }),

  invertSelection: (ids) =>
    set((s) => {
      const selected = { ...s.selected }
      for (const id of ids) {
        const t = s.tracks[id]
        if (t && !isUnavailable(t.availability)) selected[id] = !selected[id]
      }
      return { selected }
    }),

  refreshFolder: async (outputDir) => {
    // ids dos vídeos efetivos (substitutos incluídos)
    const ids = get().order.map((rowId) => get().tracks[rowId]?.videoId ?? rowId)
    const info = await window.api.library.folderInfo(outputDir, ids)
    set({
      archived: Object.fromEntries(info.archivedIds.map((id) => [id, true as const])),
      fileKeys: info.fileKeys,
      elsewhere: info.elsewhere
    })
  },

  markArchived: (ids) =>
    set((s) => {
      const archived = { ...s.archived }
      const selected = { ...s.selected }
      const done = new Set(ids)
      for (const id of ids) archived[id] = true
      // baixou: sai da seleção (a linha pode ter outro rowId se for uma substituição)
      for (const [rowId, t] of Object.entries(s.tracks)) if (done.has(t.videoId)) selected[rowId] = false
      return { archived, selected }
    }),

  setReplacing: (replacing) => set({ replacing }),

  setRow: (t) =>
    set((s) => {
      const formatOverride = { ...s.formatOverride }
      // trocar o vídeo invalida a escolha manual de formato (os formatos são de outro vídeo)
      if (s.tracks[t.rowId]?.videoId !== t.videoId) delete formatOverride[t.rowId]
      return {
        tracks: { ...s.tracks, [t.rowId]: t },
        selected: { ...s.selected, [t.rowId]: defaultSelected(t, s) },
        formatOverride
      }
    }),

  setFormatOverride: (videoId, formatId) =>
    set((s) => {
      const formatOverride = { ...s.formatOverride }
      if (formatId) formatOverride[videoId] = formatId
      else delete formatOverride[videoId]
      return { formatOverride }
    })
}))

export function bindPlaylistEvents(): () => void {
  return window.api.playlist.onEvent((e) => {
    usePlaylist.getState().applyEvent(e)
    if (e.type === 'listed') {
      void window.api.settings.get().then((s) => usePlaylist.getState().refreshFolder(s.outputDir))
    }
  })
}
