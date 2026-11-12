// Perfis anti-bloqueio (R13). Valores aplicados tanto aos downloads quanto ao enriquecimento.

export type AntiBlockProfile = 'safe' | 'normal' | 'fast'

export interface ProfileSpec {
  label: string
  description: string
  /** Downloads simultâneos. */
  concurrency: number
  /** Processos de enriquecimento simultâneos. */
  enrichConcurrency: number
  /** `--sleep-requests`: pausa (s) entre requisições durante a extração. */
  sleepRequests: number
  /** `--sleep-interval` / `--max-sleep-interval`: pausa aleatória (s) antes de cada download. */
  sleepMin: number
  sleepMax: number
}

export const PROFILES: Record<AntiBlockProfile, ProfileSpec> = {
  safe: {
    label: 'Seguro',
    description: '1 download por vez, pausas aleatórias de 3–8 s. Mais lento, menor risco de bloqueio.',
    concurrency: 1,
    enrichConcurrency: 1,
    sleepRequests: 1,
    sleepMin: 3,
    sleepMax: 8
  },
  normal: {
    label: 'Normal',
    description: '2 downloads simultâneos, pausas de 1–4 s.',
    concurrency: 2,
    enrichConcurrency: 2,
    sleepRequests: 0.5,
    sleepMin: 1,
    sleepMax: 4
  },
  fast: {
    label: 'Rápido',
    description: '3 downloads simultâneos, sem pausas. Maior risco de bloqueio temporário.',
    concurrency: 3,
    enrichConcurrency: 3,
    sleepRequests: 0,
    sleepMin: 0,
    sleepMax: 0
  }
}

/** Argumentos do yt-dlp para o perfil. `forDownload` inclui a pausa antes do download. */
export function antiBlockArgs(profile: AntiBlockProfile, forDownload: boolean, limitRate?: string | null): string[] {
  const p = PROFILES[profile] ?? PROFILES.safe
  const args: string[] = []
  if (p.sleepRequests > 0) args.push('--sleep-requests', String(p.sleepRequests))
  if (forDownload && p.sleepMax > 0) args.push('--sleep-interval', String(p.sleepMin), '--max-sleep-interval', String(p.sleepMax))
  if (forDownload && limitRate?.trim()) args.push('--limit-rate', limitRate.trim())
  return args
}

/** Espera (min) após bloqueio do YouTube, crescendo a cada bloqueio seguido. */
export const BACKOFF_MINUTES = [1, 5, 15, 30]

export function backoffMs(level: number): number {
  return BACKOFF_MINUTES[Math.min(level, BACKOFF_MINUTES.length - 1)] * 60_000
}
