// Geração de CSV compatível com o Excel em português:
// separador ";" (o Excel pt-BR usa vírgula como decimal) e BOM UTF-8 (para acentos/coreano abrirem certo).

export const CSV_BOM = '﻿'

function cell(v: unknown, sep: string): string {
  if (v == null) return ''
  const s = String(v)
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: unknown[][], sep = ';'): string {
  const lines = [headers, ...rows].map((r) => r.map((v) => cell(v, sep)).join(sep))
  return CSV_BOM + lines.join('\r\n') + '\r\n'
}

/** "2026-11-11 00:17:03" no fuso local (legível no Excel). */
export function csvDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
