import { BrowserWindow } from 'electron'

/** Envia um evento main → renderer para todas as janelas abertas. */
export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
