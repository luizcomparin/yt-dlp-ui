import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Settings } from '@shared/ipc'
import { IpcChannels } from '@shared/ipc'
import { defaultOutputDir, settingsFile } from '../paths'
import { broadcast } from '../events'

const defaults = (): Settings => ({
  outputDir: defaultOutputDir(),
  outputTemplate: '%(title)s.%(ext)s',
  cropThumbnail: true,
  audioFormat: 'best',
  ffmpegPath: null,
  ytdlpChannel: 'stable',
  extraArgs: '',
  antiBlock: 'safe',
  limitRate: '',
  numberFiles: false,
  cookiesBrowser: '',
  cookiesProfile: '',
  cookiesFile: '',
  presets: [],
  autoM3u: true,
  orderFileDates: true,
  clipboardWatch: true,
  notifyOnFinish: true
})

let cache: Settings | null = null

/** Lê as configurações (settings.json em userData), completando com os padrões. */
export function getSettings(): Settings {
  if (cache) return cache
  let stored: Partial<Settings> = {}
  try {
    stored = JSON.parse(readFileSync(settingsFile(), 'utf8'))
  } catch {
    // arquivo inexistente ou inválido → usa padrões
  }
  cache = { ...defaults(), ...stored }
  return cache
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  mkdirSync(dirname(settingsFile()), { recursive: true })
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  cache = next
  // mantém todas as janelas em dia, venha a mudança de onde vier
  broadcast(IpcChannels.settingsChanged, next)
  return next
}
