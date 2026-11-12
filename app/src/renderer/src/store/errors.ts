import { create } from 'zustand'
import type { ErrorEntry, ErrorsEvent } from '@shared/ipc'

interface ErrorsState {
  /** Mais recente primeiro. */
  entries: ErrorEntry[]
  /** Falhas finais desde que a tela de erros foi aberta pela última vez (badge do cabeçalho). */
  unseen: number
  init(): Promise<void>
  apply(e: ErrorsEvent): void
  markSeen(): void
}

export const useErrors = create<ErrorsState>((set) => ({
  entries: [],
  unseen: 0,
  init: async () => set({ entries: await window.api.errors.list() }),
  apply: (e) =>
    set((s) =>
      e.type === 'cleared'
        ? { entries: [], unseen: 0 }
        : { entries: [e.entry, ...s.entries], unseen: s.unseen + (e.entry.final ? 1 : 0) }
    ),
  markSeen: () => set({ unseen: 0 })
}))

export function bindErrorEvents(): () => void {
  void useErrors.getState().init()
  return window.api.errors.onEvent((e) => useErrors.getState().apply(e))
}

/** Rótulos em português dos tipos de erro (classifyError). */
export const KIND_LABEL: Record<string, string> = {
  private: 'privado',
  deleted: 'removido',
  unavailable: 'indisponível',
  geo: 'bloqueio regional',
  age: 'restrição de idade',
  members: 'só membros',
  premium: 'YouTube Premium',
  live: 'ao vivo / estreia',
  network: 'rede',
  'rate-limit': 'bloqueio do YouTube',
  setup: 'configuração',
  unknown: 'desconhecido'
}

export const kindLabel = (k: string): string => KIND_LABEL[k] ?? k
