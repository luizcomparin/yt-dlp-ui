import { existsSync, statSync } from 'node:fs'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { IpcChannels, type DepName, type DepStatus, type DepsProgress } from '@shared/ipc'
import { binDir } from '../paths'
import { getSettings } from '../settings/store'
import { execCapture } from '../runner'
import { broadcast } from '../events'
import { downloadFile } from './download-file'

// ---------- fontes de download (Windows x64) ----------

const URLS = {
  ytdlp: {
    stable: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    nightly: 'https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe'
  },
  deno: 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip',
  ffmpeg: 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
}

const EXE: Record<DepName, string> = { 'yt-dlp': 'yt-dlp.exe', ffmpeg: 'ffmpeg.exe', deno: 'deno.exe' }

const VERSION_ARGS: Record<DepName, string[]> = { 'yt-dlp': ['--version'], ffmpeg: ['-version'], deno: ['--version'] }

function parseVersion(name: DepName, stdout: string): string | null {
  const first = stdout.split(/\r?\n/)[0]?.trim() ?? ''
  if (!first) return null
  if (name === 'yt-dlp') return first
  return first.match(/(?:version|deno)\s+(\S+)/)?.[1] ?? first
}

// ---------- localização ----------

/** Procura no PATH do sistema (`where.exe`). */
async function whereExe(exe: string): Promise<string | null> {
  const { code, stdout } = await execCapture('where.exe', [exe], 5000)
  if (code !== 0) return null
  return stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null
}

/** Ordem: caminho customizado (só ffmpeg) → binário gerenciado → PATH do sistema. */
async function locate(name: DepName): Promise<{ path: string; source: DepStatus['source'] } | null> {
  if (name === 'ffmpeg') {
    const custom = getSettings().ffmpegPath
    if (custom) {
      const p = existsSync(custom) && statSync(custom).isDirectory() ? join(custom, EXE.ffmpeg) : custom
      if (existsSync(p)) return { path: p, source: 'custom' }
    }
  }
  const managed = join(binDir(), EXE[name])
  if (existsSync(managed)) return { path: managed, source: 'managed' }
  const system = await whereExe(EXE[name])
  if (system) return { path: system, source: 'system' }
  return null
}

export async function getDepStatus(name: DepName): Promise<DepStatus> {
  const found = await locate(name)
  if (!found) return { name, installed: false, path: null, version: null, source: null }
  const { code, stdout, stderr } = await execCapture(found.path, VERSION_ARGS[name])
  if (code !== 0) {
    return { ...found, name, installed: false, version: null, error: (stderr || stdout).trim().slice(0, 300) }
  }
  return { ...found, name, installed: true, version: parseVersion(name, stdout) }
}

export async function getAllDepsStatus(): Promise<DepStatus[]> {
  return Promise.all((['yt-dlp', 'ffmpeg', 'deno'] as const).map(getDepStatus))
}

/** Caminhos prontos para montar comandos do yt-dlp. Lança erro se algo obrigatório faltar. */
export async function resolveToolPaths(): Promise<{ ytdlp: string; ffmpegDir: string; deno: string | null }> {
  const [ytdlp, ffmpeg, deno] = await Promise.all([locate('yt-dlp'), locate('ffmpeg'), locate('deno')])
  const missing = [!ytdlp && 'yt-dlp', !ffmpeg && 'ffmpeg'].filter(Boolean)
  if (missing.length) throw new Error(`Dependências ausentes: ${missing.join(', ')}. Instale pela tela de dependências.`)
  return { ytdlp: ytdlp!.path, ffmpegDir: dirname(ffmpeg!.path), deno: deno?.path ?? null }
}

// ---------- instalação ----------

const inFlight = new Map<DepName, Promise<DepStatus>>()

function emit(p: DepsProgress): void {
  broadcast(IpcChannels.depsProgress, p)
}

/** Extrai um .zip com o tar.exe do Windows (bsdtar, presente desde o Windows 10). */
async function extractZip(zip: string, destDir: string): Promise<void> {
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  const { code, stderr } = await execCapture(tar, ['-xf', zip, '-C', destDir], 5 * 60 * 1000)
  if (code !== 0) throw new Error(`Falha ao extrair ${zip}: ${stderr}`)
}

/** Procura recursivamente um arquivo pelo nome. */
async function findFile(dir: string, fileName: string): Promise<string | null> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const hit = await findFile(full, fileName)
      if (hit) return hit
    } else if (entry.name.toLowerCase() === fileName.toLowerCase()) {
      return full
    }
  }
  return null
}

async function doInstall(name: DepName): Promise<DepStatus> {
  if (process.platform !== 'win32') throw new Error('Instalação automática disponível apenas no Windows.')
  const dir = binDir()
  await mkdir(dir, { recursive: true })
  const progress = (received: number, total: number | null): void =>
    emit({ name, phase: 'downloading', received, total: total ?? undefined })

  if (name === 'yt-dlp') {
    await downloadFile(URLS.ytdlp[getSettings().ytdlpChannel], join(dir, EXE['yt-dlp']), progress)
  } else {
    const zip = join(dir, `${name}.zip`)
    const tmp = join(dir, `.tmp-${name}`)
    await rm(tmp, { recursive: true, force: true })
    await mkdir(tmp, { recursive: true })
    try {
      await downloadFile(name === 'deno' ? URLS.deno : URLS.ffmpeg, zip, progress)
      emit({ name, phase: 'extracting' })
      await extractZip(zip, tmp)
      const wanted = name === 'deno' ? ['deno.exe'] : ['ffmpeg.exe', 'ffprobe.exe']
      for (const file of wanted) {
        const found = await findFile(tmp, file)
        if (!found) throw new Error(`${file} não encontrado no pacote baixado.`)
        await rename(found, join(dir, file))
      }
    } finally {
      await rm(zip, { force: true })
      await rm(tmp, { recursive: true, force: true })
    }
  }

  const status = await getDepStatus(name)
  emit({ name, phase: 'done' })
  return status
}

/** Baixa (ou rebaixa) uma dependência para a pasta gerenciada. Chamadas simultâneas reaproveitam a mesma promise. */
export function installDep(name: DepName): Promise<DepStatus> {
  const running = inFlight.get(name)
  if (running) return running
  const p = doInstall(name)
    .catch((e: Error) => {
      emit({ name, phase: 'error', message: e.message })
      throw e
    })
    .finally(() => inFlight.delete(name))
  inFlight.set(name, p)
  return p
}

/** Atualiza o yt-dlp gerenciado com o updater embutido (`--update-to <canal>`). */
export async function updateYtdlp(): Promise<{ output: string; status: DepStatus }> {
  const found = await locate('yt-dlp')
  if (!found) throw new Error('yt-dlp não instalado.')
  if (found.source !== 'managed') {
    throw new Error(`O yt-dlp em uso vem do sistema (${found.path}). Atualize-o pelo gerenciador que o instalou.`)
  }
  const { stdout, stderr } = await execCapture(found.path, ['--update-to', getSettings().ytdlpChannel], 3 * 60 * 1000)
  return { output: `${stdout}${stderr}`.trim(), status: await getDepStatus('yt-dlp') }
}
