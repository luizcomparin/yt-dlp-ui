// Visão da fila (painel): agrupar por status, ocultar grupos e ordenar. Funções puras (queueView.test.ts).
import type { JobStatus, QueueJob } from '@shared/ipc'

export type QueueGroup = 'running' | 'queued' | 'paused' | 'done' | 'error'

/** Grupos na ordem em que aparecem nos contadores clicáveis. */
export const QUEUE_GROUPS: Array<{ id: QueueGroup; label: string; cls: string }> = [
  { id: 'running', label: 'baixando', cls: 'text-sky-300' },
  { id: 'queued', label: 'na fila', cls: 'text-white/70' },
  { id: 'paused', label: 'pausados', cls: 'text-amber-300' },
  { id: 'done', label: 'concluídos', cls: 'text-emerald-400' },
  { id: 'error', label: 'erros', cls: 'text-rose-400' }
]

export function groupOf(status: JobStatus): QueueGroup {
  switch (status) {
    case 'running':
    case 'queued':
    case 'paused':
    case 'error':
      return status
    default:
      return 'done' // done + skipped (já existia)
  }
}

export type QueueSort = 'queue' | 'finished-desc' | 'finished-asc' | 'errors-first' | 'pending-first'

export const QUEUE_SORTS: Array<{ id: QueueSort; label: string }> = [
  { id: 'queue', label: 'Ordem da fila' },
  { id: 'finished-desc', label: 'Término: mais recente' },
  { id: 'finished-asc', label: 'Término: mais antigo' },
  { id: 'errors-first', label: 'Erros primeiro' },
  { id: 'pending-first', label: 'Pendentes primeiro' }
]

/** Prioridade de cada grupo nas ordenações por status (menor = antes). */
const ERRORS_FIRST: Record<QueueGroup, number> = { error: 0, running: 1, queued: 2, paused: 3, done: 4 }
const PENDING_FIRST: Record<QueueGroup, number> = { running: 0, queued: 1, paused: 2, error: 3, done: 4 }

export function countByGroup(jobs: QueueJob[]): Record<QueueGroup, number> {
  const out: Record<QueueGroup, number> = { running: 0, queued: 0, paused: 0, done: 0, error: 0 }
  for (const j of jobs) out[groupOf(j.status)]++
  return out
}

/**
 * Filtra os grupos ocultos e ordena. Empates (e jobs sem data de término nas ordenações por término,
 * que vão para o fim) seguem a ordem da fila (`position`).
 */
export function viewJobs(jobs: QueueJob[], hidden: ReadonlySet<QueueGroup>, sort: QueueSort): QueueJob[] {
  const list = jobs.filter((j) => !hidden.has(groupOf(j.status)))
  const byPos = (a: QueueJob, b: QueueJob): number => a.position - b.position
  const cmp = ((): ((a: QueueJob, b: QueueJob) => number) => {
    switch (sort) {
      case 'finished-desc':
      case 'finished-asc': {
        const sign = sort === 'finished-desc' ? -1 : 1
        return (a, b) => {
          if (a.finishedAt == null && b.finishedAt == null) return byPos(a, b)
          if (a.finishedAt == null) return 1
          if (b.finishedAt == null) return -1
          return (a.finishedAt - b.finishedAt) * sign || byPos(a, b)
        }
      }
      case 'errors-first':
        return (a, b) => ERRORS_FIRST[groupOf(a.status)] - ERRORS_FIRST[groupOf(b.status)] || byPos(a, b)
      case 'pending-first':
        return (a, b) => PENDING_FIRST[groupOf(a.status)] - PENDING_FIRST[groupOf(b.status)] || byPos(a, b)
      default:
        return byPos
    }
  })()
  return list.sort(cmp)
}
