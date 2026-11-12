import { describe, expect, it } from 'vitest'
import { formatCommand, splitArgs } from './split-args'

describe('splitArgs', () => {
  it('divide por espaços', () => {
    expect(splitArgs('  --limit-rate   2M  -N 4 ')).toEqual(['--limit-rate', '2M', '-N', '4'])
  })

  it('respeita aspas duplas e simples', () => {
    expect(splitArgs(`-o "%(title)s - x.%(ext)s" --ppa 'a b'`)).toEqual(['-o', '%(title)s - x.%(ext)s', '--ppa', 'a b'])
  })

  it('aceita aspas escapadas e aspas internas de outro tipo', () => {
    expect(splitArgs(`"a \\"b\\"" "it's"`)).toEqual(['a "b"', "it's"])
  })

  it('mantém argumento vazio entre aspas', () => {
    expect(splitArgs(`--x ""`)).toEqual(['--x', ''])
  })

  it('preserva barras invertidas de caminhos Windows', () => {
    expect(splitArgs(`-P C:\\Users\\me`)).toEqual(['-P', 'C:\\Users\\me'])
  })

  it('erro em aspas não fechadas', () => {
    expect(() => splitArgs('-o "abc')).toThrow()
  })

  it('string vazia → lista vazia', () => {
    expect(splitArgs('   ')).toEqual([])
  })
})

describe('formatCommand', () => {
  it('coloca aspas só onde precisa', () => {
    expect(formatCommand('yt-dlp', ['-o', '%(title)s.%(ext)s', '-P', 'C:\\My Music'])).toBe(
      'yt-dlp -o %(title)s.%(ext)s -P "C:\\My Music"'
    )
  })
})
