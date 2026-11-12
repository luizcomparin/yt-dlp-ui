import { create } from 'zustand'
import type { Settings } from '@shared/ipc'

interface SettingsState {
  settings: Settings | null
  load(): Promise<void>
  save(patch: Partial<Settings>): Promise<void>
}

/** Configurações compartilhadas entre componentes (fonte da verdade: settings.json no main). */
export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  load: async () => set({ settings: await window.api.settings.get() }),
  save: async (patch) => set({ settings: await window.api.settings.update(patch) })
}))

export function bindSettingsEvents(): () => void {
  return window.api.settings.onChanged((settings) => useSettings.setState({ settings }))
}
