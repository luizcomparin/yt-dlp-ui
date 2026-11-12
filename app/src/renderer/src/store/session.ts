import type { AvailabilityFilter } from '@shared/tracks'
import { usePlaylist } from './playlist'

// Sessão da interface: reabrir o app "de onde parou".
// Guardado no localStorage da janela (estado só de UI; os dados de verdade estão no SQLite):
//  - ui.session           → última playlist aberta, ordenação, filtro "Exibir", busca
//  - ui.sel:<url>         → seleção e formatos escolhidos daquela playlist
//  - ui.scroll:<url>      → posição de rolagem da tabela

const SESSION_KEY = 'ui.session'
const selKey = (url: string): string => `ui.sel:${url}`
export const scrollKey = (url: string): string => `ui.scroll:${url}`

interface Session {
  url: string
  sortId: string
  availabilityFilter: AvailabilityFilter
  filterText: string
}

interface SavedSelection {
  /** rowIds marcados / desmarcados explicitamente (faixas ausentes seguem a regra padrão). */
  on: string[]
  off: string[]
  formatOverride: Record<string, string>
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // armazenamento indisponível/cheio: segue sem lembrar
  }
}

export function readNumber(key: string): number | null {
  const n = read<number>(key)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export const writeNumber = (key: string, n: number): void => write(key, n)

/** Seleção salva de uma playlist (usada pelo `load` antes das faixas chegarem). */
export function savedSelection(url: string): { selected: Record<string, boolean>; formatOverride: Record<string, string> } | null {
  const s = read<SavedSelection>(selKey(url))
  if (!s) return null
  const selected: Record<string, boolean> = {}
  for (const id of s.on ?? []) selected[id] = true
  for (const id of s.off ?? []) selected[id] = false
  return { selected, formatOverride: s.formatOverride ?? {} }
}

/** Última URL aberta (para preencher o campo do cabeçalho). */
export const lastUrl = (): string => read<Session>(SESSION_KEY)?.url ?? ''

/**
 * Restaura a sessão e passa a salvá-la a cada mudança (com debounce).
 * Chamar uma vez no startup, depois que o store existir.
 */
export function startSession(): void {
  const s = read<Session>(SESSION_KEY)
  const store = usePlaylist.getState()
  if (s) {
    usePlaylist.setState({
      sortId: s.sortId ?? store.sortId,
      availabilityFilter: s.availabilityFilter ?? store.availabilityFilter,
      filterText: s.filterText ?? ''
    })
    if (s.url) void usePlaylist.getState().load(s.url)
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  usePlaylist.subscribe((st, prev) => {
    const changed =
      st.url !== prev.url ||
      st.sortId !== prev.sortId ||
      st.availabilityFilter !== prev.availabilityFilter ||
      st.filterText !== prev.filterText ||
      st.selected !== prev.selected ||
      st.formatOverride !== prev.formatOverride
    if (!changed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const cur = usePlaylist.getState()
      if (!cur.url) return
      write(SESSION_KEY, { url: cur.url, sortId: cur.sortId, availabilityFilter: cur.availabilityFilter, filterText: cur.filterText } satisfies Session)
      // só salva a seleção depois que a playlist tem faixas (evita gravar vazio durante o carregamento)
      if (cur.order.length) {
        const on: string[] = []
        const off: string[] = []
        for (const [id, v] of Object.entries(cur.selected)) (v ? on : off).push(id)
        write(selKey(cur.url), { on, off, formatOverride: cur.formatOverride } satisfies SavedSelection)
      }
    }, 500)
  })
}
