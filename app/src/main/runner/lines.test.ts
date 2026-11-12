import { describe, expect, it } from 'vitest'
import { LineSplitter } from './lines'

const collect = (chunks: string[]): string[] => {
  const out: string[] = []
  const s = new LineSplitter((l) => out.push(l))
  chunks.forEach((c) => s.push(c))
  s.flush()
  return out
}

describe('LineSplitter', () => {
  it('junta linhas quebradas entre chunks', () => {
    expect(collect(['abc', 'def\nghi', '\n'])).toEqual(['abcdef', 'ghi'])
  })

  it('aceita \\r\\n e \\r', () => {
    expect(collect(['a\r\nb\rc\n'])).toEqual(['a', 'b', 'c'])
  })

  it('não perde \\r\\n dividido entre chunks', () => {
    expect(collect(['a\r', '\nb'])).toEqual(['a', 'b'])
  })

  it('entrega o resto no flush e ignora linhas vazias', () => {
    expect(collect(['x\n\n', 'y'])).toEqual(['x', 'y'])
  })
})
