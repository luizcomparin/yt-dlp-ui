import { useEffect, useState } from 'react'
import type { SearchResult } from '@shared/ipc'
import { usePlaylist } from '@renderer/store/playlist'
import { useQueue } from '@renderer/store/queue'
import { useSettings } from '@renderer/store/settings'
import { formatDuration } from '@renderer/lib/format'

const cleanError = (e: unknown): string => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** Título bom para busca: tira "[sem título]" (id) e ruídos comuns entre colchetes. */
function initialQuery(title: string, videoId: string): string {
  if (title === videoId) return ''
  return title.replace(/\[(?:official|lyrics?|hq|hd|mv|4k)[^\]]*\]/gi, '').replace(/\s+/g, ' ').trim()
}

/**
 * Substituir uma faixa indisponível por outro vídeo, mantendo a posição na playlist.
 * Duas formas: colar um link, ou buscar no YouTube (busca preenchida com o título original).
 */
export function ReplaceDialog({ rowId, onClose }: { rowId: string; onClose: () => void }) {
  const t = usePlaylist((s) => s.tracks[rowId])
  const playlist = usePlaylist((s) => s.playlist)
  const setRow = usePlaylist((s) => s.setRow)
  const original = t?.replacedFrom ?? (t ? { videoId: t.videoId, title: t.title, availability: t.availability, availabilityReason: t.availabilityReason } : null)

  const [link, setLink] = useState('')
  const [query, setQuery] = useState(() => (original ? initialQuery(original.title, original.videoId) : ''))
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [applying, setApplying] = useState<string | null>(null) // url em validação
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // busca automática ao abrir, se houver título
  useEffect(() => {
    if (query) void search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!t || !playlist || !original) return null

  async function search(): Promise<void> {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      setResults(await window.api.playlist.search(query))
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setSearching(false)
    }
  }

  const apply = async (url: string): Promise<void> => {
    setApplying(url)
    setError(null)
    try {
      const oldVideoId = t.videoId
      const row = await window.api.playlist.replace({ playlistId: playlist.id, originalId: rowId, url })
      setRow(row)
      // se o vídeo antigo tem um job com erro/pendente nesta pasta, troca o vídeo NO MESMO job (mantém a posição na fila)
      const q = useQueue.getState()
      const outputDir = useSettings.getState().settings?.outputDir
      const jobId = q.byVideo[oldVideoId]
      const job = jobId ? q.jobs[jobId] : undefined
      if (job && job.outputDir === outputDir && (job.status === 'error' || job.status === 'queued' || job.status === 'paused')) {
        await window.api.queue.replaceJob(job.id, { videoId: row.videoId, url: row.url, title: row.title })
      }
      onClose()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setApplying(null)
    }
  }

  const undo = async (): Promise<void> => {
    setRow(await window.api.playlist.unreplace(playlist.id, rowId))
    onClose()
  }

  const input = 'flex-1 rounded border border-white/10 bg-white/5 px-3 py-1.5 text-xs outline-none focus:border-sky-500'
  const btn = 'shrink-0 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium hover:bg-sky-500 disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-2xl flex-col rounded-lg border border-white/10 bg-[#13161b] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Substituir faixa"
      >
        <div className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Substituir faixa #{t.index}</h2>
            <div className="mt-1 truncate text-xs text-white/60" title={original.title}>
              Original: <span className="text-white/80">{original.title === original.videoId ? `(sem título) ${original.videoId}` : original.title}</span>
              {original.availabilityReason && <span className="text-rose-300/80"> · {original.availabilityReason}</span>}
            </div>
            {t.replacedFrom && (
              <div className="mt-0.5 truncate text-xs text-sky-300/80" title={t.title}>
                Substituída por: {t.title} {t.channel && `· ${t.channel}`}
              </div>
            )}
          </div>
          <button className="text-lg leading-none text-white/50 hover:text-white" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className="space-y-3 px-4 py-3 text-xs">
          <div className="space-y-1">
            <span className="text-white/60">Colar link de um vídeo que funcione</span>
            <div className="flex gap-2">
              <input
                className={input}
                placeholder="https://www.youtube.com/watch?v=…"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && link.trim() && void apply(link)}
                autoFocus={!query}
              />
              <button className={btn} disabled={!link.trim() || !!applying} onClick={() => void apply(link)}>
                {applying === link ? 'validando…' : 'usar link'}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-white/60">ou buscar no YouTube</span>
            <div className="flex gap-2">
              <input
                className={input}
                placeholder="título, artista…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void search()}
                autoFocus={!!query}
              />
              <button className={btn} disabled={!query.trim() || searching} onClick={() => void search()}>
                {searching ? 'buscando…' : 'buscar'}
              </button>
            </div>
          </div>

          {error && <div className="rounded border border-rose-500/30 bg-rose-500/10 p-2 text-rose-200">{error}</div>}
        </div>

        <div className="min-h-0 flex-1 overflow-auto border-t border-white/10">
          {results === null ? (
            <div className="p-4 text-center text-xs text-white/40">{searching ? 'Buscando…' : 'Os resultados da busca aparecem aqui.'}</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-xs text-white/40">Nenhum resultado.</div>
          ) : (
            results.map((r) => (
              <div key={r.videoId} className="flex items-center gap-3 border-b border-white/5 px-4 py-2 text-xs">
                <img src={r.thumbnail} alt="" className="h-10 w-[72px] shrink-0 rounded bg-white/5 object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" title={r.title}>{r.title}</div>
                  <div className="truncate text-white/40">{r.channel ?? '—'}</div>
                </div>
                <span className="w-12 shrink-0 text-right text-white/60 tabular-nums">{formatDuration(r.duration)}</span>
                <button
                  className="shrink-0 rounded px-2 py-1 text-white/50 hover:bg-white/10 hover:text-white"
                  onClick={() => void window.api.shell.openExternal(r.url)}
                  title="Abrir no navegador para conferir"
                >
                  ver
                </button>
                <button className={btn} disabled={!!applying || r.videoId === t.videoId} onClick={() => void apply(r.url)}>
                  {applying === r.url ? 'validando…' : r.videoId === t.videoId ? 'atual' : 'usar'}
                </button>
              </div>
            ))
          )}
        </div>

        {t.replacedFrom && (
          <div className="flex justify-end border-t border-white/10 px-4 py-2">
            <button className="rounded px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white" onClick={() => void undo()}>
              desfazer substituição
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
