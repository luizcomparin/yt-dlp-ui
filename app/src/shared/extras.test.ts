import { describe, expect, it } from 'vitest'
import { fileKey, nameKey } from './duplicates'
import { buildM3u, m3uFileName } from './m3u'

describe('duplicadas: chave de nome', () => {
  it('título e arquivo gerado pelo yt-dlp (fullwidth) batem', () => {
    // título real e arquivo real gerados nos testes da fase 1
    expect(nameKey('PSY - GANGNAM STYLE(강남스타일) M/V')).toBe(fileKey('PSY - GANGNAM STYLE(강남스타일) M⧸V.opus'))
    expect(nameKey('Nightcore - Who Are You? (Remix): Part 2')).toBe(fileKey('Nightcore - Who Are You？ (Remix)： Part 2.m4a'))
  })
  it('ignora acentos, caixa, prefixo numérico e pontuação', () => {
    expect(fileKey('007 - Canção Bonita!.opus')).toBe(nameKey('cancao bonita'))
  })
  it('só extensões de áudio', () => {
    expect(fileKey('capa.jpg')).toBeNull()
    expect(fileKey('.yt-dlp-archive.txt')).toBeNull()
    expect(fileKey('Música.webm.part')).toBeNull()
  })
})

describe('m3u', () => {
  it('gera #EXTM3U com duração e título', () => {
    expect(buildM3u([{ fileName: '01 - Bad Girl.opus', title: 'Nightcore - Bad Girl', durationSec: 145.4 }, { fileName: 'x.m4a', title: 'a\nb', durationSec: null }])).toBe(
      '#EXTM3U\r\n#EXTINF:145,Nightcore - Bad Girl\r\n01 - Bad Girl.opus\r\n#EXTINF:-1,a b\r\nx.m4a\r\n'
    )
  })
  it('nome de arquivo seguro', () => {
    expect(m3uFileName('Top: 100 / Songs?')).toBe('Top_ 100 _ Songs_.m3u8')
    expect(m3uFileName('  ')).toBe('playlist.m3u8')
  })
})
