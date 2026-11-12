/**
 * Divide uma string de argumentos como um shell faria (aspas simples e duplas,
 * barra invertida só para escapar aspas). Ex.:
 *   `--limit-rate 2M -o "%(title)s.%(ext)s"` → ['--limit-rate', '2M', '-o', '%(title)s.%(ext)s']
 */
export function splitArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let hasToken = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quote) {
      if (ch === '\\' && input[i + 1] === quote) {
        current += quote
        i++
      } else if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch
      hasToken = true
    } else if (/\s/.test(ch)) {
      if (hasToken) {
        args.push(current)
        current = ''
        hasToken = false
      }
    } else {
      current += ch
      hasToken = true
    }
  }
  if (quote) throw new Error(`Aspas ${quote} não fechadas em: ${input}`)
  if (hasToken) args.push(current)
  return args
}

/** Monta uma string de comando legível (para "ver comando" e logs). */
export function formatCommand(bin: string, args: string[]): string {
  const q = (s: string): string => (s === '' || /[\s"'&|<>^]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s)
  return [bin, ...args].map(q).join(' ')
}
