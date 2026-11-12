import type { DatabaseSync } from 'node:sqlite'
import type { ErrorEntry } from '@shared/ipc'
import { classifyError } from '../ytdlp/errors'

// Log de erros (fase 5): cada tentativa que falha vira uma entrada no SQLite (para a tela)
// e uma linha JSON em logs/errors-AAAAMMDD.jsonl (para examinar fora do app).

export interface NewError {
  jobId: string | null
  videoId: string
  playlistId: string | null
  title: string
  url: string
  /** Mensagem original do yt-dlp. */
  message: string
  /** Tipo já classificado (se `undefined`, classifica a mensagem). */
  kind?: string
  command: string | null
  attempt: number
  final: boolean
}

interface Row {
  id: number
  job_id: string | null
  video_id: string
  playlist_id: string | null
  title: string
  url: string
  kind: string
  reason: string
  message: string
  command: string | null
  attempt: number
  final: number
  created_at: number
}

const fromRow = (r: Row): ErrorEntry => ({
  id: r.id, jobId: r.job_id, videoId: r.video_id, playlistId: r.playlist_id, title: r.title, url: r.url, kind: r.kind,
  reason: r.reason, message: r.message, command: r.command, attempt: r.attempt, final: r.final === 1, createdAt: r.created_at
})

/** Nome do arquivo JSONL do dia (data local). */
export function jsonlName(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `errors-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.jsonl`
}

/**
 * @param appendLine grava uma linha no arquivo do dia (injetado para os testes não tocarem no disco)
 */
export function createErrorLog(db: DatabaseSync, appendLine: (fileName: string, line: string) => void) {
  const insert = db.prepare(`
    INSERT INTO errors (job_id, video_id, playlist_id, title, url, kind, reason, message, command, attempt, final, created_at)
    VALUES (:job_id, :video_id, :playlist_id, :title, :url, :kind, :reason, :message, :command, :attempt, :final, :created_at)`)
  const list = db.prepare('SELECT * FROM errors ORDER BY id DESC LIMIT ?')
  const clear = db.prepare('DELETE FROM errors')

  return {
    record(e: NewError): ErrorEntry {
      const c = classifyError(e.message)
      const kind = e.kind ?? c.kind
      // o motivo vem da classificação; se o tipo foi forçado e difere, usa o próprio tipo
      const reason = kind === c.kind ? c.reason : kind
      const createdAt = Date.now()
      const res = insert.run({
        job_id: e.jobId, video_id: e.videoId, playlist_id: e.playlistId, title: e.title, url: e.url, kind, reason,
        message: e.message, command: e.command, attempt: e.attempt, final: e.final ? 1 : 0, created_at: createdAt
      })
      const entry: ErrorEntry = { ...e, id: Number(res.lastInsertRowid), kind, reason, createdAt }
      try {
        appendLine(jsonlName(createdAt), JSON.stringify({ ...entry, createdAt: new Date(createdAt).toISOString() }))
      } catch {
        // o log em arquivo é auxiliar: falha ao gravar não pode derrubar a fila
      }
      return entry
    },
    list(limit = 5000): ErrorEntry[] {
      return (list.all(limit) as unknown as Row[]).map(fromRow)
    },
    clear(): void {
      clear.run()
    }
  }
}

export type ErrorLog = ReturnType<typeof createErrorLog>
