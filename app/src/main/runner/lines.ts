/**
 * Junta pedaços de texto de um stream e entrega linhas completas.
 * Aceita \n, \r\n e \r (barras de progresso costumam usar \r).
 */
export class LineSplitter {
  private buffer = ''

  constructor(private readonly onLine: (line: string) => void) {}

  push(chunk: string): void {
    this.buffer += chunk
    const parts = this.buffer.split(/\r\n|\n|\r/)
    this.buffer = parts.pop() ?? ''
    for (const line of parts) if (line.length > 0) this.onLine(line)
  }

  /** Entrega o que sobrou no buffer (chamar quando o stream fechar). */
  flush(): void {
    if (this.buffer.length > 0) this.onLine(this.buffer)
    this.buffer = ''
  }
}
