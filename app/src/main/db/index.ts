import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// SQLite embutido no Node (node:sqlite) — sem módulo nativo para recompilar.
// Migrações são aplicadas em ordem, controladas por `PRAGMA user_version`.

const MIGRATIONS: string[] = [
  // 1: cache de playlists e vídeos (fase 2)
  `
  CREATE TABLE playlists (
    id          TEXT PRIMARY KEY,
    url         TEXT NOT NULL,
    title       TEXT NOT NULL,
    channel     TEXT,
    count       INTEGER,
    is_single   INTEGER NOT NULL DEFAULT 0,
    fetched_at  INTEGER NOT NULL
  );
  CREATE TABLE videos (
    id                  TEXT PRIMARY KEY,
    title               TEXT NOT NULL,
    channel             TEXT,
    duration            REAL,
    upload_date         TEXT,
    timestamp           INTEGER,
    availability        TEXT NOT NULL DEFAULT 'pending',
    availability_reason TEXT,
    size_bytes          INTEGER,
    size_is_estimate    INTEGER NOT NULL DEFAULT 1,
    best_format_json    TEXT,
    formats_json        TEXT,
    enriched_at         INTEGER,
    updated_at          INTEGER NOT NULL
  );
  CREATE TABLE playlist_items (
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    video_id    TEXT NOT NULL REFERENCES videos(id),
    idx         INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, video_id)
  );
  CREATE INDEX playlist_items_order ON playlist_items(playlist_id, idx);
  `,
  // 2: fila de download (fase 4)
  `
  CREATE TABLE jobs (
    id              TEXT PRIMARY KEY,
    video_id        TEXT NOT NULL,
    playlist_id     TEXT,
    url             TEXT NOT NULL,
    title           TEXT NOT NULL,
    position        INTEGER NOT NULL,
    format          TEXT NOT NULL,
    output_dir      TEXT NOT NULL,
    output_template TEXT NOT NULL,
    status          TEXT NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    file_path       TEXT,
    temp_path       TEXT,
    error           TEXT,
    error_kind      TEXT,
    command         TEXT,
    created_at      INTEGER NOT NULL,
    started_at      INTEGER,
    finished_at     INTEGER
  );
  CREATE INDEX jobs_status_position ON jobs(status, position);
  CREATE INDEX jobs_video ON jobs(video_id);
  `,
  // 3: log de erros (fase 5) — histórico permanente, independente da fila
  `
  CREATE TABLE errors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      TEXT,
    video_id    TEXT NOT NULL,
    playlist_id TEXT,
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    kind        TEXT NOT NULL,
    reason      TEXT NOT NULL,
    message     TEXT NOT NULL,
    command     TEXT,
    attempt     INTEGER NOT NULL,
    final       INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX errors_created ON errors(created_at);
  `,
  // 4: onde cada vídeo foi salvo (fase 7: M3U e duplicadas) — sobrevive a "limpar concluídos"
  `
  CREATE TABLE downloads (
    video_id    TEXT NOT NULL,
    output_dir  TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    title       TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (video_id, output_dir)
  );
  `,
  // 5: substituição de faixas indisponíveis por outro vídeo, mantendo a posição na playlist
  `
  CREATE TABLE replacements (
    playlist_id    TEXT NOT NULL,
    original_id    TEXT NOT NULL,
    replacement_id TEXT NOT NULL,
    created_at     INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, original_id)
  );
  `
]

let db: DatabaseSync | null = null

export function openDb(file: string): DatabaseSync {
  if (db) return db
  mkdirSync(dirname(file), { recursive: true })
  db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  migrate(db)
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('Banco não inicializado (chame openDb no startup).')
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

function migrate(d: DatabaseSync): void {
  const { user_version: current } = d.prepare('PRAGMA user_version').get() as { user_version: number }
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(d, () => {
      d.exec(MIGRATIONS[v])
      d.exec(`PRAGMA user_version = ${v + 1}`)
    })
  }
}

export function transaction<T>(d: DatabaseSync, fn: () => T): T {
  d.exec('BEGIN')
  try {
    const result = fn()
    d.exec('COMMIT')
    return result
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}
