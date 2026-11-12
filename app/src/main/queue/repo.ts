import type { DatabaseSync } from 'node:sqlite'
import type { JobStatus, QueueJob } from '@shared/ipc'
import { transaction } from '../db'

/** Job como guardado no banco + campos internos (não enviados à UI). */
export interface StoredJob extends QueueJob {
  format: string
  outputTemplate: string
  tempPath: string | null
}

interface Row {
  id: string
  video_id: string
  playlist_id: string | null
  url: string
  title: string
  position: number
  format: string
  output_dir: string
  output_template: string
  status: JobStatus
  attempts: number
  file_path: string | null
  temp_path: string | null
  error: string | null
  error_kind: string | null
  command: string | null
  created_at: number
  started_at: number | null
  finished_at: number | null
}

const fromRow = (r: Row): StoredJob => ({
  id: r.id, videoId: r.video_id, playlistId: r.playlist_id, url: r.url, title: r.title, position: r.position,
  status: r.status, attempts: r.attempts, progress: null, postprocessor: null, outputDir: r.output_dir,
  filePath: r.file_path, error: r.error, errorKind: r.error_kind, command: r.command, createdAt: r.created_at,
  startedAt: r.started_at, finishedAt: r.finished_at, format: r.format, outputTemplate: r.output_template, tempPath: r.temp_path
})

const toParams = (j: StoredJob) => ({
  id: j.id, video_id: j.videoId, playlist_id: j.playlistId, url: j.url, title: j.title, position: j.position,
  format: j.format, output_dir: j.outputDir, output_template: j.outputTemplate, status: j.status, attempts: j.attempts,
  file_path: j.filePath, temp_path: j.tempPath, error: j.error, error_kind: j.errorKind, command: j.command,
  created_at: j.createdAt, started_at: j.startedAt, finished_at: j.finishedAt
})

/** Persistência da fila. A fonte da verdade em tempo de execução é a memória do QueueManager. */
export function createJobRepo(db: DatabaseSync) {
  const upsert = db.prepare(`
    INSERT INTO jobs (id, video_id, playlist_id, url, title, position, format, output_dir, output_template, status,
      attempts, file_path, temp_path, error, error_kind, command, created_at, started_at, finished_at)
    VALUES (:id, :video_id, :playlist_id, :url, :title, :position, :format, :output_dir, :output_template, :status,
      :attempts, :file_path, :temp_path, :error, :error_kind, :command, :created_at, :started_at, :finished_at)
    ON CONFLICT(id) DO UPDATE SET video_id = excluded.video_id, url = excluded.url, title = excluded.title, format = excluded.format,
      status = excluded.status, attempts = excluded.attempts, file_path = excluded.file_path,
      temp_path = excluded.temp_path, error = excluded.error, error_kind = excluded.error_kind, command = excluded.command,
      started_at = excluded.started_at, finished_at = excluded.finished_at, position = excluded.position`)
  const del = db.prepare('DELETE FROM jobs WHERE id = ?')
  const all = db.prepare('SELECT * FROM jobs ORDER BY position')

  return {
    loadAll(): StoredJob[] {
      return (all.all() as unknown as Row[]).map(fromRow)
    },
    save(j: StoredJob): void {
      upsert.run(toParams(j))
    },
    saveMany(jobs: StoredJob[]): void {
      transaction(db, () => jobs.forEach((j) => upsert.run(toParams(j))))
    },
    remove(ids: string[]): void {
      transaction(db, () => ids.forEach((id) => del.run(id)))
    }
  }
}

export type JobRepo = ReturnType<typeof createJobRepo>
