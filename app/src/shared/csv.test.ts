import { describe, expect, it } from 'vitest'
import { CSV_BOM, csvDate, toCsv } from './csv'

describe('toCsv', () => {
  it('BOM, separador ; e CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe(`${CSV_BOM}a;b\r\n1;x\r\n`)
  })
  it('escapa aspas, separador e quebras de linha', () => {
    const out = toCsv(['t'], [['Bad "Girl"; remix'], ['linha1\nlinha2'], [null]])
    expect(out).toBe(`${CSV_BOM}t\r\n"Bad ""Girl""; remix"\r\n"linha1\nlinha2"\r\n\r\n`)
  })
  it('mantém unicode', () => {
    expect(toCsv(['t'], [['강남스타일 M⧸V']])).toContain('강남스타일 M⧸V')
  })
})

describe('csvDate', () => {
  it('formata no fuso local', () => {
    const ms = new Date(2026, 10, 11, 0, 17, 3).getTime()
    expect(csvDate(ms)).toBe('2026-11-11 00:17:03')
  })
})
