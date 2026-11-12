import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ConsoleTool } from '@shared/ipc'
import { useConsole } from '@renderer/store/console'
import { usePersistentState } from '@renderer/lib/usePersistentState'

const TOOLS: ConsoleTool[] = ['yt-dlp', 'ffmpeg', 'ffprobe', 'deno']

/** Exemplos prontos (clicar preenche o campo). */
const EXAMPLES: Array<{ tool: ConsoleTool; args: string; label: string }> = [
  { tool: 'yt-dlp', args: '-F "URL"', label: 'listar formatos de um vídeo' },
  { tool: 'yt-dlp', args: '--simulate --print "%(title)s | %(duration_string)s | %(upload_date)s" "URL"', label: 'título, duração e data' },
  { tool: 'yt-dlp', args: '-f bestaudio -x --embed-thumbnail --embed-metadata "URL"', label: 'baixar áudio manualmente' },
  { tool: 'yt-dlp', args: '--version', label: 'versão' },
  { tool: 'ffprobe', args: '-hide_banner "arquivo.opus"', label: 'inspecionar um arquivo baixado' },
  { tool: 'ffmpeg', args: '-version', label: 'versão do ffmpeg' }
]

interface HistoryItem {
  tool: ConsoleTool
  args: string
}

const btn = 'shrink-0 rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40'

/** Console (R8): executa yt-dlp/ffmpeg/ffprobe/deno com argumentos livres. */
export function ConsoleDialog({ onClose }: { onClose: () => void }) {
  const lines = useConsole((s) => s.lines)
  const running = useConsole((s) => s.running)
  const clear = useConsole((s) => s.clear)
  const addMeta = useConsole((s) => s.addMeta)
  const [tool, setTool] = usePersistentState<ConsoleTool>('console.tool', 'yt-dlp')
  const [useAppArgs, setUseAppArgs] = usePersistentState('console.useAppArgs', true)
  const [history, setHistory] = usePersistentState<HistoryItem[]>('console.history', [])
  const [args, setArgs] = useState('')
  const [hIndex, setHIndex] = useState<number | null>(null)
  const outRef = useRef<HTMLPreElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // rolagem automática, a menos que o usuário tenha subido para ler
  useLayoutEffect(() => {
    const el = outRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const runCmd = async (): Promise<void> => {
    let t = tool
    let a = args.trim()
    // aceita "yt-dlp -F url" digitado com o nome da ferramenta na frente
    const first = a.split(/\s+/)[0]?.toLowerCase().replace(/\.exe$/, '')
    if (TOOLS.includes(first as ConsoleTool)) {
      t = first as ConsoleTool
      a = a.slice(a.indexOf(' ') >= 0 ? a.indexOf(' ') + 1 : a.length).trim()
      setTool(t)
    }
    try {
      await window.api.console.run({ tool: t, args: a, useAppArgs })
      setHistory([{ tool: t, args: a }, ...history.filter((h) => !(h.tool === t && h.args === a))].slice(0, 50))
      setArgs('')
      setHIndex(null)
      stickToBottom.current = true
    } catch (e) {
      addMeta(`erro: ${(e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`)
    }
  }

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !running) void runCmd()
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!history.length) return
      e.preventDefault()
      const next = e.key === 'ArrowUp' ? Math.min((hIndex ?? -1) + 1, history.length - 1) : (hIndex ?? 0) - 1
      if (next < 0) {
        setHIndex(null)
        setArgs('')
      } else {
        setHIndex(next)
        setTool(history[next].tool)
        setArgs(history[next].args)
      }
    } else if (e.key === 'c' && e.ctrlKey && running && !window.getSelection()?.toString()) {
      void window.api.console.kill()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex h-full max-h-[900px] w-full max-w-6xl flex-col rounded-lg border border-white/10 bg-[#0c0e12] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Console"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Console</h2>
          <span className="text-xs text-white/40">executa na pasta de destino · ↑/↓ histórico · Ctrl+C para parar</span>
          <span className="flex-1" />
          <button className={btn} onClick={() => void navigator.clipboard.writeText(lines.map((l) => l.text).join('\n'))} disabled={!lines.length}>
            copiar saída
          </button>
          <button className={btn} onClick={clear} disabled={!lines.length}>limpar</button>
          <button className="text-lg leading-none text-white/50 hover:text-white" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <pre
          ref={outRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
          className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12px] leading-5 whitespace-pre-wrap break-all select-text"
        >
          {lines.length === 0 ? (
            <span className="text-white/30">
              {'Digite argumentos e pressione Enter. Exemplos:\n'}
              {EXAMPLES.map((x, i) => (
                <span key={i} className="block cursor-pointer text-sky-300/70 hover:text-sky-300" onClick={() => { setTool(x.tool); setArgs(x.args); inputRef.current?.focus() }}>
                  {`  ${x.tool} ${x.args}`}
                  <span className="text-white/30">{`   # ${x.label}`}</span>
                </span>
              ))}
            </span>
          ) : (
            lines.map((l, i) => (
              <div key={i} className={l.stream === 'meta' ? 'text-sky-300/80' : l.stream === 'stderr' ? (/^ERROR:/.test(l.text) ? 'text-rose-300' : /^WARNING:/.test(l.text) ? 'text-amber-300/80' : 'text-white/70') : 'text-white/90'}>
                {l.text}
              </div>
            ))
          )}
        </pre>

        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
          <select
            className="rounded border border-white/10 bg-[#1a1d23] px-2 py-1.5 font-mono text-xs"
            value={tool}
            onChange={(e) => setTool(e.target.value as ConsoleTool)}
          >
            {TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            ref={inputRef}
            className="flex-1 rounded border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs outline-none focus:border-sky-500"
            placeholder={tool === 'yt-dlp' ? '-F "https://www.youtube.com/watch?v=…"' : 'argumentos…'}
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            onKeyDown={onInputKey}
            spellCheck={false}
          />
          {tool === 'yt-dlp' && (
            <label className="flex shrink-0 items-center gap-1.5 text-xs" title="Adiciona --ffmpeg-location, --js-runtimes (deno), cookies e --encoding utf-8 configurados no app">
              <input type="checkbox" checked={useAppArgs} onChange={(e) => setUseAppArgs(e.target.checked)} />
              usar config. do app
            </label>
          )}
          {running ? (
            <button className="shrink-0 rounded bg-rose-600 px-3 py-1.5 text-xs font-medium hover:bg-rose-500" onClick={() => void window.api.console.kill()}>
              ■ parar
            </button>
          ) : (
            <button className="shrink-0 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium hover:bg-sky-500" onClick={() => void runCmd()}>
              ▶ executar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
