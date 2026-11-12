import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels, type RendererApi } from '@shared/ipc'

/** Assina um evento main → renderer e devolve a função para cancelar a assinatura. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// Única ponte entre a UI e o processo principal.
// A UI nunca acessa Node/Electron diretamente, só o que está em `window.api`.
const api: RendererApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.appInfo),
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.settingsGet),
    update: (patch) => ipcRenderer.invoke(IpcChannels.settingsUpdate, patch),
    onChanged: (cb) => subscribe(IpcChannels.settingsChanged, cb)
  },
  deps: {
    status: () => ipcRenderer.invoke(IpcChannels.depsStatus),
    install: (name) => ipcRenderer.invoke(IpcChannels.depsInstall, name),
    updateYtdlp: () => ipcRenderer.invoke(IpcChannels.depsUpdateYtdlp),
    onProgress: (cb) => subscribe(IpcChannels.depsProgress, cb)
  },
  dialog: {
    pickFolder: (defaultPath) => ipcRenderer.invoke(IpcChannels.dialogPickFolder, defaultPath),
    pickFile: (filterName, extensions) => ipcRenderer.invoke(IpcChannels.dialogPickFile, filterName, extensions),
    saveText: (defaultName, content, filterName, extensions) =>
      ipcRenderer.invoke(IpcChannels.dialogSaveText, defaultName, content, filterName, extensions)
  },
  shell: {
    showItem: (path) => ipcRenderer.invoke(IpcChannels.shellShowItem, path),
    openLogs: () => ipcRenderer.invoke(IpcChannels.shellOpenLogs),
    openExternal: (url) => ipcRenderer.invoke(IpcChannels.shellOpenExternal, url)
  },
  console: {
    run: (req) => ipcRenderer.invoke(IpcChannels.consoleRun, req),
    kill: () => ipcRenderer.invoke(IpcChannels.consoleKill),
    onEvent: (cb) => subscribe(IpcChannels.consoleEvent, cb)
  },
  cookies: {
    test: () => ipcRenderer.invoke(IpcChannels.cookiesTest)
  },
  errors: {
    list: () => ipcRenderer.invoke(IpcChannels.errorsList),
    clear: () => ipcRenderer.invoke(IpcChannels.errorsClear),
    onEvent: (cb) => subscribe(IpcChannels.errorsEvent, cb)
  },
  queue: {
    list: () => ipcRenderer.invoke(IpcChannels.queueList),
    add: (items) => ipcRenderer.invoke(IpcChannels.queueAdd, items),
    pauseAll: () => ipcRenderer.invoke(IpcChannels.queuePauseAll),
    resumeAll: () => ipcRenderer.invoke(IpcChannels.queueResumeAll),
    pauseJob: (id) => ipcRenderer.invoke(IpcChannels.queuePauseJob, id),
    resumeJob: (id) => ipcRenderer.invoke(IpcChannels.queueResumeJob, id),
    retryJob: (id) => ipcRenderer.invoke(IpcChannels.queueRetryJob, id),
    removeJob: (id) => ipcRenderer.invoke(IpcChannels.queueRemoveJob, id),
    clearFinished: () => ipcRenderer.invoke(IpcChannels.queueClearFinished),
    retryFailed: () => ipcRenderer.invoke(IpcChannels.queueRetryFailed),
    replaceJob: (id, video) => ipcRenderer.invoke(IpcChannels.queueReplaceJob, id, video),
    onEvent: (cb) => subscribe(IpcChannels.queueEvent, cb)
  },
  archive: {
    ids: (outputDir) => ipcRenderer.invoke(IpcChannels.archiveIds, outputDir)
  },
  library: {
    folderInfo: (outputDir, videoIds) => ipcRenderer.invoke(IpcChannels.folderInfo, outputDir, videoIds),
    writeM3u: (req) => ipcRenderer.invoke(IpcChannels.m3uWrite, req)
  },
  clipboard: {
    onUrl: (cb) => subscribe(IpcChannels.clipboardUrl, cb)
  },
  playlist: {
    load: (url, opts) => ipcRenderer.invoke(IpcChannels.playlistLoad, url, opts),
    cancel: () => ipcRenderer.invoke(IpcChannels.playlistCancel),
    search: (query) => ipcRenderer.invoke(IpcChannels.playlistSearch, query),
    replace: (req) => ipcRenderer.invoke(IpcChannels.playlistReplace, req),
    unreplace: (playlistId, originalId) => ipcRenderer.invoke(IpcChannels.playlistUnreplace, playlistId, originalId),
    onEvent: (cb) => subscribe(IpcChannels.playlistEvent, cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
