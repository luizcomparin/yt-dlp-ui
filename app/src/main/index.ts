import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { initQueue, shutdownQueue } from './queue/manager'
import { killConsole } from './console'
import { startClipboardWatch, stopClipboardWatch } from './system/clipboard'
import { cancelPlaylistLoad } from './playlist/service'
import { closeDb, openDb } from './db'
import { dbFile } from './paths'

// Pasta de dados alternativa (testes de "primeira execução", ou manter dados separados).
// Precisa ser definida antes do app ficar pronto.
if (process.env.YTUI_USER_DATA) app.setPath('userData', process.env.YTUI_USER_DATA)

// Uma instância só: duas cópias disputariam a mesma fila e o mesmo banco.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

/**
 * AppUserModelId para notificações do Windows. Só o instalador (NSIS) cria o atalho no Menu Iniciar
 * registrando 'com.ytdlpui.app' — detectado pelo desinstalador ao lado do .exe. Em dev, no .exe
 * portable e na pasta win-unpacked não há atalho: o caminho do executável funciona como id
 * (verificado: a notificação aparece).
 */
function appUserModelId(): string {
  const installed = app.isPackaged && existsSync(join(dirname(process.execPath), `Uninstall ${app.getName()}.exe`))
  return installed ? 'com.ytdlpui.app' : process.execPath
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Links externos abrem no navegador padrão, nunca dentro do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId(appUserModelId())
  openDb(dbFile())
  initQueue()
  registerIpcHandlers()
  createWindow()
  startClipboardWatch()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Ao sair, mata os yt-dlp em andamento (e seus filhos) para não deixar processos órfãos.
let quitting = false
app.on('before-quit', (e) => {
  if (quitting) return
  e.preventDefault()
  quitting = true
  stopClipboardWatch()
  void Promise.allSettled([shutdownQueue(), cancelPlaylistLoad(), killConsole()]).finally(() => {
    closeDb()
    app.quit()
  })
})
