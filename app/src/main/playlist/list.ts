import { run, type RunHandle } from '../runner'
import { buildListArgs } from '../ytdlp/args'
import { parseLine } from '../ytdlp/parse'
import { FLAT_FIELDS, parseFlatEntry, type FlatEntry } from '../ytdlp/info'

export interface ListCallbacks {
  onEntry(e: FlatEntry): void
  onWarning(message: string): void
}

export interface ListResult {
  ok: boolean
  cancelled: boolean
  /** Última mensagem de erro do yt-dlp (se houver). */
  error: string | null
}

/** Listagem flat (rápida): emite cada vídeo conforme o yt-dlp imprime. */
export function listPlaylist(
  ytdlp: string,
  denoPath: string | null,
  url: string,
  cb: ListCallbacks,
  extraArgs: string[] = []
): { handle: RunHandle; result: Promise<ListResult> } {
  const errors: string[] = []
  let entries = 0
  const onLine = (line: string): void => {
    const p = parseLine(line)
    if (p.type === 'entry') {
      const e = parseFlatEntry(p.data)
      if (e) {
        entries++
        cb.onEntry(e)
      }
    } else if (p.type === 'warning') cb.onWarning(p.message)
    else if (p.type === 'error') errors.push(p.message)
  }
  const handle = run(ytdlp, buildListArgs(url, FLAT_FIELDS, denoPath, extraArgs), { onStdout: onLine, onStderr: onLine })
  const result = handle.done.then(({ code, killed }) => ({
    ok: !killed && (code === 0 || entries > 0),
    cancelled: killed,
    error: errors.at(-1) ?? (code !== 0 && entries === 0 ? `yt-dlp saiu com código ${code}` : null)
  }))
  return { handle, result }
}
