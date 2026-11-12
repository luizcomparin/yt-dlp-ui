// Lista de reprodução M3U8 (R10): UTF-8, caminhos relativos à pasta (funciona se a pasta for movida).

export interface M3uItem {
  /** Nome do arquivo (relativo à pasta onde o .m3u8 fica). */
  fileName: string
  title: string
  durationSec: number | null
}

export function buildM3u(items: M3uItem[]): string {
  const lines = ['#EXTM3U']
  for (const it of items) {
    lines.push(`#EXTINF:${it.durationSec != null ? Math.round(it.durationSec) : -1},${it.title.replace(/[\r\n]+/g, ' ')}`)
    lines.push(it.fileName)
  }
  return lines.join('\r\n') + '\r\n'
}

/** Nome seguro de arquivo para a playlist ("Nightcore" → "Nightcore.m3u8"). */
export function m3uFileName(playlistTitle: string): string {
  const clean = playlistTitle.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')
  return `${clean || 'playlist'}.m3u8`
}
