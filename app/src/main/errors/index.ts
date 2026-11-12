import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannels, type ErrorEntry, type ErrorsEvent } from '@shared/ipc'
import { getDb } from '../db'
import { broadcast } from '../events'
import { logsDir } from '../paths'
import { createErrorLog, type ErrorLog, type NewError } from './log'

let log: ErrorLog | null = null

function errorLog(): ErrorLog {
  if (!log) {
    log = createErrorLog(getDb(), (fileName, line) => {
      mkdirSync(logsDir(), { recursive: true })
      appendFileSync(join(logsDir(), fileName), line + '\n', 'utf8')
    })
  }
  return log
}

const send = (e: ErrorsEvent): void => broadcast(IpcChannels.errorsEvent, e)

export function recordError(e: NewError): void {
  send({ type: 'added', entry: errorLog().record(e) })
}

export const listErrors = (): ErrorEntry[] => errorLog().list()

export function clearErrors(): void {
  errorLog().clear()
  send({ type: 'cleared' })
}
