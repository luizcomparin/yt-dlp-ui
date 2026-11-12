import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from '../db'
import { createErrorLog, jsonlName, type ErrorLog } from './log'

let log: ErrorLog
let lines: Array<[string, string]>

beforeEach(() => {
  lines = []
  log = createErrorLog(openDb(':memory:'), (f, l) => lines.push([f, l]))
})
afterEach(() => closeDb())

const base = {
  jobId: 'j1', videoId: 'm8zY2kd7EVs', playlistId: 'PL1', title: 'Música', url: 'https://www.youtube.com/watch?v=m8zY2kd7EVs',
  command: 'yt-dlp …', attempt: 1, final: true
}

describe('errorLog', () => {
  it('classifica, grava no banco e no JSONL do dia', () => {
    const e = log.record({ ...base, message: '[youtube] m8zY2kd7EVs: Private video. If the owner of this video has granted you access, please sign in.' })
    expect(e).toMatchObject({ kind: 'private', reason: 'vídeo privado', final: true, attempt: 1 })
    expect(log.list()).toHaveLength(1)
    expect(lines[0][0]).toBe(jsonlName(e.createdAt))
    expect(JSON.parse(lines[0][1])).toMatchObject({ videoId: 'm8zY2kd7EVs', kind: 'private' })
  })

  it('lista do mais recente para o mais antigo e limpa', () => {
    log.record({ ...base, message: 'timed out', final: false })
    log.record({ ...base, message: 'timed out', attempt: 2 })
    expect(log.list().map((e) => e.attempt)).toEqual([2, 1])
    expect(log.list()[1].final).toBe(false)
    log.clear()
    expect(log.list()).toHaveLength(0)
  })

  it('falha ao gravar o arquivo não impede o registro', () => {
    const l = createErrorLog(openDb(':memory:'), () => {
      throw new Error('disco cheio')
    })
    expect(() => l.record({ ...base, message: 'x' })).not.toThrow()
  })

  it('nome do arquivo usa a data local', () => {
    expect(jsonlName(new Date(2026, 10, 11, 23, 59).getTime())).toBe('errors-20261111.jsonl')
  })
})
