// Contrato de IPC compartilhado entre main, preload e renderer.
// Todo canal novo deve ser declarado aqui para manter os três lados tipados.
import type { AntiBlockProfile } from './antiblock'
export type { AntiBlockProfile }

export const IpcChannels = {
  appInfo: 'app:info',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  depsStatus: 'deps:status',
  depsInstall: 'deps:install',
  depsUpdateYtdlp: 'deps:update-ytdlp',
  dialogPickFolder: 'dialog:pick-folder',
  shellShowItem: 'shell:show-item',
  playlistLoad: 'playlist:load',
  playlistCancel: 'playlist:cancel',
  playlistSearch: 'playlist:search',
  playlistReplace: 'playlist:replace',
  playlistUnreplace: 'playlist:unreplace',
  queueList: 'queue:list',
  queueAdd: 'queue:add',
  queuePauseAll: 'queue:pause-all',
  queueResumeAll: 'queue:resume-all',
  queuePauseJob: 'queue:pause-job',
  queueResumeJob: 'queue:resume-job',
  queueRetryJob: 'queue:retry-job',
  queueRemoveJob: 'queue:remove-job',
  queueClearFinished: 'queue:clear-finished',
  archiveIds: 'archive:ids',
  queueRetryFailed: 'queue:retry-failed',
  queueReplaceJob: 'queue:replace-job',
  errorsList: 'errors:list',
  errorsClear: 'errors:clear',
  dialogSaveText: 'dialog:save-text',
  shellOpenLogs: 'shell:open-logs',
  shellOpenExternal: 'shell:open-external',
  dialogPickFile: 'dialog:pick-file',
  consoleRun: 'console:run',
  consoleKill: 'console:kill',
  cookiesTest: 'cookies:test',
  m3uWrite: 'm3u:write',
  folderInfo: 'library:folder-info',
  // eventos main → renderer
  depsProgress: 'deps:progress',
  playlistEvent: 'playlist:event',
  queueEvent: 'queue:event',
  errorsEvent: 'errors:event',
  consoleEvent: 'console:event',
  settingsChanged: 'settings:changed',
  clipboardUrl: 'clipboard:url'
} as const

// ---------- app ----------

export interface AppInfo {
  name: string
  version: string
  electron: string
  node: string
  chrome: string
  platform: string
}

// ---------- settings ----------

export type YtdlpChannel = 'stable' | 'nightly'

/** Preferência de formato de áudio (R1). Sempre sem recodificar. */
export type AudioPreference = 'best' | 'opus' | 'm4a'

export interface Settings {
  /** Pasta de destino dos downloads. */
  outputDir: string
  /** Template de nome do yt-dlp (`-o`). */
  outputTemplate: string
  /** Recorta a capa para quadrado (R3). */
  cropThumbnail: boolean
  /** Formato preferido: melhor disponível, opus ou m4a (R1). */
  audioFormat: AudioPreference
  /** Caminho customizado do ffmpeg (binário ou pasta). `null` = automático. */
  ffmpegPath: string | null
  /** Canal de atualização do yt-dlp. */
  ytdlpChannel: YtdlpChannel
  /** Argumentos extras anexados a todo comando do yt-dlp (R8). */
  extraArgs: string
  /** Perfil anti-bloqueio (R13): concorrência e pausas. */
  antiBlock: AntiBlockProfile
  /** `--limit-rate` (ex.: "2M"); vazio = sem limite. */
  limitRate: string
  /** Prefixa o nome com a posição na ordem escolhida ("001 - Título"). */
  numberFiles: boolean
  /** Cookies do navegador (R12): '' = desligado. */
  cookiesBrowser: CookieBrowser | ''
  /** Perfil do navegador (opcional; vazio = padrão). */
  cookiesProfile: string
  /** Arquivo cookies.txt (formato Netscape). Usado se `cookiesBrowser` estiver vazio. */
  cookiesFile: string
  /** Presets de configurações de download salvos pelo usuário. */
  presets: Preset[]
  /** Gera a playlist .m3u8 automaticamente quando a fila termina (R10). */
  autoM3u: boolean
  /** Ao gerar o M3U, ajusta as datas (criação/modificação) dos arquivos na ordem da playlist. */
  orderFileDates: boolean
  /** Oferece carregar links do YouTube copiados (R11). */
  clipboardWatch: boolean
  /** Notificação do sistema ao terminar a fila ou pausar por bloqueio (R15). */
  notifyOnFinish: boolean
}

export type CookieBrowser = 'firefox' | 'chrome' | 'edge' | 'brave' | 'opera' | 'vivaldi' | 'chromium' | 'safari'

/** Configurações que um preset guarda/aplica (pasta de destino e caminhos ficam de fora). */
export const PRESET_KEYS = [
  'audioFormat',
  'cropThumbnail',
  'outputTemplate',
  'numberFiles',
  'antiBlock',
  'limitRate',
  'extraArgs'
] as const satisfies ReadonlyArray<keyof Settings>

export type PresetValues = Pick<Settings, (typeof PRESET_KEYS)[number]>

export interface Preset {
  id: string
  name: string
  values: PresetValues
}

// ---------- deps ----------

export type DepName = 'yt-dlp' | 'ffmpeg' | 'deno'

export interface DepStatus {
  name: DepName
  installed: boolean
  path: string | null
  version: string | null
  /** managed = baixado pelo app; system = encontrado no PATH; custom = caminho configurado. */
  source: 'managed' | 'system' | 'custom' | null
  error?: string
}

export interface DepsProgress {
  name: DepName
  phase: 'downloading' | 'extracting' | 'done' | 'error'
  received?: number
  total?: number
  message?: string
}

// ---------- download / fila ----------

export interface DownloadProgress {
  status: 'downloading' | 'finished' | 'error'
  downloadedBytes: number
  totalBytes: number | null
  speed: number | null
  eta: number | null
  /** Caminho do arquivo em download (sem .part), para limpeza. */
  filename?: string | null
}

/**
 * - queued: aguardando vaga · running: em andamento · paused: pausado pelo usuário (não é agendado)
 * - done: concluído · skipped: já estava no histórico de downloads (archive) · error: falhou
 */
export type JobStatus = 'queued' | 'running' | 'paused' | 'done' | 'skipped' | 'error'

export interface QueueJob {
  id: string
  videoId: string
  playlistId: string | null
  url: string
  title: string
  /** Ordem global na fila (menor = antes). */
  position: number
  status: JobStatus
  attempts: number
  progress: DownloadProgress | null
  /** Pós-processador em execução (ExtractAudio, EmbedThumbnail…). */
  postprocessor: string | null
  outputDir: string
  filePath: string | null
  error: string | null
  errorKind: string | null
  command: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface QueueState {
  /** Pausa geral pelo usuário. */
  paused: boolean
  /** Pausa automática após bloqueio do YouTube (timestamp de retomada). */
  cooldownUntil: number | null
  cooldownReason: string | null
  concurrency: number
  counts: Record<JobStatus, number>
}

export interface EnqueueItem {
  videoId: string
  url: string
  title: string
  playlistId: string | null
  /** Escolha manual de formato (format_id). `undefined` = preferência das configurações. */
  formatId?: string
}

export type QueueEvent =
  /** Upsert de jobs (em lote). */
  | { type: 'jobs'; jobs: QueueJob[] }
  | { type: 'removed'; ids: string[] }
  | { type: 'state'; state: QueueState }
  /** Um vídeo foi gravado no archive (baixado) — para atualizar a marca "baixada". */
  | { type: 'archived'; outputDir: string; videoId: string }

// ---------- playlist ----------

/**
 * Disponibilidade de uma faixa (R6).
 * - pending: ainda não enriquecida (só dados da listagem flat)
 * - restricted: existe, mas exige login/idade/assinatura (pode funcionar com cookies)
 */
export type Availability = 'pending' | 'available' | 'private' | 'deleted' | 'restricted' | 'unavailable'

export interface AudioFormat {
  formatId: string
  ext: string
  acodec: string
  /** kbps */
  abr: number | null
  asr: number | null
  filesize: number | null
  filesizeIsEstimate: boolean
  note: string | null
  language: string | null
  /** Dynamic Range Compression (versões "-drc" do YouTube). */
  drc: boolean
}

export interface Track {
  /**
   * Identidade da linha na playlist (o vídeo ORIGINAL). Mantém posição, seleção e formato escolhido.
   * Igual a `videoId`, exceto quando a faixa foi substituída por outro vídeo.
   */
  rowId: string
  /** Vídeo que será baixado (o substituto, se houver). */
  videoId: string
  url: string
  /** Posição original na playlist (1-based). */
  index: number
  title: string
  channel: string | null
  duration: number | null
  thumbnail: string
  /** YYYYMMDD */
  uploadDate: string | null
  availability: Availability
  availabilityReason: string | null
  /** Tamanho do formato `bestaudio`. */
  sizeBytes: number | null
  sizeIsEstimate: boolean
  bestFormat: AudioFormat | null
  formats: AudioFormat[]
  enrichedAt: number | null
  /** Preenchido quando a faixa foi substituída: dados do vídeo original da playlist. */
  replacedFrom: ReplacedFrom | null
}

export interface ReplacedFrom {
  videoId: string
  title: string
  availability: Availability
  availabilityReason: string | null
}

/** Resultado da busca no YouTube para substituir uma faixa. */
export interface SearchResult {
  videoId: string
  url: string
  title: string
  channel: string | null
  duration: number | null
  thumbnail: string
}

export interface ReplaceRequest {
  playlistId: string
  /** rowId da faixa (vídeo original). */
  originalId: string
  /** Link ou id do vídeo substituto. */
  url: string
}

export interface PlaylistInfo {
  id: string
  url: string
  title: string
  channel: string | null
  count: number | null
  /** Link de um vídeo só (sem `list=`), tratado como playlist de 1 item. */
  isSingleVideo: boolean
}

export type PlaylistEvent =
  | { loadId: string; type: 'info'; playlist: PlaylistInfo }
  /** Upsert de faixas (por videoId). */
  | { loadId: string; type: 'tracks'; tracks: Track[] }
  /** Listagem flat terminou; `videoIds` é a lista final na ordem da playlist. */
  | { loadId: string; type: 'listed'; videoIds: string[] }
  | { loadId: string; type: 'enrich-progress'; done: number; total: number }
  | { loadId: string; type: 'enriched' }
  | { loadId: string; type: 'warning'; message: string }
  | { loadId: string; type: 'error'; message: string }

export interface PlaylistLoadOptions {
  /** Ignora o cache e re-enriquece todas as faixas. */
  refresh?: boolean
}

// ---------- log de erros (fase 5) ----------

/** Uma falha registrada (cada tentativa que falhou gera uma entrada). */
export interface ErrorEntry {
  id: number
  jobId: string | null
  videoId: string
  playlistId: string | null
  title: string
  url: string
  /** Tipo (classifyError): private, deleted, unavailable, network, rate-limit… */
  kind: string
  /** Motivo curto em português. */
  reason: string
  /** Mensagem original do yt-dlp. */
  message: string
  command: string | null
  /** Número da tentativa (1, 2, 3…). */
  attempt: number
  /** true = desistiu (job ficou em erro); false = vai tentar de novo / aguardou bloqueio. */
  final: boolean
  createdAt: number
}

export type ErrorsEvent = { type: 'added'; entry: ErrorEntry } | { type: 'cleared' }

// ---------- console (fase 6) ----------

export type ConsoleTool = 'yt-dlp' | 'ffmpeg' | 'ffprobe' | 'deno'

export interface ConsoleRunRequest {
  tool: ConsoleTool
  /** Argumentos como digitados (divididos como num shell). */
  args: string
  /** yt-dlp: inclui ffmpeg/deno/cookies/UTF-8 do app antes dos argumentos do usuário. */
  useAppArgs: boolean
}

export type ConsoleEvent =
  | { runId: string; type: 'start'; command: string; cwd: string }
  /** Linhas em lote (stdout/stderr). */
  | { runId: string; type: 'lines'; lines: Array<{ stream: 'stdout' | 'stderr'; text: string }> }
  | { runId: string; type: 'exit'; code: number | null; killed: boolean; ms: number }

export interface CookiesTestResult {
  ok: boolean
  message: string
}

// ---------- extras (fase 7) ----------

/** O que já existe numa pasta de destino (sincronização e duplicadas, R9/R14). */
export interface FolderInfo {
  /** Vídeos no download archive da pasta. */
  archivedIds: string[]
  /** Chaves de nome (shared/duplicates.fileKey) dos arquivos de áudio da pasta → nome do arquivo. */
  fileKeys: Record<string, string>
  /** Vídeos já baixados pelo app em OUTRA pasta (videoId → pasta). */
  elsewhere: Record<string, string>
}

export interface M3uRequest {
  outputDir: string
  playlistTitle: string
  /** Faixas na ordem desejada (a ordem visível). */
  videoIds: string[]
}

export interface M3uResult {
  path: string | null
  written: number
  /** Arquivos cuja data foi ajustada para a ordem da playlist (0 se desligado). */
  dated: number
  /** Faixas pedidas cujo arquivo não foi encontrado na pasta. */
  missing: number
}

// ---------- API exposta pelo preload em `window.api` ----------

export interface RendererApi {
  getAppInfo(): Promise<AppInfo>
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
    /** Disparado a cada alteração (de qualquer origem). */
    onChanged(cb: (s: Settings) => void): () => void
  }
  deps: {
    status(): Promise<DepStatus[]>
    install(name: DepName): Promise<DepStatus>
    updateYtdlp(): Promise<{ output: string; status: DepStatus }>
    onProgress(cb: (p: DepsProgress) => void): () => void
  }
  dialog: {
    pickFolder(defaultPath?: string): Promise<string | null>
    pickFile(filterName: string, extensions: string[]): Promise<string | null>
    /** Abre "Salvar como" e grava o texto (UTF-8). Retorna o caminho ou null se cancelado. */
    saveText(defaultName: string, content: string, filterName: string, extensions: string[]): Promise<string | null>
  }
  shell: {
    showItem(path: string): Promise<void>
    /** Abre a pasta de logs (JSONL de erros). */
    openLogs(): Promise<void>
    /** Abre um link do YouTube no navegador padrão (só youtube.com / youtu.be). */
    openExternal(url: string): Promise<void>
  }
  queue: {
    /** Snapshot inicial (jobs + estado). Depois, tudo chega por `onEvent`. */
    list(): Promise<{ jobs: QueueJob[]; state: QueueState }>
    /** Enfileira na ordem dada (a ordem visível da tabela). */
    /**
     * Enfileira na ordem dada. Vídeos com job em ERRO na mesma pasta são re-tentados no próprio job
     * (mantém a posição na fila) em vez de duplicados.
     */
    add(items: EnqueueItem[]): Promise<{ added: number; retried: number; skippedDuplicates: number }>
    /** Troca o vídeo de um job (substituição), mantendo a posição na fila. */
    replaceJob(id: string, video: { videoId: string; url: string; title: string }): Promise<void>
    pauseAll(): Promise<void>
    resumeAll(): Promise<void>
    pauseJob(id: string): Promise<void>
    resumeJob(id: string): Promise<void>
    retryJob(id: string): Promise<void>
    /** Remove da fila; se incompleto, apaga .part e thumbnail. */
    removeJob(id: string): Promise<void>
    clearFinished(): Promise<void>
    /** Recoloca na fila todos os jobs com erro. Retorna quantos. */
    retryFailed(): Promise<number>
    onEvent(cb: (e: QueueEvent) => void): () => void
  }
  console: {
    run(req: ConsoleRunRequest): Promise<{ runId: string }>
    kill(): Promise<void>
    onEvent(cb: (e: ConsoleEvent) => void): () => void
  }
  cookies: {
    /** Testa a configuração de cookies atual com uma extração simples. */
    test(): Promise<CookiesTestResult>
  }
  errors: {
    list(): Promise<ErrorEntry[]>
    clear(): Promise<void>
    onEvent(cb: (e: ErrorsEvent) => void): () => void
  }
  archive: {
    /** IDs de vídeos já baixados na pasta (download archive do yt-dlp). */
    ids(outputDir: string): Promise<string[]>
  }
  library: {
    /** Archive, arquivos de áudio e downloads em outras pastas, para marcar "baixada"/duplicada. */
    folderInfo(outputDir: string, videoIds: string[]): Promise<FolderInfo>
    /** Gera/sobrescreve <pasta>/<playlist>.m3u8 com as faixas encontradas, na ordem dada. */
    writeM3u(req: M3uRequest): Promise<M3uResult>
  }
  clipboard: {
    /** Link do YouTube copiado (quando o monitor está ligado). */
    onUrl(cb: (url: string) => void): () => void
  }
  playlist: {
    load(url: string, opts?: PlaylistLoadOptions): Promise<{ loadId: string }>
    cancel(): Promise<void>
    /** Busca vídeos no YouTube (para substituir uma faixa indisponível). */
    search(query: string): Promise<SearchResult[]>
    /** Substitui a faixa pelo vídeo informado (validado antes). Retorna a linha atualizada. */
    replace(req: ReplaceRequest): Promise<Track>
    /** Desfaz a substituição. Retorna a linha original. */
    unreplace(playlistId: string, originalId: string): Promise<Track>
    onEvent(cb: (e: PlaylistEvent) => void): () => void
  }
}
