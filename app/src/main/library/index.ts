import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import type { FolderInfo, M3uRequest, M3uResult } from '@shared/ipc'
import { fileKey, nameKey } from '@shared/duplicates'
import { buildM3u, m3uFileName, type M3uItem } from '@shared/m3u'
import { getDb } from '../db'
import { createLibrary } from '../db/library'
import { readArchiveIds } from '../queue/files'
import { getSettings } from '../settings/store'
import { execCapture } from '../runner'

// Biblioteca local (fase 7): onde cada vídeo foi salvo, duplicadas na pasta e geração de M3U.

const sameDir = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase()

/** Registra o arquivo final de um download concluído. */
export function recordDownload(videoId: string, outputDir: string, filePath: string, title: string): void {
  getDb()
    .prepare(
      `INSERT INTO downloads (video_id, output_dir, file_path, title, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(video_id, output_dir) DO UPDATE SET file_path = excluded.file_path, title = excluded.title, created_at = excluded.created_at`
    )
    .run(videoId, outputDir, filePath, title, Date.now())
}

/** Arquivos de áudio da pasta (só o primeiro nível), indexados pela chave de nome. */
async function audioFilesByKey(outputDir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  let entries: string[] = []
  try {
    entries = await readdir(outputDir)
  } catch {
    return out // pasta ainda não existe
  }
  for (const name of entries) {
    const k = fileKey(name)
    if (k && !out[k]) out[k] = name
  }
  return out
}

export async function folderInfo(outputDir: string, videoIds: string[]): Promise<FolderInfo> {
  const [archivedIds, fileKeys] = await Promise.all([readArchiveIds(outputDir), audioFilesByKey(outputDir)])
  const elsewhere: Record<string, string> = {}
  if (videoIds.length) {
    const rows = getDb().prepare('SELECT video_id, output_dir, file_path FROM downloads').all() as Array<{
      video_id: string
      output_dir: string
      file_path: string
    }>
    const wanted = new Set(videoIds)
    for (const r of rows) {
      if (wanted.has(r.video_id) && !sameDir(r.output_dir, outputDir) && existsSync(r.file_path)) elsewhere[r.video_id] = r.output_dir
    }
  }
  return { archivedIds, fileKeys, elsewhere }
}

/**
 * Gera <pasta>/<playlist>.m3u8. Para cada faixa, procura o arquivo:
 *  1) registro em `downloads` (download feito pelo app nessa pasta), se o arquivo ainda existir;
 *  2) arquivo de áudio na pasta cujo nome corresponda ao título (downloads antigos/externos).
 */
export async function writeM3u(req: M3uRequest): Promise<M3uResult> {
  const lib = createLibrary(getDb())
  const files = await audioFilesByKey(req.outputDir)
  const recorded = new Map(
    (
      getDb().prepare('SELECT video_id, output_dir, file_path FROM downloads').all() as Array<{
        video_id: string
        output_dir: string
        file_path: string
      }>
    )
      .filter((r) => sameDir(r.output_dir, req.outputDir))
      .map((r) => [r.video_id, r.file_path])
  )

  const items: M3uItem[] = []
  const paths: string[] = []
  let missing = 0
  for (const id of req.videoIds) {
    const t = lib.getTrack(id, 0)
    const fromDb = recorded.get(id)
    let fileName: string | null = fromDb && existsSync(fromDb) ? basename(fromDb) : null
    if (!fileName && t) fileName = files[nameKey(t.title)] ?? null
    if (!fileName) {
      missing++
      continue
    }
    items.push({ fileName, title: t?.title ?? fileName, durationSec: t?.duration ?? null })
    paths.push(join(req.outputDir, fileName))
  }
  if (!items.length) return { path: null, written: 0, missing, dated: 0 }
  const path = join(req.outputDir, m3uFileName(req.playlistTitle))
  await writeFile(path, buildM3u(items), 'utf8')
  const dated = getSettings().orderFileDates ? await setDatesInOrder(paths) : 0
  return { path, written: items.length, missing, dated }
}

/**
 * Datas em sequência (1 min de intervalo) na ordem dada, terminando "agora": ordenar a pasta por data
 * (criação ou modificação) reproduz a ordem da playlist, inclusive para faixas baixadas depois
 * (re-tentativas, substituições).
 * - modificação: fs.utimes (Node)
 * - criação: Node não altera no Windows → um único PowerShell para todos os arquivos (lista em JSON UTF-8)
 */
export async function setDatesInOrder(paths: string[]): Promise<number> {
  const end = Date.now()
  const stamps = paths.map((p, i) => ({ p, t: new Date(end - (paths.length - 1 - i) * 60_000) }))
  let ok = 0
  for (const { p, t } of stamps) {
    try {
      await utimes(p, t, t)
      ok++
    } catch {
      // arquivo sumiu/travado: segue com os outros
    }
  }
  if (process.platform === 'win32' && ok) {
    const dir = await mkdtemp(join(tmpdir(), 'ytui-dates-'))
    const list = join(dir, 'list.json')
    try {
      await writeFile(list, JSON.stringify(stamps.map(({ p, t }) => ({ p, t: t.toISOString() }))), 'utf8')
      const script =
        '$ErrorActionPreference = "SilentlyContinue"; ' +
        `$items = Get-Content -Raw -Encoding UTF8 -LiteralPath '${list.replace(/'/g, "''")}' | ConvertFrom-Json; ` +
        'foreach ($i in $items) { $f = Get-Item -LiteralPath $i.p; if ($f) { $f.CreationTime = [DateTime]::Parse($i.t).ToLocalTime() } }'
      await execCapture('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], 120_000)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
  return ok
}
