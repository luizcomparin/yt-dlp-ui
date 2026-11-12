import { create } from 'zustand'
import type { DepName, DepStatus, DepsProgress } from '@shared/ipc'

interface DepsState {
  statuses: DepStatus[]
  loading: boolean
  progress: Partial<Record<DepName, DepsProgress>>
  message: string | null
  refresh(): Promise<void>
  install(name: DepName): Promise<void>
  updateYtdlp(): Promise<void>
}

export const useDeps = create<DepsState>((set, get) => ({
  statuses: [],
  loading: false,
  progress: {},
  message: null,

  refresh: async () => {
    set({ loading: true })
    try {
      set({ statuses: await window.api.deps.status() })
    } finally {
      set({ loading: false })
    }
  },

  install: async (name) => {
    set({ message: null })
    try {
      await window.api.deps.install(name)
    } catch (e) {
      set({ message: `Erro ao instalar ${name}: ${(e as Error).message}` })
    }
    await get().refresh()
  },

  updateYtdlp: async () => {
    set({ message: 'Atualizando yt-dlp…' })
    try {
      const { output } = await window.api.deps.updateYtdlp()
      set({ message: output || 'yt-dlp atualizado.' })
    } catch (e) {
      set({ message: (e as Error).message })
    }
    await get().refresh()
  }
}))

export function bindDepsEvents(): () => void {
  return window.api.deps.onProgress((p) =>
    useDeps.setState((s) => ({ progress: { ...s.progress, [p.name]: p } }))
  )
}
