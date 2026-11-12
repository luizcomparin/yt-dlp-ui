import { classifyError } from '../ytdlp/errors'

// Decide o que fazer quando um processo de download termina. Função pura (testada em policy.test.ts).

export const MAX_ATTEMPTS = 3
/** Espera antes de re-tentar erro transitório: 15 s, 30 s, 45 s… */
export const RETRY_DELAY_MS = 15_000

export type Outcome =
  | { kind: 'done'; filePath: string | null }
  | { kind: 'skipped' }
  | { kind: 'retry'; delayMs: number; error: string; errorKind: string }
  | { kind: 'rate-limit'; error: string }
  | { kind: 'error'; error: string; errorKind: string }

export interface ExitInfo {
  code: number | null
  filePath: string | null
  /** yt-dlp disse que o vídeo já está no archive. */
  archived: boolean
  /** Mensagens das linhas `ERROR:` (sem o prefixo). */
  errors: string[]
  /** Últimas linhas de stderr (para erro sem linha ERROR:). */
  stderrTail: string[]
  /** Tentativas já feitas ANTES desta. */
  attempts: number
}

export function decideOutcome(x: ExitInfo): Outcome {
  if (x.archived) return { kind: 'skipped' }
  if (x.code === 0) {
    // sucesso sem arquivo final = o yt-dlp pulou o vídeo (archive ou arquivo existente).
    // Com --print o yt-dlp fica em modo quiet e não imprime o aviso do archive.
    return x.filePath ? { kind: 'done', filePath: x.filePath } : { kind: 'skipped' }
  }

  // bloqueio em qualquer linha de erro tem prioridade (pode vir seguido de outros erros)
  const blocked = x.errors.find((e) => classifyError(e).kind === 'rate-limit')
  if (blocked) return { kind: 'rate-limit', error: blocked }

  // 403 em qualquer linha também tem prioridade: é temporário mesmo que venha seguido de outro erro
  const forbidden = x.errors.find((e) => classifyError(e).kind === 'forbidden')
  const raw = forbidden ?? x.errors.at(-1) ?? (x.stderrTail.slice(-3).join('\n') || `yt-dlp saiu com código ${x.code}`)
  const c = classifyError(raw)
  if (c.kind === 'rate-limit') return { kind: 'rate-limit', error: raw }
  // erro sem linha ERROR: (processo morreu, etc.) é tratado como transitório
  const transient = c.transient || x.errors.length === 0
  if (transient && x.attempts + 1 < MAX_ATTEMPTS) {
    return { kind: 'retry', delayMs: RETRY_DELAY_MS * (x.attempts + 1), error: raw, errorKind: c.kind }
  }
  return { kind: 'error', error: raw, errorKind: c.kind }
}

/** Template com prefixo numérico da posição no lote ("001 - %(title)s.%(ext)s"). */
export function numberedTemplate(template: string, n: number, total: number): string {
  const width = Math.max(2, String(total).length)
  return `${String(n).padStart(width, '0')} - ${template}`
}
