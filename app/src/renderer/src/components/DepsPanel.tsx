import { useDeps } from '@renderer/store/deps'
import { formatBytes } from '@renderer/lib/format'

const SOURCE_LABEL = { managed: 'gerenciado', system: 'sistema', custom: 'customizado' } as const

export function DepsPanel() {
  // a verificação inicial é feita pelo App (para saber se faltam dependências mesmo com o painel fechado)
  const { statuses, loading, progress, message, refresh, install, updateYtdlp } = useDeps()

  return (
    <section className="rounded-lg border border-white/10 bg-white/2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Dependências</h2>
        <button className="text-xs text-sky-400 hover:underline" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'verificando…' : 'verificar'}
        </button>
      </div>

      <ul className="space-y-2">
        {statuses.map((d) => {
          const p = progress[d.name]
          const busy = p && (p.phase === 'downloading' || p.phase === 'extracting')
          return (
            <li key={d.name} className="flex items-start gap-2 text-xs">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${d.installed ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 whitespace-nowrap font-medium">{d.name}</span>
                  <span className="truncate text-white/50" title={d.version ?? ''}>{d.version ?? 'não encontrado'}</span>
                </div>
                {d.path && (
                  <div className="truncate text-white/30" title={d.path}>
                    {d.source && `${SOURCE_LABEL[d.source]} · `}
                    {d.path}
                  </div>
                )}
                {d.error && <div className="text-rose-400">{d.error}</div>}
                {busy && (
                  <div className="text-sky-400">
                    {p.phase === 'extracting'
                      ? 'extraindo…'
                      : `baixando ${formatBytes(p.received)}${p.total ? ` / ${formatBytes(p.total)}` : ''}`}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                {d.name === 'yt-dlp' && d.source === 'managed' && (
                  <button className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20" onClick={() => void updateYtdlp()}>
                    atualizar
                  </button>
                )}
                {(!d.installed || d.source === 'managed') && (
                  <button
                    className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20 disabled:opacity-40"
                    disabled={busy}
                    onClick={() => void install(d.name)}
                  >
                    {d.installed ? 'reinstalar' : 'instalar'}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {message && <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-white/60">{message}</pre>}
    </section>
  )
}
