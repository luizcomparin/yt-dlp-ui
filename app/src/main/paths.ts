import { app } from 'electron'
import { join } from 'node:path'

/** Pasta de dados do app (%APPDATA%/yt-dlp-ui). */
export const userDataDir = (): string => app.getPath('userData')

/** Binários gerenciados pelo app (yt-dlp, deno, ffmpeg). */
export const binDir = (): string => join(userDataDir(), 'bin')

export const settingsFile = (): string => join(userDataDir(), 'settings.json')

/** Banco SQLite (cache de playlists/vídeos; depois fila e erros). */
export const dbFile = (): string => join(userDataDir(), 'app.db')

/** Logs em arquivo (errors-AAAAMMDD.jsonl). */
export const logsDir = (): string => join(userDataDir(), 'logs')

/** Pasta padrão de destino dos downloads. */
export const defaultOutputDir = (): string => join(app.getPath('music'), 'yt-dlp-ui')
