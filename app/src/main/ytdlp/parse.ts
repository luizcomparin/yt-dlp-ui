import type { DownloadProgress } from '@shared/ipc'
import { MARK } from './args'

export type ParsedLine =
  | { type: 'progress'; progress: DownloadProgress }
  | { type: 'postprocess'; postprocessor: string; status: string }
  | { type: 'file'; path: string }
  | { type: 'entry'; data: Record<string, unknown> }
  | { type: 'info'; data: Record<string, unknown> }
  | { type: 'warning'; message: string }
  /** yt-dlp pulou o vídeo porque ele já está no download archive. */
  | { type: 'archived' }
  | { type: 'error'; message: string }
  | { type: 'other'; line: string }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Interpreta uma linha de saída do yt-dlp (stdout ou stderr). */
export function parseLine(line: string): ParsedLine {
  if (line.startsWith(MARK.progress)) {
    try {
      const p = JSON.parse(line.slice(MARK.progress.length))
      return {
        type: 'progress',
        progress: {
          status: p.status === 'finished' ? 'finished' : p.status === 'error' ? 'error' : 'downloading',
          downloadedBytes: num(p.downloaded_bytes) ?? 0,
          totalBytes: num(p.total_bytes) ?? num(p.total_bytes_estimate),
          speed: num(p.speed),
          eta: num(p.eta),
          filename: typeof p.filename === 'string' ? p.filename : null
        }
      }
    } catch {
      return { type: 'other', line }
    }
  }
  if (line.startsWith(MARK.postprocess)) {
    try {
      const p = JSON.parse(line.slice(MARK.postprocess.length))
      return { type: 'postprocess', postprocessor: String(p.postprocessor ?? ''), status: String(p.status ?? '') }
    } catch {
      return { type: 'other', line }
    }
  }
  if (line.startsWith(MARK.file)) {
    const raw = line.slice(MARK.file.length).trim()
    try {
      const path = JSON.parse(raw)
      if (typeof path === 'string') return { type: 'file', path }
    } catch {
      // não era JSON (ex.: template customizado) → usa o texto cru
    }
    return { type: 'file', path: raw }
  }
  for (const [mark, type] of [[MARK.entry, 'entry'], [MARK.info, 'info']] as const) {
    if (line.startsWith(mark)) {
      try {
        const data = JSON.parse(line.slice(mark.length))
        if (data && typeof data === 'object') return { type, data }
      } catch {
        // cai para 'other'
      }
      return { type: 'other', line }
    }
  }
  if (line.startsWith('ERROR:')) {
    return { type: 'error', message: line.slice('ERROR:'.length).trim() }
  }
  if (/has already been recorded in the archive/i.test(line)) {
    return { type: 'archived' }
  }
  if (line.startsWith('WARNING:')) {
    return { type: 'warning', message: line.slice('WARNING:'.length).trim() }
  }
  return { type: 'other', line }
}
