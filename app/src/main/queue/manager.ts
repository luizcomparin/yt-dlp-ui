import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { IpcChannels, type EnqueueItem, type JobStatus, type QueueEvent, type QueueJob, type QueueState } from '@shared/ipc'
import { antiBlockArgs, backoffMs, PROFILES } from '@shared/antiblock'
import { formatSelector } from '@shared/tracks'
import { broadcast } from '../events'
import { getSettings } from '../settings/store'
import { resolveToolPaths } from '../deps'
import { getDb } from '../db'
import { run, type RunHandle } from '../runner'
import { buildDownloadArgs, cookieArgs } from '../ytdlp/args'
import { formatCommand } from '../ytdlp/split-args'
import { parseLine } from '../ytdlp/parse'
import { createJobRepo, type JobRepo, type StoredJob } from './repo'
import { decideOutcome, numberedTemplate } from './policy'
import { archiveFileFor, readArchiveIds, removePartialFiles } from './files'
import { recordError } from '../errors'
import { recordDownload } from '../library'
import { notifyCooldown, notifyQueueFinished, setTaskbarProgress } from '../system/notify'
import { splitVideoError } from '../ytdlp/errors'

// Fila de downloads (fase 4).
// - Memória (Map) é a fonte da verdade; o banco guarda o estado para sobreviver a reinícios.
// - Um processo yt-dlp por faixa: o erro de uma não afeta as outras.
// - Agendamento por `position` (ordem escolhida na UI), até `concurrency` do perfil anti-bloqueio.

type KillReason = 'pause' | 'requeue' | 'remove'

const FLUSH_MS = 250
const STATUSES: JobStatus[] = ['queued', 'running', 'paused', 'done', 'skipped', 'error']

const jobs = new Map<string, StoredJob>()
const running = new Map<string, RunHandle>()
const killReasons = new Map<string, KillReason>()
/** Jobs aguardando retry: não podem ser agendados antes deste instante. */
const notBefore = new Map<string, number>()
let repo: JobRepo | null = null
let paused = false
let cooldownUntil: number | null = null
let cooldownReason: string | null = null
let backoffLevel = 0
let cooldownTimer: NodeJS.Timeout | null = null
let retryTimer: NodeJS.Timeout | null = null
let ticking = false
/** Estatísticas da "rodada" atual (do início da atividade até a fila esvaziar), para notificação e barra de tarefas. */
const round = { active: false, done: 0, skipped: 0, error: 0 }

// ---------- emissão de eventos (em lote) ----------

const dirty = new Set<string>()
let flushTimer: NodeJS.Timeout | null = null

const publicJob = (j: StoredJob): QueueJob => {
  const { format: _f, outputTemplate: _t, tempPath: _p, ...rest } = j
  return rest
}

function state(): QueueState {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>
  for (const j of jobs.values()) counts[j.status]++
  return { paused, cooldownUntil, cooldownReason, concurrency: PROFILES[getSettings().antiBlock]?.concurrency ?? 1, counts }
}

const send = (e: QueueEvent): void => broadcast(IpcChannels.queueEvent, e)

function flush(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
  const changed = [...dirty].map((id) => jobs.get(id)).filter((j): j is StoredJob => !!j)
  dirty.clear()
  if (changed.length) send({ type: 'jobs', jobs: changed.map(publicJob) })
  const st = state()
  send({ type: 'state', state: st })
  trackRound(st)
}

/** Atualiza a barra de tarefas e notifica quando a fila esvazia (R15). */
function trackRound(st: QueueState): void {
  const pending = st.counts.queued + st.counts.running
  if (st.counts.running > 0) round.active = true
  const finished = round.done + round.skipped + round.error
  if (pending > 0 && round.active) {
    setTaskbarProgress(finished / (finished + pending), st.paused || !!st.cooldownUntil)
  } else if (pending === 0) {
    setTaskbarProgress(null)
    if (round.active && finished > 0) notifyQueueFinished(round.done, round.skipped, round.error)
    Object.assign(round, { active: false, done: 0, skipped: 0, error: 0 })
  }
}

function touch(j: StoredJob, persist = false): void {
  dirty.add(j.id)
  if (persist) repo?.save(j)
  flushTimer ??= setTimeout(flush, FLUSH_MS)
}

// ---------- ciclo de vida ----------

/** Carrega a fila do banco. Jobs que estavam rodando voltam para a fila, que inicia pausada. */
export function initQueue(): void {
  repo = createJobRepo(getDb())
  const fixed: StoredJob[] = []
  for (const j of repo.loadAll()) {
    if (j.status === 'running') {
      j.status = 'queued'
      fixed.push(j)
    }
    jobs.set(j.id, j)
  }
  if (fixed.length) repo.saveMany(fixed)
  // retomada após reinício é decisão do usuário
  paused = [...jobs.values()].some((j) => j.status === 'queued')
}

/** Ao fechar o app: interrompe downloads (o .part fica) e devolve-os à fila. */
export async function shutdownQueue(): Promise<void> {
  await Promise.all([...running.keys()].map((id) => kill(id, 'requeue')))
}

export function listQueue(): { jobs: QueueJob[]; state: QueueState } {
  return { jobs: [...jobs.values()].sort((a, b) => a.position - b.position).map(publicJob), state: state() }
}

// ---------- comandos ----------

export function addToQueue(items: EnqueueItem[]): { added: number; retried: number; skippedDuplicates: number } {
  const s = getSettings()
  const sameDir = [...jobs.values()].filter((j) => j.outputDir === s.outputDir)
  const active = new Set(sameDir.filter((j) => j.status === 'queued' || j.status === 'running' || j.status === 'paused').map((j) => j.videoId))
  // vídeo que já falhou nesta pasta: re-tenta o job existente (mantém a posição) em vez de duplicar no fim
  const failed = new Map(sameDir.filter((j) => j.status === 'error').map((j) => [j.videoId, j]))
  let retried = 0
  for (const item of items) {
    const f = failed.get(item.videoId)
    if (f && !active.has(item.videoId)) {
      retryJob(f.id)
      active.add(item.videoId)
      retried++
    }
  }
  const fresh = items.filter((i) => !active.has(i.videoId))
  let position = Math.max(0, ...[...jobs.values()].map((j) => j.position))
  const now = Date.now()
  const created: StoredJob[] = fresh.map((item, i) => ({
    id: randomUUID(),
    videoId: item.videoId,
    playlistId: item.playlistId,
    url: item.url,
    title: item.title,
    position: ++position,
    status: 'queued',
    attempts: 0,
    progress: null,
    postprocessor: null,
    outputDir: s.outputDir,
    filePath: null,
    error: null,
    errorKind: null,
    command: null,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    // formato e nome são fixados no momento de enfileirar (a ordem do lote define a numeração)
    format: item.formatId ?? formatSelector(s.audioFormat),
    outputTemplate: s.numberFiles ? numberedTemplate(s.outputTemplate, i + 1, fresh.length) : s.outputTemplate,
    tempPath: null
  }))
  repo?.saveMany(created)
  for (const j of created) {
    jobs.set(j.id, j)
    touch(j)
  }
  flush()
  void tick()
  return { added: created.length, retried, skippedDuplicates: items.length - fresh.length - retried }
}

export async function pauseAll(): Promise<void> {
  paused = true
  await Promise.all([...running.keys()].map((id) => kill(id, 'requeue')))
  flush()
}

export function resumeAll(): void {
  paused = false
  clearCooldown() // retomar manualmente também encerra a espera anti-bloqueio
  flush()
  void tick()
}

export async function pauseJob(id: string): Promise<void> {
  const j = jobs.get(id)
  if (!j) return
  if (running.has(id)) await kill(id, 'pause')
  else if (j.status === 'queued') {
    j.status = 'paused'
    notBefore.delete(id)
    touch(j, true)
  }
}

export function resumeJob(id: string): void {
  const j = jobs.get(id)
  if (!j || j.status !== 'paused') return
  j.status = 'queued'
  touch(j, true)
  void tick()
}

export function retryJob(id: string): void {
  const j = jobs.get(id)
  if (!j || (j.status !== 'error' && j.status !== 'skipped')) return
  Object.assign(j, { status: 'queued', attempts: 0, error: null, errorKind: null, finishedAt: null })
  notBefore.delete(id)
  touch(j, true)
  void tick()
}

/**
 * Troca o vídeo de um job (faixa substituída), mantendo posição e nome de arquivo/numeração.
 * O formato volta para a preferência atual (uma escolha manual era de outro vídeo).
 */
export async function replaceJob(id: string, video: { videoId: string; url: string; title: string }): Promise<void> {
  const j = jobs.get(id)
  if (!j || j.status === 'done' || j.status === 'skipped') return
  if (running.has(id)) await kill(id, 'requeue')
  await removePartialFiles(j.outputDir, j.tempPath) // .part do vídeo antigo
  Object.assign(j, {
    videoId: video.videoId,
    url: video.url,
    title: video.title,
    status: 'queued',
    attempts: 0,
    error: null,
    errorKind: null,
    finishedAt: null,
    progress: null,
    tempPath: null,
    command: null,
    format: formatSelector(getSettings().audioFormat)
  })
  notBefore.delete(id)
  touch(j, true)
  flush()
  void tick()
}

export async function removeJob(id: string): Promise<void> {
  const j = jobs.get(id)
  if (!j) return
  if (running.has(id)) await kill(id, 'remove')
  jobs.delete(id)
  notBefore.delete(id)
  repo?.remove([id])
  if (j.status !== 'done' && j.status !== 'skipped') await removePartialFiles(j.outputDir, j.tempPath)
  send({ type: 'removed', ids: [id] })
  flush()
}

/** Recoloca na fila todos os jobs com erro (tentativas zeradas). */
export function retryFailed(): number {
  const failed = [...jobs.values()].filter((j) => j.status === 'error')
  failed.forEach((j) => retryJob(j.id))
  return failed.length
}

export function clearFinished(): void {
  const ids = [...jobs.values()].filter((j) => j.status === 'done' || j.status === 'skipped').map((j) => j.id)
  ids.forEach((id) => jobs.delete(id))
  repo?.remove(ids)
  send({ type: 'removed', ids })
  flush()
}

// ---------- agendamento ----------

function nextJob(): StoredJob | null {
  const now = Date.now()
  let best: StoredJob | null = null
  for (const j of jobs.values()) {
    if (j.status !== 'queued' || running.has(j.id)) continue
    if ((notBefore.get(j.id) ?? 0) > now) continue
    if (!best || j.position < best.position) best = j
  }
  return best
}

/** Inicia jobs até preencher a concorrência. Reentrante de forma segura. */
async function tick(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    while (!paused && !cooldownUntil) {
      const concurrency = PROFILES[getSettings().antiBlock]?.concurrency ?? 1
      if (running.size >= concurrency) break
      const j = nextJob()
      if (!j) break
      await start(j)
    }
  } finally {
    ticking = false
  }
  scheduleRetryWakeup()
}

/** Acorda o agendador quando o próximo job em espera de retry ficar disponível. */
function scheduleRetryWakeup(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  const waits = [...notBefore.entries()].filter(([id]) => jobs.get(id)?.status === 'queued').map(([, t]) => t)
  if (!waits.length) return
  retryTimer = setTimeout(() => void tick(), Math.max(0, Math.min(...waits) - Date.now()) + 50)
}

async function start(j: StoredJob): Promise<void> {
  const s = getSettings()

  // sincronização (R9): já está no archive da pasta → nem chama o yt-dlp
  if ((await readArchiveIds(j.outputDir)).includes(j.videoId)) {
    finish(j, { kind: 'skipped' })
    return
  }

  let tools
  try {
    tools = await resolveToolPaths()
    await mkdir(j.outputDir, { recursive: true })
  } catch (e) {
    Object.assign(j, { status: 'error', error: (e as Error).message, errorKind: 'setup', finishedAt: Date.now() })
    touch(j, true)
    return
  }

  const args = buildDownloadArgs({
    url: j.url,
    format: j.format,
    outputDir: j.outputDir,
    outputTemplate: j.outputTemplate,
    cropThumbnail: s.cropThumbnail,
    ffmpegLocation: tools.ffmpegDir,
    denoPath: tools.deno,
    archiveFile: archiveFileFor(j.outputDir),
    appArgs: [...antiBlockArgs(s.antiBlock, true, s.limitRate), ...cookieArgs(s)],
    extraArgs: s.extraArgs
  })

  Object.assign(j, {
    status: 'running',
    startedAt: Date.now(),
    command: formatCommand(tools.ytdlp, args),
    progress: null,
    postprocessor: null,
    error: null,
    errorKind: null
  })
  notBefore.delete(j.id)
  touch(j, true)

  let filePath: string | null = null
  let archived = false
  const errors: string[] = []
  const stderrTail: string[] = []

  const onLine = (stream: 'stdout' | 'stderr') => (line: string) => {
    const p = parseLine(line)
    switch (p.type) {
      case 'progress':
        j.progress = p.progress
        if (p.progress.filename) j.tempPath = p.progress.filename
        touch(j)
        return
      case 'postprocess':
        j.postprocessor = p.postprocessor
        touch(j)
        return
      case 'file':
        filePath = p.path
        return
      case 'archived':
        archived = true
        return
      case 'error':
        errors.push(p.message)
        break
    }
    if (stream === 'stderr') {
      stderrTail.push(line)
      if (stderrTail.length > 20) stderrTail.shift()
    }
  }

  const handle = run(tools.ytdlp, args, { onStdout: onLine('stdout'), onStderr: onLine('stderr') })
  running.set(j.id, handle)
  void handle.done.then(({ code, killed }) => {
    running.delete(j.id)
    const reason = killReasons.get(j.id)
    killReasons.delete(j.id)
    if (!jobs.has(j.id)) return // removido
    j.postprocessor = null
    if (killed) {
      j.status = reason === 'pause' ? 'paused' : 'queued'
      j.progress = j.progress ? { ...j.progress, speed: null, eta: null } : null
      touch(j, true)
    } else {
      finish(j, decideOutcome({ code, filePath, archived, errors, stderrTail, attempts: j.attempts }))
    }
    void tick()
  })
}

function finish(j: StoredJob, outcome: ReturnType<typeof decideOutcome>): void {
  const now = Date.now()
  switch (outcome.kind) {
    case 'done':
      Object.assign(j, { status: 'done', filePath: outcome.filePath, finishedAt: now })
      if (j.progress) j.progress = { ...j.progress, status: 'finished', speed: null, eta: null }
      backoffLevel = 0 // um sucesso zera a escada de espera
      round.done++
      if (outcome.filePath) recordDownload(j.videoId, j.outputDir, outcome.filePath, j.title)
      send({ type: 'archived', outputDir: j.outputDir, videoId: j.videoId })
      break
    case 'skipped':
      Object.assign(j, { status: 'skipped', finishedAt: now, error: null })
      round.skipped++
      send({ type: 'archived', outputDir: j.outputDir, videoId: j.videoId })
      break
    case 'retry':
      logFailure(j, outcome.error, outcome.errorKind, j.attempts + 1, false)
      Object.assign(j, { status: 'queued', attempts: j.attempts + 1, error: outcome.error, errorKind: outcome.errorKind })
      notBefore.set(j.id, now + outcome.delayMs)
      break
    case 'rate-limit':
      // volta para a fila (sem contar tentativa) e pausa tudo por um tempo
      logFailure(j, outcome.error, 'rate-limit', j.attempts + 1, false)
      Object.assign(j, { status: 'queued', error: outcome.error, errorKind: 'rate-limit' })
      startCooldown(outcome.error)
      break
    case 'error':
      logFailure(j, outcome.error, outcome.errorKind, j.attempts + 1, true)
      round.error++
      Object.assign(j, { status: 'error', attempts: j.attempts + 1, error: outcome.error, errorKind: outcome.errorKind, finishedAt: now })
      break
  }
  touch(j, true)
}

/** Registra a falha no log de erros (fase 5). A mensagem vem sem o prefixo "[youtube] <id>: ". */
function logFailure(j: StoredJob, error: string, kind: string, attempt: number, final: boolean): void {
  recordError({
    jobId: j.id,
    videoId: j.videoId,
    playlistId: j.playlistId,
    title: j.title,
    url: j.url,
    message: splitVideoError(error).message,
    kind,
    command: j.command,
    attempt,
    final
  })
}

// ---------- anti-bloqueio ----------

function startCooldown(reason: string): void {
  if (cooldownUntil) return
  const wait = backoffMs(backoffLevel)
  backoffLevel++
  cooldownUntil = Date.now() + wait
  cooldownReason = reason
  notifyCooldown(Math.round(wait / 60_000))
  // para os outros downloads em andamento: insistir agrava o bloqueio
  for (const id of running.keys()) void kill(id, 'requeue')
  cooldownTimer = setTimeout(() => {
    clearCooldown()
    flush()
    void tick()
  }, wait)
  flush()
}

function clearCooldown(): void {
  if (cooldownTimer) clearTimeout(cooldownTimer)
  cooldownTimer = null
  cooldownUntil = null
  cooldownReason = null
}

async function kill(id: string, reason: KillReason): Promise<void> {
  const h = running.get(id)
  if (!h) return
  killReasons.set(id, reason)
  await h.kill()
  await h.done
}
