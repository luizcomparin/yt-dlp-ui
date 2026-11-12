import type { Availability } from '@shared/ipc'

export type ErrorKind =
  | 'private'
  | 'deleted'
  | 'age'
  | 'members'
  | 'premium'
  | 'geo'
  | 'live'
  | 'unavailable'
  | 'rate-limit'
  | 'forbidden'
  | 'network'
  | 'unknown'

export interface ClassifiedError {
  kind: ErrorKind
  /** Disponibilidade a gravar na faixa; `null` = não alterar (erro transitório). */
  availability: Availability | null
  /** Erros transitórios devem ser tentados de novo mais tarde. */
  transient: boolean
  /** Motivo curto em português para a UI. */
  reason: string
  /** Mensagem original do yt-dlp. */
  message: string
}

// Ordem importa: regras mais específicas primeiro.
const RULES: Array<{ re: RegExp; kind: ErrorKind; availability: Availability | null; transient: boolean; reason: string }> = [
  // 403 no download: o YouTube recusou/expirou o link do arquivo de áudio. Temporário — costuma resolver tentando de novo.
  { re: /HTTP Error 403|403: Forbidden/i, kind: 'forbidden', availability: null, transient: true, reason: 'acesso negado pelo YouTube (403), temporário' },
  { re: /not a bot|HTTP Error 429|Too Many Requests|rate.?limit/i, kind: 'rate-limit', availability: null, transient: true, reason: 'bloqueio temporário do YouTube (rate limit)' },
  { re: /private video/i, kind: 'private', availability: 'private', transient: false, reason: 'vídeo privado' },
  // Content ID: bloqueio por reivindicação (pode ser regional) → indisponível, não removido
  { re: /blocked due to the claimed content/i, kind: 'unavailable', availability: 'unavailable', transient: false, reason: 'bloqueado por reivindicação de direitos (gravadora)' },
  { re: /copyright/i, kind: 'deleted', availability: 'deleted', transient: false, reason: 'removido por direitos autorais' },
  { re: /account associated with this video has been terminated/i, kind: 'deleted', availability: 'deleted', transient: false, reason: 'conta do canal encerrada' },
  { re: /removed by the uploader|has been removed|was removed|deleted video/i, kind: 'deleted', availability: 'deleted', transient: false, reason: 'vídeo removido' },
  { re: /confirm your age|age.?restricted|inappropriate for some users/i, kind: 'age', availability: 'restricted', transient: false, reason: 'restrição de idade (requer cookies)' },
  { re: /members.?only|join this channel|available to this channel's members/i, kind: 'members', availability: 'restricted', transient: false, reason: 'exclusivo para membros' },
  { re: /premium/i, kind: 'premium', availability: 'restricted', transient: false, reason: 'exclusivo YouTube Premium' },
  { re: /not made this video available in your country|blocked it in your country|not available in your country|geo.?restrict/i, kind: 'geo', availability: 'unavailable', transient: false, reason: 'bloqueado na sua região' },
  { re: /live event will begin|premieres in|is_upcoming|this live event/i, kind: 'live', availability: 'unavailable', transient: false, reason: 'transmissão/estreia ainda não começou' },
  { re: /timed out|connection (reset|refused|aborted)|getaddrinfo|network is unreachable|temporary failure|HTTP Error 5\d\d|Unable to download (webpage|API page)/i, kind: 'network', availability: null, transient: true, reason: 'erro de rede' },
  { re: /video (is )?unavailable|no longer available|not available/i, kind: 'unavailable', availability: 'unavailable', transient: false, reason: 'vídeo indisponível' }
]

export function classifyError(message: string): ClassifiedError {
  for (const r of RULES) {
    if (r.re.test(message)) {
      return { kind: r.kind, availability: r.availability, transient: r.transient, reason: r.reason, message }
    }
  }
  return { kind: 'unknown', availability: 'unavailable', transient: false, reason: 'erro desconhecido', message }
}

/**
 * Extrai o ID do vídeo de uma mensagem de erro do yt-dlp.
 * Ex.: "[youtube] aaaaaaaaaaa: This video is unavailable" → { id, message }
 */
export function splitVideoError(message: string): { id: string | null; message: string } {
  const m = message.match(/^\[[\w:]+\]\s+([A-Za-z0-9_-]{11}):\s*(.*)$/s)
  return m ? { id: m[1], message: m[2] } : { id: null, message }
}
