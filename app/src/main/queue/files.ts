import { readFile, rm } from 'node:fs/promises'
import { join, parse, resolve } from 'node:path'

/** Nome do download archive do yt-dlp, um por pasta de destino (R9). */
export const ARCHIVE_NAME = '.yt-dlp-archive.txt'

export const archiveFileFor = (outputDir: string): string => join(outputDir, ARCHIVE_NAME)

/** Converte o conteúdo do archive ("youtube <id>" por linha) em ids do YouTube. */
export function parseArchive(content: string): string[] {
  const ids: string[] = []
  for (const line of content.split(/\r?\n/)) {
    const [extractor, id] = line.trim().split(/\s+/)
    if (id && extractor?.toLowerCase() === 'youtube') ids.push(id)
  }
  return ids
}

export async function readArchiveIds(outputDir: string): Promise<string[]> {
  try {
    return parseArchive(await readFile(archiveFileFor(outputDir), 'utf8'))
  } catch {
    return [] // ainda não existe
  }
}

/**
 * Arquivos temporários de um download incompleto, a partir do `filename` informado no progresso
 * (ex.: "C:\Music\Título.webm"): .part, .ytdl, o próprio arquivo (se morto antes da extração)
 * e a thumbnail baixada para embutir.
 */
export function partialFiles(outputDir: string, tempPath: string): string[] {
  const full = resolve(outputDir, tempPath)
  const { dir, name } = parse(full)
  const base = join(dir, name)
  return [`${full}.part`, `${full}.ytdl`, full, `${base}.jpg`, `${base}.webp`, `${base}.png`]
}

export async function removePartialFiles(outputDir: string, tempPath: string | null): Promise<void> {
  if (!tempPath) return
  await Promise.all(partialFiles(outputDir, tempPath).map((f) => rm(f, { force: true })))
}
