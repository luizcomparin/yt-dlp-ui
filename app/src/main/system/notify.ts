import { BrowserWindow, Notification } from 'electron'
import { getSettings } from '../settings/store'

// Notificações do sistema (R15) e progresso no ícone da barra de tarefas.

function show(title: string, body: string): void {
  if (!getSettings().notifyOnFinish || !Notification.isSupported()) return
  const n = new Notification({ title, body, silent: false })
  n.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  n.on('show', () => console.info(`[notify] exibida: ${title}`))
  n.on('failed', (_e, err) => console.warn(`[notify] falhou: ${err}`))
  n.show()
}

export function notifyQueueFinished(done: number, skipped: number, errors: number): void {
  const parts = [`${done} baixadas`]
  if (skipped) parts.push(`${skipped} já existiam`)
  if (errors) parts.push(`${errors} com erro`)
  show(errors ? 'Downloads concluídos com erros' : 'Downloads concluídos', parts.join(' · '))
}

export function notifyCooldown(minutes: number): void {
  show('Fila pausada pelo YouTube', `O YouTube limitou as requisições. Retomando em ${minutes} min.`)
}

/** Progresso no ícone da barra de tarefas: 0..1, ou null para esconder. */
export function setTaskbarProgress(fraction: number | null, paused = false): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    if (fraction == null) win.setProgressBar(-1)
    else win.setProgressBar(Math.max(0, Math.min(1, fraction)), { mode: paused ? 'paused' : 'normal' })
  }
}
