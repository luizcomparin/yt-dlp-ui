import { describe, expect, it } from 'vitest'
import type { JobStatus, QueueJob } from '@shared/ipc'
import { countByGroup, viewJobs, type QueueGroup } from './queueView'

const job = (position: number, status: JobStatus, finishedAt: number | null = null): QueueJob => ({
  id: `j${position}`, videoId: `v${position}`, playlistId: null, url: '', title: `t${position}`, position, status, attempts: 0,
  progress: null, postprocessor: null, outputDir: 'C:\\M', filePath: null, error: null, errorKind: null, command: null,
  createdAt: 0, startedAt: null, finishedAt
})

const jobs = [
  job(1, 'done', 300),
  job(2, 'error', 200),
  job(3, 'queued'),
  job(4, 'skipped', 100),
  job(5, 'running'),
  job(6, 'paused'),
  job(7, 'done', 500)
]
const pos = (js: QueueJob[]): number[] => js.map((j) => j.position)
const none = new Set<QueueGroup>()

describe('viewJobs', () => {
  it('ordem da fila', () => {
    expect(pos(viewJobs(jobs, none, 'queue'))).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
  it('término mais recente / mais antigo, sem término no fim', () => {
    expect(pos(viewJobs(jobs, none, 'finished-desc'))).toEqual([7, 1, 2, 4, 3, 5, 6])
    expect(pos(viewJobs(jobs, none, 'finished-asc'))).toEqual([4, 2, 1, 7, 3, 5, 6])
  })
  it('erros primeiro / pendentes primeiro, empates pela fila', () => {
    expect(pos(viewJobs(jobs, none, 'errors-first'))).toEqual([2, 5, 3, 6, 1, 4, 7])
    expect(pos(viewJobs(jobs, none, 'pending-first'))).toEqual([5, 3, 6, 2, 1, 4, 7])
  })
  it('oculta grupos (skipped conta como concluído)', () => {
    expect(pos(viewJobs(jobs, new Set<QueueGroup>(['done']), 'queue'))).toEqual([2, 3, 5, 6])
    expect(pos(viewJobs(jobs, new Set<QueueGroup>(['done', 'queued', 'running', 'paused']), 'queue'))).toEqual([2])
  })
  it('não muta a entrada', () => {
    const copy = [...jobs]
    viewJobs(jobs, none, 'errors-first')
    expect(jobs).toEqual(copy)
  })
})

describe('countByGroup', () => {
  it('conta por grupo', () => {
    expect(countByGroup(jobs)).toEqual({ running: 1, queued: 1, paused: 1, done: 3, error: 1 })
  })
})
