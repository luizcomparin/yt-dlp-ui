import { run, type RunHandle } from '../runner'
import { buildEnrichArgs } from '../ytdlp/args'
import { parseLine } from '../ytdlp/parse'
import { INFO_FIELDS, parseEnrichInfo, watchUrl, type EnrichedInfo } from '../ytdlp/info'
import { classifyError, splitVideoError, type ClassifiedError } from '../ytdlp/errors'

export type EnrichResult =
  | { id: string; ok: true; info: EnrichedInfo }
  | { id: string; ok: false; error: ClassifiedError }

export interface EnrichOptions {
  ytdlp: string
  denoPath: string | null
  /** Processos yt-dlp em paralelo. Baixo por padrão (anti-bloqueio). */
  concurrency: number
  /** Vídeos por processo (amortiza a inicialização do yt-dlp, ~1 s). */
  chunkSize: number
  /** Argumentos extras (ex.: --sleep-requests, cookies). */
  extraArgs?: string[]
  onResult(r: EnrichResult): void
  /** Chamado uma vez se o YouTube bloquear (429 / "not a bot"); o enriquecimento para. */
  onRateLimit(message: string): void
}

/**
 * Enriquece vídeos em lotes: `concurrency` workers, cada um processando `chunkSize` URLs por processo.
 * Vídeos sem resultado (erro transitório ou processo interrompido) ficam sem callback — continuam "pending".
 */
export function enrichVideos(ids: string[], o: EnrichOptions): { done: Promise<void>; cancel(): Promise<void> } {
  const queue = [...ids]
  const running = new Set<RunHandle>()
  let stopped = false

  const runChunk = (chunk: string[]): Promise<void> => {
    const pending = new Set(chunk)
    const onLine = (line: string): void => {
      const p = parseLine(line)
      if (p.type === 'info') {
        const info = parseEnrichInfo(p.data)
        if (info && pending.delete(info.id)) o.onResult({ id: info.id, ok: true, info })
      } else if (p.type === 'error') {
        const { id, message } = splitVideoError(p.message)
        const error = classifyError(message)
        if (error.kind === 'rate-limit') {
          if (!stopped) {
            stopped = true
            o.onRateLimit(message)
            void cancelAll()
          }
          return
        }
        if (id && pending.has(id) && !error.transient) {
          pending.delete(id)
          o.onResult({ id, ok: false, error })
        }
      }
    }
    const handle = run(o.ytdlp, buildEnrichArgs(chunk.map(watchUrl), INFO_FIELDS, o.denoPath, o.extraArgs), {
      onStdout: onLine,
      onStderr: onLine
    })
    running.add(handle)
    return handle.done.then(() => {
      running.delete(handle)
    })
  }

  const worker = async (): Promise<void> => {
    while (!stopped && queue.length > 0) {
      await runChunk(queue.splice(0, o.chunkSize))
    }
  }

  const cancelAll = async (): Promise<void> => {
    stopped = true
    await Promise.all([...running].map((h) => h.kill()))
  }

  const done = Promise.all(Array.from({ length: Math.max(1, o.concurrency) }, worker)).then(() => undefined)
  return { done, cancel: cancelAll }
}
