import { useEffect, useMemo, useState } from 'react'
import type { ErrorEntry, Track } from '@shared/ipc'
import { csvDate, toCsv } from '@shared/csv'
import { isUnavailable } from '@shared/tracks'
import { kindLabel, useErrors } from '@renderer/store/errors'
import { usePlaylist } from '@renderer/store/playlist'
import { useQueue } from '@renderer/store/queue'

type Tab = 'downloads' | 'playlist'

const btn = 'shrink-0 rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40'
const control = 'rounded border border-white/10 bg-[#1a1d23] px-2 py-1 text-xs outline-none focus:border-sky-500'

const AVAIL_LABEL: Record<string, string> = {
  private: 'privado',
  deleted: 'removido',
  unavailable: 'indisponível',
  restricted: 'restrito'
}

const norm = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Tela de erros (fase 5): falhas de download (log permanente) e faixas indisponíveis da playlist atual. */
export function ErrorsDialog({ onClose }: { onClose: () => void }) {
  const entries = useErrors((s) => s.entries)
  const markSeen = useErrors((s) => s.markSeen)
  const failedJobs = useQueue((s) => s.state?.counts.error ?? 0)
  const playlist = usePlaylist((s) => s.playlist)
  const tracks = usePlaylist((s) => s.tracks)
  const order = usePlaylist((s) => s.order)

  const [tab, setTab] = useState<Tab>('downloads')
  const [kind, setKind] = useState('')
  const [text, setText] = useState('')
  const [showAttempts, setShowAttempts] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    markSeen()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [markSeen, onClose])

  const flash = (msg: string): void => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 5000)
  }

  // ---------- aba 1: falhas de download ----------
  const downloadRows = useMemo(() => {
    const q = norm(text.trim())
    return entries.filter(
      (e) =>
        (showAttempts || e.final) &&
        (!kind || e.kind === kind) &&
        (!q || norm(`${e.title} ${e.message} ${e.url}`).includes(q))
    )
  }, [entries, showAttempts, kind, text])

  const kindCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) if (showAttempts || e.final) m.set(e.kind, (m.get(e.kind) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [entries, showAttempts])

  // ---------- aba 2: indisponíveis na playlist ----------
  const playlistRows = useMemo(() => {
    const q = norm(text.trim())
    return order
      .map((id) => tracks[id])
      .filter((t): t is Track => !!t && (isUnavailable(t.availability) || t.availability === 'restricted'))
      .filter((t) => (!kind || t.availability === kind) && (!q || norm(`${t.title} ${t.availabilityReason ?? ''}`).includes(q)))
  }, [order, tracks, kind, text])

  const exportCsv = async (): Promise<void> => {
    const stamp = csvDate(Date.now()).replace(/[: ]/g, '-')
    let csv: string
    let name: string
    if (tab === 'downloads') {
      csv = toCsv(
        ['data', 'titulo', 'url', 'tipo', 'motivo', 'tentativa', 'final', 'mensagem', 'comando'],
        downloadRows.map((e) => [csvDate(e.createdAt), e.title, e.url, kindLabel(e.kind), e.reason, e.attempt, e.final ? 'sim' : 'não', e.message, e.command])
      )
      name = `erros-download-${stamp}.csv`
    } else {
      csv = toCsv(
        ['posicao', 'titulo', 'url', 'canal', 'status', 'motivo'],
        playlistRows.map((t) => [t.index, t.title, t.url, t.channel, AVAIL_LABEL[t.availability] ?? t.availability, t.availabilityReason])
      )
      name = `indisponiveis-${(playlist?.title ?? 'playlist').replace(/[\\/:*?"<>|]/g, '_')}-${stamp}.csv`
    }
    const path = await window.api.dialog.saveText(name, csv, 'CSV', ['csv'])
    if (path) flash(`Exportado: ${path}`)
  }

  const copyUrls = async (): Promise<void> => {
    const urls = tab === 'downloads' ? [...new Set(downloadRows.map((e) => e.url))] : playlistRows.map((t) => t.url)
    await navigator.clipboard.writeText(urls.join('\n'))
    flash(`${urls.length} URLs copiadas.`)
  }

  const retryFailed = async (): Promise<void> => {
    const n = await window.api.queue.retryFailed()
    flash(n ? `${n} downloads recolocados na fila.` : 'Nenhum download com erro na fila.')
  }

  const rows = tab === 'downloads' ? downloadRows.length : playlistRows.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex h-full max-h-[900px] w-full max-w-6xl flex-col rounded-lg border border-white/10 bg-[#13161b] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Erros"
      >
        {/* cabeçalho + abas */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <h2 className="mr-4 text-sm font-semibold">Erros</h2>
          {(['downloads', 'playlist'] as const).map((t) => (
            <button
              key={t}
              className={`rounded px-3 py-1 text-xs ${tab === t ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/5'}`}
              onClick={() => {
                setTab(t)
                setKind('')
              }}
            >
              {t === 'downloads' ? `Falhas de download (${entries.filter((e) => e.final).length})` : `Indisponíveis na playlist (${order.filter((id) => tracks[id] && (isUnavailable(tracks[id].availability) || tracks[id].availability === 'restricted')).length})`}
            </button>
          ))}
          <span className="flex-1" />
          <button className="text-lg leading-none text-white/50 hover:text-white" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        {/* filtros + ações */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2 text-xs">
          <input className={`${control} w-60`} placeholder="Buscar título, motivo ou URL…" value={text} onChange={(e) => setText(e.target.value)} />
          <select className={control} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">todos os tipos</option>
            {tab === 'downloads'
              ? kindCounts.map(([k, n]) => <option key={k} value={k}>{kindLabel(k)} ({n})</option>)
              : ['private', 'deleted', 'unavailable', 'restricted'].map((k) => <option key={k} value={k}>{AVAIL_LABEL[k]}</option>)}
          </select>
          {tab === 'downloads' && (
            <label className="flex items-center gap-1.5" title="Inclui falhas que foram tentadas de novo e bloqueios temporários">
              <input type="checkbox" checked={showAttempts} onChange={(e) => setShowAttempts(e.target.checked)} />
              mostrar tentativas intermediárias
            </label>
          )}
          <span className="text-white/40">{rows} itens</span>
          <span className="flex-1" />
          {notice && <span className="max-w-xs truncate text-emerald-300/90" title={notice}>{notice}</span>}
          <button className={btn} disabled={!rows} onClick={() => void exportCsv()}>exportar CSV</button>
          <button className={btn} disabled={!rows} onClick={() => void copyUrls()}>copiar URLs</button>
          {tab === 'downloads' && (
            <>
              <button className={btn} disabled={!failedJobs} onClick={() => void retryFailed()} title="Recoloca na fila todos os downloads que estão com erro">
                tentar falhas de novo ({failedJobs})
              </button>
              <button className={btn} onClick={() => void window.api.shell.openLogs()} title="Pasta com os arquivos errors-AAAAMMDD.jsonl">
                pasta de logs
              </button>
              <button
                className={`${btn} hover:bg-rose-500/30`}
                disabled={!entries.length}
                onClick={() => {
                  if (confirm('Apagar todo o histórico de erros da tela? (os arquivos .jsonl são mantidos)')) void window.api.errors.clear()
                }}
              >
                limpar histórico
              </button>
            </>
          )}
        </div>

        {/* lista */}
        <div className="min-h-0 flex-1 overflow-auto text-xs">
          {rows === 0 ? (
            <div className="p-8 text-center text-white/40">
              {tab === 'downloads' ? 'Nenhuma falha de download registrada. 🎉' : playlist ? 'Nenhuma faixa indisponível nesta playlist.' : 'Carregue uma playlist para ver as faixas indisponíveis.'}
            </div>
          ) : tab === 'downloads' ? (
            downloadRows.slice(0, 1000).map((e) => <DownloadErrorRow key={e.id} e={e} open={expanded === e.id} onToggle={() => setExpanded(expanded === e.id ? null : e.id)} />)
          ) : (
            playlistRows.map((t) => (
              <div key={t.videoId} className="flex items-center gap-3 border-b border-white/5 px-4 py-2">
                <span className="w-10 shrink-0 text-right text-white/30 tabular-nums">{t.index}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" title={t.title}>{t.title === t.videoId ? <span className="text-white/40">(sem título) {t.videoId}</span> : t.title}</div>
                  <div className="truncate text-white/40">{t.url}</div>
                </div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 ${t.availability === 'restricted' ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300'}`}>
                  {AVAIL_LABEL[t.availability]}
                </span>
                <span className="w-72 shrink-0 truncate text-white/60" title={t.availabilityReason ?? ''}>{t.availabilityReason ?? '—'}</span>
              </div>
            ))
          )}
          {tab === 'downloads' && downloadRows.length > 1000 && (
            <div className="p-3 text-center text-white/40">Mostrando 1000 de {downloadRows.length}. Use os filtros ou exporte o CSV.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function DownloadErrorRow({ e, open, onToggle }: { e: ErrorEntry; open: boolean; onToggle: () => void }) {
  return (
    <div className={`border-b border-white/5 px-4 py-2 ${e.final ? '' : 'opacity-60'}`}>
      <div className="flex cursor-pointer items-center gap-3" onClick={onToggle}>
        <span className="w-32 shrink-0 text-white/40 tabular-nums">{new Date(e.createdAt).toLocaleString('pt-BR')}</span>
        <span className="min-w-0 flex-1 truncate font-medium" title={e.title}>{e.title}</span>
        <span className="shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-300">{kindLabel(e.kind)}</span>
        <span className="w-64 shrink-0 truncate text-white/60" title={e.reason}>{e.reason}</span>
        <span className="w-20 shrink-0 text-right text-white/40">{e.final ? `tentativa ${e.attempt}` : `tentativa ${e.attempt} ↻`}</span>
      </div>
      {open && (
        <div className="mt-2 space-y-1 rounded bg-black/30 p-2 font-mono text-[11px] text-white/70 select-text">
          <div><span className="text-white/40">url: </span>{e.url}</div>
          <div className="whitespace-pre-wrap"><span className="text-white/40">mensagem: </span>{e.message}</div>
          {e.command && <div className="break-all whitespace-pre-wrap"><span className="text-white/40">comando: </span>{e.command}</div>}
        </div>
      )}
    </div>
  )
}
