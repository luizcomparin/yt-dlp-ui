// Detecção de duplicadas por nome de arquivo (R14).
// O yt-dlp no Windows troca caracteres proibidos por equivalentes "fullwidth" (/ → ⧸, : → ：, ? → ？…).
// Para comparar título com nome de arquivo, ambos viram uma chave canônica: sem acentos, minúsculas,
// só letras/dígitos (de qualquer alfabeto), sem prefixo numérico "001 - ".

const FULLWIDTH: Record<string, string> = {
  '⧸': '/', '⧹': '\\', '：': ':', '＊': '*', '？': '?', '＂': '"', '＜': '<', '＞': '>', '｜': '|'
}

export const AUDIO_EXTENSIONS = ['opus', 'm4a', 'mp3', 'webm', 'ogg', 'flac', 'aac', 'wav', 'mka']

/** Chave canônica de um texto (título ou nome de arquivo sem extensão). */
export function nameKey(s: string): string {
  return s
    .replace(/[⧸⧹：＊？＂＜＞｜]/g, (c) => FULLWIDTH[c] ?? c)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Chave de um nome de arquivo: tira a extensão de áudio e o prefixo "001 - " da numeração. */
export function fileKey(fileName: string): string | null {
  const m = fileName.match(/^(.*)\.([a-z0-9]+)$/i)
  if (!m || !AUDIO_EXTENSIONS.includes(m[2].toLowerCase())) return null
  return nameKey(m[1].replace(/^\d{1,4} - /, '')) || null
}
