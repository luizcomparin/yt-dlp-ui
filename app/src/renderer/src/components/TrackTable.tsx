import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Track } from '@shared/ipc'
import { isUnavailable } from '@shared/tracks'
import { usePlaylist } from '@renderer/store/playlist'
import { readNumber, scrollKey, writeNumber } from '@renderer/store/session'
import { COLS, TrackRow } from './TrackRow'

const ROW_HEIGHT = 52

/** Tabela virtualizada: só as linhas visíveis (+ margem) existem no DOM, mesmo com milhares de faixas. */
interface Props {
  tracks: Track[]
  /** Posição de cada linha na ordem escolhida (coluna #). */
  positions: ReadonlyMap<string, number>
  total: number
  /** Prévia do prefixo de numeração por linha ("007"); null = "Numerar arquivos" desligado. */
  numberLabels: ReadonlyMap<string, string> | null
}

export function TrackTable({ tracks, positions, total, numberLabels }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const visibleIds = useMemo(() => tracks.map((t) => t.rowId), [tracks])
  const selectable = useMemo(() => tracks.filter((t) => !isUnavailable(t.availability)).map((t) => t.rowId), [tracks])
  const allChecked = usePlaylist((s) => selectable.length > 0 && selectable.every((id) => s.selected[id]))
  const someChecked = usePlaylist((s) => selectable.some((id) => s.selected[id]))
  const setSelected = usePlaylist((s) => s.setSelected)

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (i) => tracks[i].rowId
  })

  // reabrir "de onde parou": restaura a rolagem uma vez por playlist, quando as faixas aparecem
  const url = usePlaylist((s) => s.url)
  const restoredFor = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!url || !tracks.length || restoredFor.current === url || !scrollRef.current) return
    restoredFor.current = url
    const top = readNumber(scrollKey(url))
    if (top) scrollRef.current.scrollTop = top
  }, [url, tracks.length])
  const onScroll = (): void => {
    if (!url || restoredFor.current !== url) return // não grava antes de restaurar
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (scrollRef.current) writeNumber(scrollKey(url), scrollRef.current.scrollTop)
    }, 300)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/2 px-3 py-1.5 text-[11px] text-white/40 uppercase">
        <span className={COLS.check}>
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = !allChecked && someChecked
            }}
            onChange={(e) => setSelected(selectable, e.target.checked)}
            aria-label="Selecionar todas as visíveis"
            title="Selecionar todas as visíveis"
          />
        </span>
        <span className={`${COLS.index} text-right`} title="Posição na ordem escolhida. Clique no número de uma faixa para movê-la.">#</span>
        <span className={COLS.thumb} />
        <span className="flex-1">Título</span>
        <span className={`${COLS.date} text-right`}>Publicado</span>
        <span className={`${COLS.duration} text-right`}>Duração</span>
        <span className={COLS.format}>Formato</span>
        <span className={`${COLS.size} text-right`}>Tamanho</span>
        <span className={COLS.action} />
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto">
        {tracks.length === 0 ? (
          <div className="p-6 text-center text-xs text-white/40">Nenhuma faixa corresponde aos filtros.</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => (
              <div
                key={v.key}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ROW_HEIGHT, transform: `translateY(${v.start}px)` }}
              >
                <TrackRow
                  rowId={tracks[v.index].rowId}
                  visibleIds={visibleIds}
                  position={positions.get(tracks[v.index].rowId) ?? 0}
                  total={total}
                  numberLabel={numberLabels?.get(tracks[v.index].rowId)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
