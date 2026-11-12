import { useMemo } from 'react'
import { filterTracks, pickFormat, SORT_PRESETS, sortTracks } from '@shared/tracks'
import type { Track } from '@shared/ipc'
import { usePlaylist } from './playlist'
import { useQueue } from './queue'
import { useSettings } from './settings'

/**
 * Faixas visíveis: filtradas (R6 + busca) e ordenadas (R4).
 * A ordem resultante é também a ordem em que as selecionadas serão baixadas.
 */
export function useVisibleTracks(): Track[] {
  const tracks = usePlaylist((s) => s.tracks)
  const order = usePlaylist((s) => s.order)
  const sortId = usePlaylist((s) => s.sortId)
  const filterText = usePlaylist((s) => s.filterText)
  const availability = usePlaylist((s) => s.availabilityFilter)
  const pref = useSettings((s) => s.settings?.audioFormat ?? 'best')
  const errorVideoIds = useErrorVideoIds()

  return useMemo(() => {
    const list = order.map((id) => tracks[id]).filter(Boolean)
    const sort = (SORT_PRESETS.find((p) => p.id === sortId) ?? SORT_PRESETS[0]).sort
    return sortTracks(filterTracks(list, { text: filterText, availability, errorVideoIds }), sort, pref)
  }, [tracks, order, sortId, filterText, availability, pref, errorVideoIds])
}

/** Vídeos cujo job mais recente está em ERRO na pasta de destino atual (filtro "Erros de download"). */
export function useErrorVideoIds(): ReadonlySet<string> {
  const jobs = useQueue((s) => s.jobs)
  const byVideo = useQueue((s) => s.byVideo)
  const outputDir = useSettings((s) => s.settings?.outputDir)
  return useMemo(() => {
    const out = new Set<string>()
    for (const [videoId, jobId] of Object.entries(byVideo)) {
      const j = jobs[jobId]
      if (j && j.status === 'error' && j.outputDir === outputDir) out.add(videoId)
    }
    return out
  }, [jobs, byVideo, outputDir])
}

/**
 * Ordem atual de todas as faixas (ordenação escolhida, sem filtros de texto/disponibilidade).
 * Versão sem hook, para uso fora de componentes (ex.: M3U automático ao terminar a fila).
 */
export function currentOrderedIds(): string[] {
  const { tracks, order, sortId } = usePlaylist.getState()
  const pref = useSettings.getState().settings?.audioFormat ?? 'best'
  const sort = (SORT_PRESETS.find((p) => p.id === sortId) ?? SORT_PRESETS[0]).sort
  return sortTracks(order.map((id) => tracks[id]).filter(Boolean), sort, pref).map((t) => t.videoId)
}

/** Gera o .m3u8 da playlist carregada na pasta de destino (R10). */
export async function writeCurrentM3u(): Promise<import('@shared/ipc').M3uResult | null> {
  const { playlist } = usePlaylist.getState()
  const settings = useSettings.getState().settings
  if (!playlist || !settings) return null
  return window.api.library.writeM3u({ outputDir: settings.outputDir, playlistTitle: playlist.title, videoIds: currentOrderedIds() })
}

/** Resumo da seleção (sobre TODAS as faixas, não só as visíveis). */
export function useSelectionSummary(): { count: number; duration: number; size: number; sizeIsEstimate: boolean } {
  const tracks = usePlaylist((s) => s.tracks)
  const selected = usePlaylist((s) => s.selected)
  const overrides = usePlaylist((s) => s.formatOverride)
  const pref = useSettings((s) => s.settings?.audioFormat ?? 'best')

  return useMemo(() => {
    let count = 0
    let duration = 0
    let size = 0
    let sizeIsEstimate = false
    for (const [id, on] of Object.entries(selected)) {
      const t = tracks[id]
      if (!on || !t) continue
      count++
      duration += t.duration ?? 0
      const f = pickFormat(t, pref, overrides[id])
      if (f?.filesize != null) {
        size += f.filesize
        if (f.filesizeIsEstimate) sizeIsEstimate = true
      } else sizeIsEstimate = true
    }
    return { count, duration, size, sizeIsEstimate }
  }, [tracks, selected, overrides, pref])
}
