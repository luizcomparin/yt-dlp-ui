import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { IpcChannels, type ConsoleEvent, type ConsoleRunRequest } from '@shared/ipc'
import { broadcast } from '../events'
import { getSettings } from '../settings/store'
import { resolveToolPaths } from '../deps'
import { execCapture, run, type RunHandle } from '../runner'
import { baseArgs, cookieArgs } from '../ytdlp/args'
import { formatCommand, splitArgs } from '../ytdlp/split-args'

// Console (R8): executa yt-dlp/ffmpeg/ffprobe/deno com argumentos livres e transmite a saída.
// Uma execução por vez. O diretório de trabalho é a pasta de destino (saídas caem lá).

const FLUSH_MS = 100
const MAX_LINES_PER_FLUSH = 500

let current: { runId: string; handle: RunHandle } | null = null

const send = (e: ConsoleEvent): void => broadcast(IpcChannels.consoleEvent, e)

/** Argumentos do app para o yt-dlp no console (sem --no-playlist: o usuário decide). */
function appArgsForConsole(ffmpegDir: string, deno: string | null): string[] {
  return [...baseArgs(ffmpegDir, deno, false), ...cookieArgs(getSettings())]
}

export async function runConsole(req: ConsoleRunRequest): Promise<{ runId: string }> {
  if (current) throw new Error('Já existe um comando em execução. Pare-o antes de iniciar outro.')
  const tools = await resolveToolPaths()
  const bins: Record<ConsoleRunRequest['tool'], string | null> = {
    'yt-dlp': tools.ytdlp,
    ffmpeg: join(tools.ffmpegDir, 'ffmpeg.exe'),
    ffprobe: join(tools.ffmpegDir, 'ffprobe.exe'),
    deno: tools.deno
  }
  const bin = bins[req.tool]
  if (!bin) throw new Error(`${req.tool} não está instalado.`)

  const userArgs = splitArgs(req.args) // lança erro legível com aspas não fechadas
  const args = req.tool === 'yt-dlp' && req.useAppArgs ? [...appArgsForConsole(tools.ffmpegDir, tools.deno), ...userArgs] : userArgs
  const cwd = getSettings().outputDir
  await mkdir(cwd, { recursive: true })

  const runId = randomUUID()
  const started = Date.now()
  let buffer: Array<{ stream: 'stdout' | 'stderr'; text: string }> = []
  let timer: NodeJS.Timeout | null = null
  const flush = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    while (buffer.length) send({ runId, type: 'lines', lines: buffer.splice(0, MAX_LINES_PER_FLUSH) })
  }
  const push = (stream: 'stdout' | 'stderr') => (text: string) => {
    buffer.push({ stream, text })
    timer ??= setTimeout(flush, FLUSH_MS)
  }

  send({ runId, type: 'start', command: formatCommand(bin, args), cwd })
  const handle = run(bin, args, { cwd, onStdout: push('stdout'), onStderr: push('stderr') })
  current = { runId, handle }
  void handle.done.then(({ code, killed }) => {
    flush()
    buffer = []
    current = null
    send({ runId, type: 'exit', code, killed, ms: Date.now() - started })
  })
  return { runId }
}

export async function killConsole(): Promise<void> {
  await current?.handle.kill()
}

/**
 * Testa os cookies configurados: extrai um vídeo público simples com os cookies.
 * Falhas típicas: navegador aberto travando o banco (Chrome/Edge), perfil inexistente,
 * criptografia do Chrome (app-bound) que o yt-dlp não consegue ler.
 */
export async function testCookies(): Promise<{ ok: boolean; message: string }> {
  const s = getSettings()
  const cookies = cookieArgs(s)
  if (!cookies.length) return { ok: false, message: 'Nenhum navegador ou arquivo de cookies configurado.' }
  const tools = await resolveToolPaths()
  const { code, stdout, stderr } = await execCapture(
    tools.ytdlp,
    [...baseArgs(tools.ffmpegDir, tools.deno, true), ...cookies, '--simulate', '--print', 'ok %(id)s', '--', 'https://www.youtube.com/watch?v=jNQXAC9IVRw'],
    90_000
  )
  const errors = stderr.split(/\r?\n/).filter((l) => l.startsWith('ERROR:'))
  if (code === 0 && stdout.includes('ok jNQXAC9IVRw')) {
    const extracted = stderr.match(/Extracted (\d+) cookies/i)?.[1]
    return { ok: true, message: `Cookies funcionando${extracted ? ` (${extracted} cookies lidos)` : ''}.` }
  }
  const raw = errors.at(-1) ?? stderr.trim().split(/\r?\n/).slice(-2).join(' ') ?? `código ${code}`
  let hint = ''
  if (/could not copy|database is locked|permission denied/i.test(raw)) hint = ' Feche o navegador e tente de novo.'
  else if (/decrypt|DPAPI|app.bound/i.test(raw)) hint = ' O Chrome/Edge recentes criptografam os cookies de um jeito que o yt-dlp não lê; prefira o Firefox ou um arquivo cookies.txt.'
  else if (/could not find|no such|not found/i.test(raw)) hint = ' Navegador ou perfil não encontrado.'
  return { ok: false, message: `${raw.replace(/^ERROR:\s*/, '')}${hint ? ` —${hint}` : ''}` }
}
