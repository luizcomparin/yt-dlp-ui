import { useMemo } from 'react'
import { filterTracks, orderTracks, pickFormat } from '@shared/tracks'
import type { Track } from '@shared/ipc'
import { usePlaylist } from './playlist'
import { useQueue } from './queue'
import { useSettings } from './settings'

/**
 * Todas as faixas na ordem escolhida em "Ordenar" (R4, preset ou personalizada), sem filtros.
 * É a base das posições (coluna #, numeração dos arquivos, mover faixa).
 */
export function useOrderedTracks(): Track[] {
  const tracks = usePlaylist((s) => s.tracks)
  const order = usePlaylist((s) => s.order)
  const sortId = usePlaylist((s) => s.sortId)
  const customOrder = usePlaylist((s) => s.customOrder)
  const pref = useSettings((s) => s.settings?.audioFormat ?? 'best')
  return useMemo(
    () => orderTracks(order.map((id) => tracks[id]).filter(Boolean), sortId, customOrder, pref),
    [tracks, order, sortId, customOrder, pref]
  )
}

/**
 * Faixas visíveis: as ordenadas (`useOrderedTracks`) filtradas por R6 + busca (o filtro preserva a ordem).
 * A ordem resultante é também a ordem em que as selecionadas serão baixadas.
 */
export function useVisibleTracks(ordered: Track[]): Track[] {
  const filterText = usePlaylist((s) => s.filterText)
  const availability = usePlaylist((s) => s.availabilityFilter)
  const errorVideoIds = useErrorVideoIds()
  return useMemo(
    () => filterTracks(ordered, { text: filterText, availability, errorVideoIds }),
    [ordered, filterText, availability, errorVideoIds]
  )
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
  return currentOrderedTracks().map((t) => t.videoId)
}

/** Igual a `useOrderedTracks`, sem hook (lê o estado na hora). */
export function currentOrderedTracks(): Track[] {
  const { tracks, order, sortId, customOrder } = usePlaylist.getState()
  const pref = useSettings.getState().settings?.audioFormat ?? 'best'
  return orderTracks(order.map((id) => tracks[id]).filter(Boolean), sortId, customOrder, pref)
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
