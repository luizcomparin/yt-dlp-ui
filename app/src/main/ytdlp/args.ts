import { splitArgs } from './split-args'

/** Prefixos que o app injeta na saída do yt-dlp para identificar linhas estruturadas. */
export const MARK = {
  progress: '[ytui:progress]',
  postprocess: '[ytui:pp]',
  file: '[ytui:file]',
  entry: '[ytui:entry]',
  info: '[ytui:info]'
} as const

/** Template de `--print` que emite só os campos pedidos, como JSON. */
const fieldsJson = (fields: string[]): string => `%(.{${fields.join(',')}})j`

/**
 * Filtro ffmpeg que recorta a capa para quadrado, centralizado (R3).
 * Usa o menor lado: 1280x720 → 720x720.
 */
export const SQUARE_CROP_PPA =
  "ThumbnailsConvertor+FFmpeg_o:-c:v mjpeg -vf crop=\"'if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'\""

export interface DownloadArgsInput {
  url: string
  outputDir: string
  outputTemplate: string
  /** Expressão `-f` (format_id ou seletor). `undefined` = bestaudio. */
  format?: string
  cropThumbnail: boolean
  /** Pasta (ou binário) do ffmpeg. */
  ffmpegLocation: string
  /** Caminho do deno; `null` deixa o yt-dlp procurar sozinho. */
  denoPath: string | null
  /** Arquivo do download archive (R9): vídeos já baixados são pulados. */
  archiveFile?: string
  /** Argumentos do app (ex.: anti-bloqueio), antes dos extras do usuário. */
  appArgs?: string[]
  /** String livre de argumentos extras do usuário (R8). */
  extraArgs?: string
}

export interface CookieOptions {
  cookiesBrowser: string
  cookiesProfile: string
  cookiesFile: string
}

/**
 * Cookies (R12): navegador tem prioridade sobre arquivo.
 * `--cookies-from-browser firefox` ou `firefox:Perfil`; `--cookies C:\cookies.txt`.
 */
export function cookieArgs(o: CookieOptions): string[] {
  if (o.cookiesBrowser) {
    const profile = o.cookiesProfile.trim()
    return ['--cookies-from-browser', profile ? `${o.cookiesBrowser}:${profile}` : o.cookiesBrowser]
  }
  if (o.cookiesFile.trim()) return ['--cookies', o.cookiesFile.trim()]
  return []
}

/** Argumentos comuns a qualquer chamada do yt-dlp feita pelo app. */
export function baseArgs(ffmpegLocation: string | null, denoPath: string | null, noPlaylist = true): string[] {
  // --encoding utf-8: sem isso, quando o stdout é um pipe no Windows o yt-dlp usa a code page
  // do console e descarta caracteres não-ASCII (ex.: "강남스타일" sumia dos logs).
  const args = ['--encoding', 'utf-8', '--color', 'never']
  if (noPlaylist) args.push('--no-playlist')
  if (ffmpegLocation) args.push('--ffmpeg-location', ffmpegLocation)
  if (denoPath) args.push('--js-runtimes', `deno:${denoPath}`)
  return args
}

/**
 * Listagem rápida (flat) de uma playlist: uma linha `[ytui:entry] {json}` por vídeo.
 * Sem `--no-playlist`, para que `watch?v=X&list=Y` seja tratado como playlist.
 */
export function buildListArgs(url: string, fields: string[], denoPath: string | null, extra: string[] = []): string[] {
  return [
    ...baseArgs(null, denoPath, false),
    '--flat-playlist',
    '--ignore-errors',
    '--print', `${MARK.entry} ${fieldsJson(fields)}`,
    ...extra,
    '--', url
  ]
}

/**
 * Enriquecimento de vários vídeos num só processo (economiza o tempo de inicialização do yt-dlp).
 * `--print` implica `--simulate`: nada é baixado. `-f bestaudio` faz os campos de formato
 * no topo do JSON serem os do formato que o download vai usar (tamanho exato).
 */
export function buildEnrichArgs(urls: string[], fields: string[], denoPath: string | null, extra: string[] = []): string[] {
  return [
    ...baseArgs(null, denoPath, true),
    '--ignore-errors',
    '-f', 'bestaudio',
    '--print', `${MARK.info} ${fieldsJson(fields)}`,
    ...extra,
    '--', ...urls
  ]
}

/** Traduz as opções de download para a lista de argumentos do yt-dlp. Função pura. */
export function buildDownloadArgs(o: DownloadArgsInput): string[] {
  const args = [
    ...baseArgs(o.ffmpegLocation, o.denoPath),
    // saída estruturada para o app
    '--newline',
    '--progress',
    '--progress-template', `download:${MARK.progress} %(progress)j`,
    '--progress-template', `postprocess:${MARK.postprocess} %(progress)j`,
    // %(filepath)j = string JSON com escapes \uXXXX: o caminho chega íntegro mesmo se o encoding falhar
    '--print', `after_move:${MARK.file} %(filepath)j`,
    // áudio: melhor original, sem recodificar
    '-f', o.format ?? 'bestaudio',
    '-x', '--audio-format', 'best',
    // capa + metadados
    '--embed-thumbnail', '--convert-thumbnails', 'jpg',
    '--embed-metadata'
  ]
  if (o.cropThumbnail) args.push('--ppa', SQUARE_CROP_PPA)
  args.push('-P', o.outputDir, '-o', o.outputTemplate)
  if (o.archiveFile) args.push('--download-archive', o.archiveFile)
  if (o.appArgs?.length) args.push(...o.appArgs)
  // extras do usuário vêm por último para poderem sobrescrever os padrões
  if (o.extraArgs?.trim()) args.push(...splitArgs(o.extraArgs))
  args.push('--', o.url)
  return args
}
