import { describe, expect, it } from 'vitest'
import { classifyError, splitVideoError } from './errors'

describe('splitVideoError', () => {
  it('extrai o id (formato real do yt-dlp)', () => {
    expect(splitVideoError('[youtube] aaaaaaaaaaa: This video is unavailable')).toEqual({
      id: 'aaaaaaaaaaa',
      message: 'This video is unavailable'
    })
  })
  it('sem id → id null', () => {
    expect(splitVideoError('Unable to download webpage')).toEqual({ id: null, message: 'Unable to download webpage' })
  })
})

describe('classifyError', () => {
  // mensagens reais (yt-dlp 2026.10.26) da playlist de uso do projeto
  const cases: Array<[string, string, string | null, boolean]> = [
    ['Private video. If the owner of this video has granted you access, please sign in. Use --cookies-from-browser or --cookies for the authentication.', 'private', 'private', false],
    ['Video unavailable. It was removed following a copyright removal request by DEAMN', 'deleted', 'deleted', false],
    ["Private video. Sign in if you've been granted access to this video", 'private', 'private', false],
    ['Video unavailable. This video has been removed by the uploader', 'deleted', 'deleted', false],
    ['This video is no longer available because the YouTube account associated with this video has been terminated.', 'deleted', 'deleted', false],
    ['Sign in to confirm your age. This video may be inappropriate for some users.', 'age', 'restricted', false],
    ['Join this channel to get access to members-only content like this video, and other exclusive perks.', 'members', 'restricted', false],
    ['The uploader has not made this video available in your country', 'geo', 'unavailable', false],
    ['This video is unavailable', 'unavailable', 'unavailable', false],
    ["Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication.", 'rate-limit', null, true],
    ['Unable to download API page: HTTP Error 429: Too Many Requests', 'rate-limit', null, true],
    ['Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>', 'network', null, true],
    // erro real dos downloads do usuário (6 faixas): temporário, deve ser re-tentado
    ['unable to download video data: HTTP Error 403: Forbidden', 'forbidden', null, true],
    ['algo inesperado', 'unknown', 'unavailable', false]
  ]
  it.each(cases)('%s', (msg, kind, availability, transient) => {
    const r = classifyError(msg)
    expect(r.kind).toBe(kind)
    expect(r.availability).toBe(availability)
    expect(r.transient).toBe(transient)
  })

  it('motivos específicos para direitos autorais e conta encerrada', () => {
    expect(classifyError('Video unavailable. It was removed following a copyright removal request by X').reason).toBe('removido por direitos autorais')
    expect(classifyError('This video is no longer available because the YouTube account associated with this video has been terminated.').reason).toBe('conta do canal encerrada')
    expect(classifyError('Video unavailable. It was blocked due to the claimed content by SME.')).toMatchObject({
      availability: 'unavailable',
      reason: 'bloqueado por reivindicação de direitos (gravadora)'
    })
  })
})
