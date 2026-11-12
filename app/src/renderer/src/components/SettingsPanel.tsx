import { useState } from 'react'
import type { AntiBlockProfile, CookieBrowser, CookiesTestResult, Settings } from '@shared/ipc'
import { PROFILES } from '@shared/antiblock'
import { matchingPreset, presetValuesFrom, upsertPreset } from '@shared/presets'
import { useSettings } from '@renderer/store/settings'

const input =
  'w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none focus:border-sky-500'
const select = 'w-full rounded border border-white/10 bg-[#1a1d23] px-1 py-1'
const smallBtn = 'shrink-0 rounded bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-40'

const BROWSERS: Array<{ value: CookieBrowser | ''; label: string }> = [
  { value: '', label: 'Não usar cookies' },
  { value: 'firefox', label: 'Firefox (recomendado)' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'edge', label: 'Edge' },
  { value: 'brave', label: 'Brave' },
  { value: 'opera', label: 'Opera' },
  { value: 'vivaldi', label: 'Vivaldi' },
  { value: 'chromium', label: 'Chromium' }
]

export function SettingsPanel() {
  // carregado pelo App no startup
  const settings = useSettings((s) => s.settings)
  const save = useSettings((s) => s.save)
  if (!settings) return null

  return (
    <section className="space-y-3 rounded-lg border border-white/10 bg-white/2 p-3 text-xs">
      <h2 className="text-sm font-semibold">Configurações</h2>

      <PresetsSection settings={settings} save={save} />

      <label className="block space-y-1">
        <span className="text-white/60">Pasta de destino</span>
        <div className="flex gap-1">
          <input className={input} value={settings.outputDir} readOnly title={settings.outputDir} />
          <button
            className={smallBtn}
            onClick={async () => {
              const dir = await window.api.dialog.pickFolder(settings.outputDir)
              if (dir) await save({ outputDir: dir })
            }}
          >
            escolher
          </button>
        </div>
      </label>

      {/* inputs de texto não controlados: `key` força recriar quando um preset muda o valor */}
      <label className="block space-y-1">
        <span className="text-white/60">Nome do arquivo (template do yt-dlp)</span>
        <input
          key={`tpl-${settings.outputTemplate}`}
          className={input}
          defaultValue={settings.outputTemplate}
          onBlur={(e) => e.target.value.trim() && void save({ outputTemplate: e.target.value.trim() })}
        />
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.cropThumbnail} onChange={(e) => void save({ cropThumbnail: e.target.checked })} />
        <span>Recortar capa para quadrado</span>
        <span className="text-white/30">(desligado = proporção original)</span>
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.numberFiles} onChange={(e) => void save({ numberFiles: e.target.checked })} />
        <span>Numerar arquivos na ordem escolhida</span>
        <span className="text-white/30">("001 - Título")</span>
      </label>

      <div className="space-y-1">
        <span className="text-white/60">Proteção contra bloqueio do YouTube</span>
        <select className={select} value={settings.antiBlock} onChange={(e) => void save({ antiBlock: e.target.value as AntiBlockProfile })}>
          {(Object.keys(PROFILES) as AntiBlockProfile[]).map((k) => (
            <option key={k} value={k}>{PROFILES[k].label}</option>
          ))}
        </select>
        <p className="text-white/40">{PROFILES[settings.antiBlock]?.description}</p>
      </div>

      <label className="block space-y-1">
        <span className="text-white/60">Limite de velocidade</span>
        <input
          key={`rate-${settings.limitRate}`}
          className={`${input} font-mono`}
          placeholder="sem limite (ex.: 2M, 500K)"
          defaultValue={settings.limitRate}
          onBlur={(e) => void save({ limitRate: e.target.value.trim() })}
        />
      </label>

      <CookiesSection settings={settings} save={save} />

      <div className="space-y-1.5">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.autoM3u} onChange={(e) => void save({ autoM3u: e.target.checked })} />
          <span>Gerar playlist .m3u8 ao terminar a fila</span>
        </label>
        <label className="flex items-center gap-2" title="Ao gerar o M3U, as datas de criação/modificação dos arquivos seguem a ordem da playlist (ordenar a pasta por data = ordem da playlist)">
          <input type="checkbox" checked={settings.orderFileDates} onChange={(e) => void save({ orderFileDates: e.target.checked })} />
          <span>Ajustar datas dos arquivos na ordem da playlist</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.clipboardWatch} onChange={(e) => void save({ clipboardWatch: e.target.checked })} />
          <span>Oferecer carregar links do YouTube copiados</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.notifyOnFinish} onChange={(e) => void save({ notifyOnFinish: e.target.checked })} />
          <span>Notificar ao terminar / pausar por bloqueio</span>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-white/60">Argumentos extras do yt-dlp</span>
        <input
          key={`extra-${settings.extraArgs}`}
          className={`${input} font-mono`}
          placeholder="ex.: --limit-rate 2M"
          defaultValue={settings.extraArgs}
          onBlur={(e) => void save({ extraArgs: e.target.value })}
        />
      </label>

      <label className="flex items-center gap-2">
        <span className="text-white/60">Canal do yt-dlp</span>
        <select
          className="rounded border border-white/10 bg-[#1a1d23] px-1 py-0.5"
          value={settings.ytdlpChannel}
          onChange={(e) => void save({ ytdlpChannel: e.target.value as Settings['ytdlpChannel'] })}
        >
          <option value="stable">stable</option>
          <option value="nightly">nightly</option>
        </select>
      </label>
    </section>
  )
}

interface SectionProps {
  settings: Settings
  save(patch: Partial<Settings>): Promise<void>
}

/** Presets: salvar as configurações de download atuais com um nome e reaplicar depois. */
function PresetsSection({ settings, save }: SectionProps) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const active = matchingPreset(settings, settings.presets)

  const saveAs = async (): Promise<void> => {
    try {
      const presets = upsertPreset(settings.presets, name, presetValuesFrom(settings), () => crypto.randomUUID())
      await save({ presets })
      setNaming(false)
      setName('')
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-1 rounded border border-white/10 p-2">
      <div className="flex items-center gap-1">
        <span className="flex-1 text-white/60">Preset</span>
        {active && (
          <button
            className="text-white/40 hover:text-rose-300"
            title={`Excluir o preset "${active.name}"`}
            onClick={() => void save({ presets: settings.presets.filter((p) => p.id !== active.id) })}
          >
            excluir
          </button>
        )}
      </div>
      <div className="flex gap-1">
        <select
          className={select}
          value={active?.id ?? ''}
          onChange={(e) => {
            const p = settings.presets.find((x) => x.id === e.target.value)
            if (p) void save({ ...p.values })
          }}
        >
          <option value="" disabled>{settings.presets.length ? '(configuração personalizada)' : '(nenhum preset salvo)'}</option>
          {settings.presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {!naming && <button className={smallBtn} onClick={() => setNaming(true)}>salvar…</button>}
      </div>
      {naming && (
        <div className="flex gap-1">
          <input
            className={input}
            autoFocus
            placeholder="nome do preset"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveAs()
              if (e.key === 'Escape') setNaming(false)
            }}
          />
          <button className={smallBtn} onClick={() => void saveAs()}>ok</button>
        </div>
      )}
      {error && <p className="text-rose-300">{error}</p>}
      <p className="text-white/30">Guarda formato, capa, nome do arquivo, numeração, proteção, limite e argumentos extras.</p>
    </div>
  )
}

/** Cookies (R12): navegador ou arquivo cookies.txt, com teste. */
function CookiesSection({ settings, save }: SectionProps) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<CookiesTestResult | null>(null)
  const enabled = !!settings.cookiesBrowser || !!settings.cookiesFile

  const test = async (): Promise<void> => {
    setTesting(true)
    setResult(null)
    try {
      setResult(await window.api.cookies.test())
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-1 rounded border border-white/10 p-2">
      <span className="text-white/60">Cookies (vídeos com restrição de idade, privados seus, membros)</span>
      <select
        className={select}
        value={settings.cookiesBrowser}
        onChange={(e) => {
          setResult(null)
          void save({ cookiesBrowser: e.target.value as CookieBrowser | '' })
        }}
      >
        {BROWSERS.map((b) => (
          <option key={b.value} value={b.value}>{b.label}</option>
        ))}
      </select>
      {settings.cookiesBrowser ? (
        <input
          key={`profile-${settings.cookiesProfile}`}
          className={input}
          placeholder="perfil (opcional, ex.: Profile 1)"
          defaultValue={settings.cookiesProfile}
          onBlur={(e) => void save({ cookiesProfile: e.target.value.trim() })}
        />
      ) : (
        <div className="flex gap-1">
          <input className={input} value={settings.cookiesFile} readOnly placeholder="ou um arquivo cookies.txt" title={settings.cookiesFile} />
          {settings.cookiesFile ? (
            <button className={smallBtn} onClick={() => void save({ cookiesFile: '' })}>remover</button>
          ) : (
            <button
              className={smallBtn}
              onClick={async () => {
                const f = await window.api.dialog.pickFile('cookies.txt (Netscape)', ['txt'])
                if (f) await save({ cookiesFile: f })
              }}
            >
              escolher
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button className={smallBtn} disabled={!enabled || testing} onClick={() => void test()}>
          {testing ? 'testando…' : 'testar'}
        </button>
        {result && <span className={result.ok ? 'text-emerald-300' : 'text-rose-300'}>{result.ok ? '✓ ' : '✗ '}{result.message}</span>}
      </div>
      {settings.cookiesBrowser && settings.cookiesBrowser !== 'firefox' && (
        <p className="text-amber-300/70">Chrome/Edge recentes costumam bloquear a leitura dos cookies; se o teste falhar, feche o navegador ou use o Firefox.</p>
      )}
      <p className="text-white/30">Use com moderação: muitas requisições com a sua conta podem levar a bloqueio dela.</p>
    </div>
  )
}
