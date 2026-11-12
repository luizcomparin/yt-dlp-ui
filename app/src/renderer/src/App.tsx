import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc'
import { DepsPanel } from './components/DepsPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { QueuePanel } from './components/QueuePanel'
import { ErrorsDialog } from './components/ErrorsDialog'
import { ConsoleDialog } from './components/ConsoleDialog'
import { useConsole } from './store/console'
import { useErrors } from './store/errors'
import { PlaylistView } from './components/PlaylistView'
import { useQueue } from './store/queue'
import { usePlaylist } from './store/playlist'
import { useDeps } from './store/deps'
import { useSettings } from './store/settings'
import { usePersistentState } from './lib/usePersistentState'
import { lastUrl } from './store/session'

const toggleBtn = (on: boolean): string =>
  `shrink-0 rounded-md px-3 py-1.5 text-sm ${on ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  // reabre com o link da última playlist (a sessão recarrega ela no startup)
  const [url, setUrl] = useState(() => lastUrl())
  const counts = useQueue((s) => s.state?.counts)
  const activeJobs = counts ? counts.running + counts.queued : 0
  const outputDir = useSettings((s) => s.settings?.outputDir)
  const load = usePlaylist((s) => s.load)
  const deps = useDeps((s) => s.statuses)
  const refreshDeps = useDeps((s) => s.refresh)
  const [showSettings, setShowSettings] = usePersistentState('ui.showSettings', true)
  const [showDownloads, setShowDownloads] = usePersistentState('ui.showQueue', true)

  const [showErrors, setShowErrors] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const consoleRunning = useConsole((s) => s.running)
  const unseenErrors = useErrors((s) => s.unseen)
  const failedJobs = counts?.error ?? 0

  const missingDeps = deps.some((d) => d.name !== 'deno' && !d.installed)

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
    void refreshDeps()
    void useSettings.getState().load()
  }, [refreshDeps])

  // R11: link do YouTube copiado → oferece carregar (some sozinho após 20 s)
  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | null = null
    const off = window.api.clipboard.onUrl((u) => {
      if (u === usePlaylist.getState().url) return
      setClipUrl(u)
      if (hide) clearTimeout(hide)
      hide = setTimeout(() => setClipUrl(null), 20_000)
    })
    return () => {
      off()
      if (hide) clearTimeout(hide)
    }
  }, [])

  // trocar a pasta de destino muda o que conta como "já baixada"
  useEffect(() => {
    if (outputDir) void usePlaylist.getState().refreshFolder(outputDir)
  }, [outputDir])

  // sem yt-dlp/ffmpeg o app não funciona: abre o painel para o usuário instalar
  useEffect(() => {
    if (missingDeps) setShowSettings(true)
  }, [missingDeps, setShowSettings])

  const submit = (): void => {
    const target = url.trim()
    if (target) void load(target)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button className={toggleBtn(showSettings)} onClick={() => setShowSettings(!showSettings)} title="Dependências e configurações">
          ⚙{missingDeps && <span className="ml-1 text-rose-400">●</span>}
        </button>
        <input
          className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-sky-500"
          placeholder="Cole o link de uma playlist ou vídeo do YouTube…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button
          className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
          disabled={!url.trim()}
          onClick={submit}
        >
          Carregar
        </button>
        <button
          className={`shrink-0 rounded-md px-3 py-1.5 font-mono text-sm ${consoleRunning ? 'bg-sky-500/20 text-sky-300' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
          onClick={() => setShowConsole(true)}
          title="Console: executar comandos do yt-dlp, ffmpeg, ffprobe e deno"
        >
          {'>_'}
        </button>
        <button
          className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${failedJobs || unseenErrors ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
          onClick={() => setShowErrors(true)}
          title="Log de erros: falhas de download e faixas indisponíveis"
        >
          Erros{failedJobs > 0 && ` (${failedJobs})`}
          {unseenErrors > 0 && <span className="ml-1">●</span>}
        </button>
        <button className={toggleBtn(showDownloads)} onClick={() => setShowDownloads(!showDownloads)}>
          Fila{activeJobs > 0 && ` (${activeJobs})`}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {showSettings && (
          <aside className="w-72 shrink-0 space-y-3 overflow-auto border-r border-white/10 p-3">
            <DepsPanel />
            <SettingsPanel />
          </aside>
        )}
        <main className="min-w-0 flex-1">
          <PlaylistView />
        </main>
        {showDownloads && (
          <aside className="w-80 shrink-0 border-l border-white/10">
            <QueuePanel />
          </aside>
        )}
      </div>

      {showErrors && <ErrorsDialog onClose={() => setShowErrors(false)} />}
      {showConsole && <ConsoleDialog onClose={() => setShowConsole(false)} />}

      {clipUrl && (
        <div className="fixed top-16 right-4 z-40 w-96 rounded-lg border border-sky-500/30 bg-[#161a21] p-3 text-xs shadow-2xl" role="status">
          <div className="mb-1 font-medium">Link do YouTube copiado</div>
          <div className="mb-2 truncate text-white/50" title={clipUrl}>{clipUrl}</div>
          <div className="flex justify-end gap-2">
            <button className="rounded px-2 py-1 text-white/50 hover:bg-white/10" onClick={() => setClipUrl(null)}>ignorar</button>
            <button
              className="rounded bg-sky-600 px-3 py-1 font-medium hover:bg-sky-500"
              onClick={() => {
                setUrl(clipUrl)
                void load(clipUrl)
                setClipUrl(null)
              }}
            >
              Carregar
            </button>
          </div>
        </div>
      )}

      <footer className="border-t border-white/10 px-4 py-1.5 text-xs text-white/40">
        {info ? `yt-dlp UI v${info.version} · Electron ${info.electron} · Node ${info.node}` : 'conectando…'}
      </footer>
    </div>
  )
}
