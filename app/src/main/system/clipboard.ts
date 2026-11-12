import { clipboard } from 'electron'
import { IpcChannels } from '@shared/ipc'
import { broadcast } from '../events'
import { getSettings } from '../settings/store'

// Monitor da área de transferência (R11): quando um link do YouTube é copiado, avisa a UI.
// Polling leve (1 s) — o Electron não tem evento de mudança do clipboard.
// No Electron 45, clipboard.readText() é assíncrono.

const POLL_MS = 1000
const YT = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?|playlist\?|shorts\/|live\/)|youtu\.be\/)\S+$/i

let timer: NodeJS.Timeout | null = null
let last: string | null = null
let reading = false

/** Extrai um link do YouTube do texto copiado (o texto inteiro precisa ser o link). */
export function youtubeUrlFrom(text: string): string | null {
  const t = text.trim()
  return t.length < 500 && YT.test(t) ? t : null
}

async function poll(): Promise<void> {
  if (reading) return
  reading = true
  try {
    const text = await clipboard.readText()
    // a primeira leitura só registra o que já estava copiado ao abrir o app
    if (last === null) {
      last = text
      return
    }
    if (text === last) return
    last = text
    if (!getSettings().clipboardWatch) return
    const url = youtubeUrlFrom(text)
    if (url) broadcast(IpcChannels.clipboardUrl, url)
  } catch {
    // clipboard ocupado por outro programa: tenta na próxima
  } finally {
    reading = false
  }
}

export function startClipboardWatch(): void {
  void poll()
  timer = setInterval(() => void poll(), POLL_MS)
}

export function stopClipboardWatch(): void {
  if (timer) clearInterval(timer)
  timer = null
}
