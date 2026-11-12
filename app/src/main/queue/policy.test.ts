import { describe, expect, it } from 'vitest'
import { decideOutcome, MAX_ATTEMPTS, numberedTemplate, type ExitInfo } from './policy'
import { parseArchive, partialFiles } from './files'

const exit = (over: Partial<ExitInfo>): ExitInfo => ({
  code: 1, filePath: null, archived: false, errors: [], stderrTail: [], attempts: 0, ...over
})

describe('decideOutcome', () => {
  it('sucesso', () => {
    expect(decideOutcome(exit({ code: 0, filePath: 'C:\\a.opus' }))).toEqual({ kind: 'done', filePath: 'C:\\a.opus' })
  })
  it('já no archive → skipped (mesmo com código 0)', () => {
    expect(decideOutcome(exit({ code: 0, archived: true }))).toEqual({ kind: 'skipped' })
  })
  it('código 0 sem arquivo final → skipped (yt-dlp em modo quiet não avisa do archive)', () => {
    expect(decideOutcome(exit({ code: 0, filePath: null }))).toEqual({ kind: 'skipped' })
  })
  it('bloqueio do YouTube → rate-limit', () => {
    const r = decideOutcome(exit({ errors: ["[youtube] abc: Sign in to confirm you're not a bot"] }))
    expect(r.kind).toBe('rate-limit')
  })
  it('bloqueio em qualquer linha tem prioridade sobre o último erro', () => {
    const r = decideOutcome(exit({ errors: ['[youtube] a: HTTP Error 429: Too Many Requests', '[youtube] a: Requested format is not available'] }))
    expect(r.kind).toBe('rate-limit')
  })
  it('403 (erro real dos downloads do usuário) → retry, mesmo seguido de outro erro', () => {
    expect(decideOutcome(exit({ errors: ['unable to download video data: HTTP Error 403: Forbidden'] }))).toMatchObject({ kind: 'retry', errorKind: 'forbidden' })
    expect(
      decideOutcome(exit({ errors: ['unable to download video data: HTTP Error 403: Forbidden', '[youtube] x: Requested format is not available'] }))
    ).toMatchObject({ kind: 'retry', errorKind: 'forbidden' })
    expect(decideOutcome(exit({ errors: ['HTTP Error 403: Forbidden'], attempts: MAX_ATTEMPTS - 1 }))).toMatchObject({ kind: 'error', errorKind: 'forbidden' })
  })
  it('erro de rede → retry com espera crescente, até o limite', () => {
    const net = ['Unable to download webpage: <urlopen error timed out>']
    expect(decideOutcome(exit({ errors: net, attempts: 0 }))).toMatchObject({ kind: 'retry', delayMs: 15000 })
    expect(decideOutcome(exit({ errors: net, attempts: 1 }))).toMatchObject({ kind: 'retry', delayMs: 30000 })
    expect(decideOutcome(exit({ errors: net, attempts: MAX_ATTEMPTS - 1 }))).toMatchObject({ kind: 'error', errorKind: 'network' })
  })
  it('erro permanente → error sem retry', () => {
    expect(decideOutcome(exit({ errors: ['[youtube] abc: Private video. Sign in'] }))).toMatchObject({ kind: 'error', errorKind: 'private' })
  })
  it('processo morreu sem ERROR: → transitório', () => {
    expect(decideOutcome(exit({ code: 3221225477, stderrTail: ['algo'] }))).toMatchObject({ kind: 'retry' })
  })
})

describe('numberedTemplate', () => {
  it('largura mínima 2 e cresce com o total', () => {
    expect(numberedTemplate('%(title)s.%(ext)s', 3, 9)).toBe('03 - %(title)s.%(ext)s')
    expect(numberedTemplate('%(title)s.%(ext)s', 7, 612)).toBe('007 - %(title)s.%(ext)s')
  })
})

describe('archive e arquivos parciais', () => {
  it('lê ids do archive', () => {
    expect(parseArchive('youtube jNQXAC9IVRw\r\nyoutube fcnDmrtj6Sk\n\nsoundcloud 123\n')).toEqual(['jNQXAC9IVRw', 'fcnDmrtj6Sk'])
  })
  it('lista .part, .ytdl, arquivo e thumbnails', () => {
    const files = partialFiles('C:\\Music', 'C:\\Music\\Me at the zoo.webm')
    expect(files).toEqual([
      'C:\\Music\\Me at the zoo.webm.part',
      'C:\\Music\\Me at the zoo.webm.ytdl',
      'C:\\Music\\Me at the zoo.webm',
      'C:\\Music\\Me at the zoo.jpg',
      'C:\\Music\\Me at the zoo.webp',
      'C:\\Music\\Me at the zoo.png'
    ])
  })
})
