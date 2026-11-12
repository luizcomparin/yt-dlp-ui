import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import {
  IpcChannels,
  type AppInfo,
  type ConsoleRunRequest,
  type DepName,
  type EnqueueItem,
  type M3uRequest,
  type PlaylistLoadOptions,
  type ReplaceRequest,
  type Settings
} from '@shared/ipc'
import { getSettings, updateSettings } from './settings/store'
import { getAllDepsStatus, installDep, updateYtdlp } from './deps'
import { cancelPlaylistLoad, loadPlaylist } from './playlist/service'
import { replaceTrack, searchVideos, unreplaceTrack } from './playlist/replace'
import * as queue from './queue/manager'
import { readArchiveIds } from './queue/files'
import { clearErrors, listErrors } from './errors'
import { killConsole, runConsole, testCookies } from './console'
import { folderInfo, writeM3u } from './library'
import { logsDir } from './paths'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Registra todos os handlers de IPC (renderer → main). */
export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.appInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform
  }))

  ipcMain.handle(IpcChannels.settingsGet, () => getSettings())
  ipcMain.handle(IpcChannels.settingsUpdate, (_e, patch: Partial<Settings>) => updateSettings(patch))

  ipcMain.handle(IpcChannels.depsStatus, () => getAllDepsStatus())
  ipcMain.handle(IpcChannels.depsInstall, (_e, name: DepName) => installDep(name))
  ipcMain.handle(IpcChannels.depsUpdateYtdlp, () => updateYtdlp())

  ipcMain.handle(IpcChannels.dialogPickFolder, async (e, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.OpenDialogOptions = { defaultPath, properties: ['openDirectory', 'createDirectory'] }
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  ipcMain.handle(IpcChannels.shellShowItem, (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle(IpcChannels.shellOpenExternal, async (_e, url: string) => {
    // só links do YouTube: a UI não deve conseguir abrir URLs arbitrárias
    if (/^https:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(url)) await shell.openExternal(url)
  })
  ipcMain.handle(IpcChannels.shellOpenLogs, async () => {
    await mkdir(logsDir(), { recursive: true })
    await shell.openPath(logsDir())
  })
  ipcMain.handle(
    IpcChannels.dialogSaveText,
    async (e, defaultName: string, content: string, filterName: string, extensions: string[]) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const options: Electron.SaveDialogOptions = {
        defaultPath: join(app.getPath('documents'), defaultName),
        filters: [{ name: filterName, extensions }]
      }
      const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (res.canceled || !res.filePath) return null
      await writeFile(res.filePath, content, 'utf8')
      return res.filePath
    }
  )

  ipcMain.handle(IpcChannels.dialogPickFile, async (e, filterName: string, extensions: string[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: filterName, extensions }] }
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  ipcMain.handle(IpcChannels.consoleRun, (_e, req: ConsoleRunRequest) => runConsole(req))
  ipcMain.handle(IpcChannels.consoleKill, () => killConsole())
  ipcMain.handle(IpcChannels.cookiesTest, () => testCookies())

  ipcMain.handle(IpcChannels.folderInfo, (_e, outputDir: string, videoIds: string[]) => folderInfo(outputDir, videoIds))
  ipcMain.handle(IpcChannels.m3uWrite, (_e, req: M3uRequest) => writeM3u(req))

  ipcMain.handle(IpcChannels.errorsList, () => listErrors())
  ipcMain.handle(IpcChannels.errorsClear, () => clearErrors())
  ipcMain.handle(IpcChannels.queueRetryFailed, () => queue.retryFailed())
  ipcMain.handle(IpcChannels.queueReplaceJob, (_e, id: string, video: { videoId: string; url: string; title: string }) =>
    queue.replaceJob(id, video)
  )

  ipcMain.handle(IpcChannels.playlistLoad, (_e, url: string, opts?: PlaylistLoadOptions) => loadPlaylist(url, opts))
  ipcMain.handle(IpcChannels.playlistCancel, () => cancelPlaylistLoad())
  ipcMain.handle(IpcChannels.playlistSearch, (_e, query: string) => searchVideos(query))
  ipcMain.handle(IpcChannels.playlistReplace, (_e, req: ReplaceRequest) => replaceTrack(req))
  ipcMain.handle(IpcChannels.playlistUnreplace, (_e, playlistId: string, originalId: string) => unreplaceTrack(playlistId, originalId))

  ipcMain.handle(IpcChannels.queueList, () => queue.listQueue())
  ipcMain.handle(IpcChannels.queueAdd, (_e, items: EnqueueItem[]) => queue.addToQueue(items))
  ipcMain.handle(IpcChannels.queuePauseAll, () => queue.pauseAll())
  ipcMain.handle(IpcChannels.queueResumeAll, () => queue.resumeAll())
  ipcMain.handle(IpcChannels.queuePauseJob, (_e, id: string) => queue.pauseJob(id))
  ipcMain.handle(IpcChannels.queueResumeJob, (_e, id: string) => queue.resumeJob(id))
  ipcMain.handle(IpcChannels.queueRetryJob, (_e, id: string) => queue.retryJob(id))
  ipcMain.handle(IpcChannels.queueRemoveJob, (_e, id: string) => queue.removeJob(id))
  ipcMain.handle(IpcChannels.queueClearFinished, () => queue.clearFinished())
  ipcMain.handle(IpcChannels.archiveIds, (_e, outputDir: string) => readArchiveIds(outputDir))
}
