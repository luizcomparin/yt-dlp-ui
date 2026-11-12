import { create } from 'zustand'
import type { QueueEvent, QueueJob, QueueState } from '@shared/ipc'
import { usePlaylist } from './playlist'
import { useSettings } from './settings'
import { writeCurrentM3u } from './useVisibleTracks'

interface QueueStore {
  jobs: Record<string, QueueJob>
  /** ids ordenados por posição na fila. */
  order: string[]
  /** videoId → id do job mais recente daquele vídeo (para o status na tabela). */
  byVideo: Record<string, string>
  state: QueueState | null
  apply(e: QueueEvent): void
  init(): Promise<void>
}

function index(jobs: Record<string, QueueJob>): Pick<QueueStore, 'order' | 'byVideo'> {
  const list = Object.values(jobs).sort((a, b) => a.position - b.position)
  const byVideo: Record<string, string> = {}
  for (const j of list) byVideo[j.videoId] = j.id // o último (maior posição) vence
  return { order: list.map((j) => j.id), byVideo }
}

export const useQueue = create<QueueStore>((set) => ({
  jobs: {},
  order: [],
  byVideo: {},
  state: null,

  init: async () => {
    const { jobs, state } = await window.api.queue.list()
    const map = Object.fromEntries(jobs.map((j) => [j.id, j]))
    set({ jobs: map, state, ...index(map) })
  },

  apply: (e) =>
    set((s) => {
      switch (e.type) {
        case 'jobs': {
          const jobs = { ...s.jobs }
          let structural = false
          for (const j of e.jobs) {
            if (!jobs[j.id] || jobs[j.id].position !== j.position) structural = true
            jobs[j.id] = j
          }
          // só reordena quando entram jobs novos (progresso não muda a ordem)
          return structural ? { jobs, ...index(jobs) } : { jobs }
        }
        case 'removed': {
          const jobs = { ...s.jobs }
          e.ids.forEach((id) => delete jobs[id])
          return { jobs, ...index(jobs) }
        }
        case 'state': {
          const prev = s.state
          const wasBusy = !!prev && prev.counts.queued + prev.counts.running > 0
          const idle = e.state.counts.queued + e.state.counts.running === 0
          if (wasBusy && idle) void onQueueDrained()
          return { state: e.state }
        }
        case 'archived': {
          // mantém a marca "baixada" da tabela em dia (se for a pasta atual)
          if (useSettings.getState().settings?.outputDir === e.outputDir) usePlaylist.getState().markArchived([e.videoId])
          return {}
        }
      }
    })
}))

/** Fila esvaziou: atualiza as marcas da pasta e, se ligado, gera o M3U da playlist carregada (R10). */
async function onQueueDrained(): Promise<void> {
  const settings = useSettings.getState().settings
  if (!settings) return
  await usePlaylist.getState().refreshFolder(settings.outputDir)
  const pl = usePlaylist.getState().playlist
  if (settings.autoM3u && pl && !pl.isSingleVideo) await writeCurrentM3u()
}

export function bindQueueEvents(): () => void {
  void useQueue.getState().init()
  return window.api.queue.onEvent((e) => useQueue.getState().apply(e))
}
