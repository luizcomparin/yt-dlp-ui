import { spawn, execFile } from 'node:child_process'
import { LineSplitter } from './lines'

export interface RunOptions {
  cwd?: string
  env?: Record<string, string>
  onStdout?: (line: string) => void
  onStderr?: (line: string) => void
}

export interface RunResult {
  code: number | null
  /** true se o processo foi encerrado via `kill()`. */
  killed: boolean
}

export interface RunHandle {
  pid: number | undefined
  done: Promise<RunResult>
  /** Mata o processo e toda a árvore de filhos (ffmpeg, deno…). */
  kill(): Promise<void>
}

/** Ambiente para os subprocessos: força UTF-8 no Python (yt-dlp) e limpa variáveis do Electron. */
export function childEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ...extra }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

/** Executa um binário lendo stdout/stderr linha a linha. */
export function run(bin: string, args: string[], opts: RunOptions = {}): RunHandle {
  const child = spawn(bin, args, {
    cwd: opts.cwd,
    env: childEnv(opts.env),
    windowsHide: true
  })

  let killed = false
  const out = new LineSplitter((l) => opts.onStdout?.(l))
  const err = new LineSplitter((l) => opts.onStderr?.(l))
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (c: string) => out.push(c))
  child.stderr.on('data', (c: string) => err.push(c))

  const done = new Promise<RunResult>((resolve) => {
    child.on('error', (e) => {
      opts.onStderr?.(`[runner] falha ao iniciar ${bin}: ${e.message}`)
      resolve({ code: null, killed })
    })
    child.on('close', (code) => {
      out.flush()
      err.flush()
      resolve({ code, killed })
    })
  })

  return {
    pid: child.pid,
    done,
    kill: async () => {
      if (child.exitCode !== null || child.pid === undefined) return
      killed = true
      await killTree(child.pid)
    }
  }
}

/**
 * Mata um processo e todos os descendentes.
 * No Windows, matar só o pai deixa filhos órfãos (ex.: ffmpeg continua rodando),
 * por isso usamos `taskkill /T /F`.
 */
export function killTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve())
    } else {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // já terminou
      }
      resolve()
    }
  })
}

/** Executa e devolve a saída completa (para comandos curtos como `--version`). */
export function execCapture(
  bin: string,
  args: string[],
  timeoutMs = 20000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { env: childEnv(), windowsHide: true, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : null) : 0
        resolve({ code, stdout, stderr })
      }
    )
  })
}
