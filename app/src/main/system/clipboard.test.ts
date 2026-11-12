import { describe, expect, it, vi } from 'vitest'

// o módulo importa 'electron' (não disponível no vitest): só a função pura é testada
vi.mock('electron', () => ({ clipboard: { readText: async () => '' } }))
vi.mock('../events', () => ({ broadcast: () => {} }))
vi.mock('../settings/store', () => ({ getSettings: () => ({ clipboardWatch: true }) }))

const { youtubeUrlFrom } = await import('./clipboard')

describe('youtubeUrlFrom', () => {
  it.each([
    ['https://www.youtube.com/playlist?list=PL-A66xQC1W2sRXti4CGn8n0_mNRqO4_E3', true],
    ['  https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL1  ', true],
    ['https://youtu.be/jNQXAC9IVRw', true],
    ['https://music.youtube.com/watch?v=abc', true],
    ['https://m.youtube.com/shorts/jNQXAC9IVRw', true],
    ['https://www.youtube.com/@canal', false],
    ['veja https://youtu.be/jNQXAC9IVRw', false],
    ['https://vimeo.com/123', false],
    ['texto qualquer', false]
  ])('%s → %s', (text, ok) => {
    expect(youtubeUrlFrom(text) !== null).toBe(ok)
  })
})
