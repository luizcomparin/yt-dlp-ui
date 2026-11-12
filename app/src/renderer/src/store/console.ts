import { create } from 'zustand'
import type { ConsoleEvent } from '@shared/ipc'

export interface ConsoleLine {
  stream: 'stdout' | 'stderr' | 'meta'
  text: string
}

const MAX_LINES = 5000

interface ConsoleState {
  lines: ConsoleLine[]
  runId: string | null
  running: boolean
  apply(e: ConsoleEvent): void
  clear(): void
  addMeta(text: string): void
}

/** Saída do console (mantida enquanto o app estiver aberto, mesmo com a tela fechada). */
export const useConsole = create<ConsoleState>((set) => ({
  lines: [],
  runId: null,
  running: false,
  apply: (e) =>
    set((s) => {
      switch (e.type) {
        case 'start':
          return {
            runId: e.runId,
            running: true,
            lines: [...s.lines, { stream: 'meta' as const, text: `$ ${e.command}` }, { stream: 'meta' as const, text: `  (em ${e.cwd})` }].slice(-MAX_LINES)
          }
        case 'lines':
          return { lines: [...s.lines, ...e.lines].slice(-MAX_LINES) }
        case 'exit':
          return {
            running: false,
            lines: [
              ...s.lines,
              { stream: 'meta' as const, text: `— ${e.killed ? 'interrompido' : `código ${e.code}`} em ${(e.ms / 1000).toFixed(1)} s` }
            ].slice(-MAX_LINES)
          }
      }
    }),
  clear: () => set({ lines: [] }),
  addMeta: (text) => set((s) => ({ lines: [...s.lines, { stream: 'meta' as const, text }].slice(-MAX_LINES) }))
}))

export function bindConsoleEvents(): () => void {
  return window.api.console.onEvent((e) => useConsole.getState().apply(e))
}
