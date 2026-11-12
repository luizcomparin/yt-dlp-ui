import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { JobStatus } from '@shared/ipc'
import { useQueue } from '@renderer/store/queue'
import { usePlaylist } from '@renderer/store/playlist'
import { usePersistentState } from '@renderer/lib/usePersistentState'
import { formatBytes, formatEta } from '@renderer/lib/format'
import { countByGroup, QUEUE_GROUPS, QUEUE_SORTS, viewJobs, type QueueGroup, type QueueSort } from '@renderer/lib/queueView'

export const JOB_STATUS: Record<JobStatus, { label: string; cls: string }> = {
  queued: { label: 'na fila', cls: 'text-white/50' },
  running: { label: 'baixando', cls: 'text-sky-400' },
  paused: { label: 'pausado', cls: 'text-amber-300' },
  done: { label: 'concluído', cls: 'text-emerald-400' },
  skipped: { label: 'já baixado', cls: 'text-emerald-400/70' },
  error: { label: 'erro', cls: 'text-rose-400' }
}

const ROW_HEIGHT = 74

const link = 'hover:text-white'

/** Contagem regressiva da pausa anti-bloqueio. */
function useCountdown(until: number | null): string | null {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!until) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until])
  if (!until) return null
  const s = Math.max(0, Math.round((until - now) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const QueueRow = memo(function QueueRow({ id }: { id: string }) {
  const j = useQueue((s) => s.jobs[id])
  const [showCmd, setShowCmd] = useState(false)
  // linha da playlist carregada que corresponde a este job (para "substituir" na própria fila)
  const replaceRowId = usePlaylist((s) => {
    if (!j || j.status !== 'error' || !s.playlist || s.playlist.id !== j.playlistId) return null
    for (const [rowId, t] of Object.entries(s.tracks)) if (t.videoId === j.videoId) return rowId
    return null
  })
  const setReplacing = usePlaylist((s) => s.setReplacing)
  // posição: o mesmo "#" da playlist (se ela estiver carregada); senão, a posição na fila
  const playlistIndex = usePlaylist((s) => {
    if (!j || !s.playlist || s.playlist.id !== j.playlistId) return null
    for (const t of Object.values(s.tracks)) if (t.videoId === j.videoId) return t.index
    return null
  })
  const queueRank = useQueue((s) => s.order.indexOf(id) + 1)
  if (!j) return null
  const st = JOB_STATUS[j.status]
  const p = j.progress
  const pct =
    j.status === 'done' || j.status === 'skipped'
      ? 100
      : p?.totalBytes
        ? Math.min(100, (p.downloadedBytes / p.totalBytes) * 100)
        : 0
  const label =
    j.status === 'running' && j.postprocessor
      ? `processando (${j.postprocessor})`
      : j.status === 'running' && !p
        ? 'preparando' // extraindo info / pausa anti-bloqueio antes do download
        : j.status === 'queued' && j.attempts > 0
        ? `nova tentativa (${j.attempts + 1})`
        : st.label

  return (
    <div className="h-full border-b border-white/5 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={`shrink-0 text-right tabular-nums ${playlistIndex != null ? 'text-white/40' : 'text-white/25 italic'}`}
          title={playlistIndex != null ? `Posição ${playlistIndex} na playlist` : `Posição ${queueRank} na fila (playlist não carregada)`}
        >
          {playlistIndex ?? queueRank}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium" title={j.filePath ?? j.title}>{j.title}</span>
        <span className={`shrink-0 ${st.cls}`}>{label}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded bg-white/10">
        <div
          className={`h-full transition-[width] ${j.status === 'error' ? 'bg-rose-500' : j.status === 'paused' ? 'bg-amber-400' : 'bg-sky-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center gap-x-3 whitespace-nowrap text-white/45">
        <span className="min-w-0 truncate">
          {j.status === 'error' && j.error ? (
            <span className="text-rose-300/80" title={j.error}>{j.error}</span>
          ) : p ? (
            <>
              {formatBytes(p.downloadedBytes)} / {formatBytes(p.totalBytes)}
              {j.status === 'running' && p.speed ? ` · ${formatBytes(p.speed)}/s · ${formatEta(p.eta)}` : ''}
            </>
          ) : null}
        </span>
        <span className="flex-1" />
        {j.filePath && <button className={link} onClick={() => void window.api.shell.showItem(j.filePath!)}>pasta</button>}
        {j.command && <button className={link} onClick={() => setShowCmd((v) => !v)} title={j.command}>cmd</button>}
        {(j.status === 'running' || j.status === 'queued') && (
          <button className={link} onClick={() => void window.api.queue.pauseJob(id)}>pausar</button>
        )}
        {j.status === 'paused' && <button className={link} onClick={() => void window.api.queue.resumeJob(id)}>retomar</button>}
        {j.status === 'error' && <button className={link} onClick={() => void window.api.queue.retryJob(id)}>tentar de novo</button>}
        {j.status === 'error' && (
          <button
            className={`${link} disabled:opacity-30`}
            disabled={!replaceRowId}
            onClick={() => replaceRowId && setReplacing(replaceRowId)}
            title={replaceRowId ? 'Trocar por outro vídeo mantendo a posição na fila' : 'Carregue a playlist desta faixa para substituir'}
          >
            ⇄ substituir
          </button>
        )}
        <button className="hover:text-rose-300" onClick={() => void window.api.queue.removeJob(id)} title="Remover da fila (apaga arquivos parciais)">
          ✕
        </button>
      </div>
      {showCmd && j.command && (
        <pre className="absolute inset-x-3 z-10 mt-1 max-h-40 overflow-auto rounded bg-black/90 p-2 font-mono text-[10px] whitespace-pre-wrap break-all text-white/70 select-text">
          {j.command}
        </pre>
      )}
    </div>
  )
})

export function QueuePanel() {
  const allOrder = useQueue((s) => s.order)
  const jobs = useQueue((s) => s.jobs)
  const state = useQueue((s) => s.state)
  // grupos ocultos (contadores clicáveis) e ordenação — lembrados entre aberturas do app
  const [hiddenList, setHiddenList] = usePersistentState<QueueGroup[]>('queue.hidden', [])
  const [sort, setSort] = usePersistentState<QueueSort>('queue.sort', 'queue')
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList])
  const allJobs = useMemo(() => allOrder.map((id) => jobs[id]).filter(Boolean), [allOrder, jobs])
  const counts = useMemo(() => countByGroup(allJobs), [allJobs])
  const order = useMemo(() => viewJobs(allJobs, hidden, sort).map((j) => j.id), [allJobs, hidden, sort])
  const toggleGroup = (g: QueueGroup): void => setHiddenList(hidden.has(g) ? hiddenList.filter((x) => x !== g) : [...hiddenList, g])
  const countdown = useCountdown(state?.cooldownUntil ?? null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: order.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
    getItemKey: (i) => order[i]
  })

  const c = state?.counts
  const pending = c ? c.queued + c.running : 0
  const finished = c ? c.done + c.skipped : 0

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-white/10 p-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold">Fila</h2>
          {state && !state.paused && !state.cooldownUntil ? (
            <button className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20" onClick={() => void window.api.queue.pauseAll()}>
              ⏸ pausar tudo
            </button>
          ) : (
            <button className="rounded bg-sky-600 px-2 py-1 text-xs font-medium hover:bg-sky-500" onClick={() => void window.api.queue.resumeAll()}>
              ▶ retomar
            </button>
          )}
        </div>
        {/* contadores clicáveis: mostram/ocultam o grupo na lista */}
        <div className="flex flex-wrap gap-1 text-xs">
          {QUEUE_GROUPS.filter((g) => g.id !== 'paused' || counts.paused > 0).map((g) => {
            const off = hidden.has(g.id)
            return (
              <button
                key={g.id}
                className={`rounded px-1.5 py-0.5 tabular-nums ${off ? 'text-white/25 line-through hover:text-white/50' : `${g.cls} bg-white/5 hover:bg-white/10`}`}
                onClick={() => toggleGroup(g.id)}
                title={off ? `Mostrar "${g.label}"` : `Ocultar "${g.label}"`}
                aria-pressed={!off}
              >
                {counts[g.id]} {g.label}
              </button>
            )
          })}
        </div>
        {state?.cooldownUntil && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
            O YouTube limitou as requisições. Retomando em <b>{countdown}</b> (ou clique em retomar).
          </div>
        )}
        {state?.paused && pending > 0 && !state.cooldownUntil && (
          <div className="text-xs text-amber-300/80">Fila pausada.</div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-white/50">Ordenar</span>
          <select
            className="rounded border border-white/10 bg-[#1a1d23] px-2 py-1 outline-none"
            value={sort}
            onChange={(e) => setSort(e.target.value as QueueSort)}
          >
            {QUEUE_SORTS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <span className="flex-1" />
          {counts.error > 0 && !hidden.has('error') && (
            <button className="whitespace-nowrap text-white/50 hover:text-white" onClick={() => void window.api.queue.retryFailed()} title="Recoloca todas as falhas na fila, cada uma na sua posição">
              tentar todas
            </button>
          )}
          {finished > 0 && (
            <button className="whitespace-nowrap text-white/40 hover:text-white" onClick={() => void window.api.queue.clearFinished()}>
              limpar concluídos
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {order.length === 0 ? (
          <div className="p-3 text-xs text-white/40">
            {allOrder.length === 0 ? (
              'Nenhum download na fila.'
            ) : (
              <>
                Todos os itens estão ocultos.{' '}
                <button className="text-sky-400 hover:underline" onClick={() => setHiddenList([])}>mostrar tudo</button>
              </>
            )}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => (
              <div key={v.key} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ROW_HEIGHT, transform: `translateY(${v.start}px)` }}>
                <QueueRow id={order[v.index]} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
