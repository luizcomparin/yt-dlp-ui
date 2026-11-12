import { describe, expect, it } from 'vitest'
import { parseEnrichInfo, parseFlatEntry, parseYoutubeUrl } from './info'

describe('parseFlatEntry', () => {
  it('lê entrada de playlist (formato real)', () => {
    const e = parseFlatEntry({
      id: 'fcnDmrtj6Sk', title: 'Shakira, Burna Boy - Dai Dai (Official Video)', duration: 241, channel: 'Shakira',
      playlist_id: 'PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i', playlist_title: 'Top 100 Songs Global', playlist_count: 99,
      playlist_index: 1, playlist_channel: 'YouTube Music Global Charts'
    })
    expect(e).toMatchObject({
      id: 'fcnDmrtj6Sk', duration: 241, channel: 'Shakira', availability: null, index: 1,
      playlist: { id: 'PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i', title: 'Top 100 Songs Global', count: 99, channel: 'YouTube Music Global Charts' }
    })
  })

  it('vídeo único: sem playlist', () => {
    expect(parseFlatEntry({ id: 'jNQXAC9IVRw', title: 'Me at the zoo', duration: 19, channel: 'jawed' })?.playlist).toBeNull()
  })

  it('detecta privado e removido pelo título', () => {
    expect(parseFlatEntry({ id: 'aaaaaaaaaaa', title: '[Private video]' })?.availability).toBe('private')
    expect(parseFlatEntry({ id: 'bbbbbbbbbbb', title: '[Deleted video]' })?.availability).toBe('deleted')
  })

  it('detecta restrito pelo campo availability', () => {
    expect(parseFlatEntry({ id: 'ccccccccccc', title: 'x', availability: 'subscriber_only' })).toMatchObject({
      availability: 'restricted', availabilityReason: 'exclusivo para membros'
    })
  })

  it('sem id → null', () => {
    expect(parseFlatEntry({ title: 'x' })).toBeNull()
  })
})

describe('parseEnrichInfo', () => {
  // recorte da saída real do yt-dlp 2026.10.26
  const real = {
    id: 'fcnDmrtj6Sk', upload_date: '20260523', timestamp: 1779552843, availability: 'public', duration: 240,
    format_id: '251', ext: 'webm', acodec: 'opus', abr: 137.143, asr: 48000, filesize: 4116723, filesize_approx: 4116707,
    live_status: 'not_live', age_limit: 0,
    formats: [
      { format_id: '233', ext: 'mp4', vcodec: 'none', format_note: 'Default, low' },
      { format_id: '140', ext: 'm4a', acodec: 'mp4a.40.2', vcodec: 'none', abr: 129.5, filesize: 3887650, format_note: 'medium' },
      { format_id: '251-drc', ext: 'webm', acodec: 'opus', vcodec: 'none', abr: 107.4, filesize_approx: 255427, format_note: 'medium, DRC' },
      { format_id: '251', ext: 'webm', acodec: 'opus', vcodec: 'none', abr: 137.143, filesize: 4116723, format_note: 'medium' },
      { format_id: '137', ext: 'mp4', acodec: 'none', vcodec: 'avc1.640028', tbr: 4000 }
    ]
  }

  it('usa o formato bestaudio do topo e tamanho exato', () => {
    const r = parseEnrichInfo(real)!
    expect(r).toMatchObject({ id: 'fcnDmrtj6Sk', uploadDate: '20260523', availability: 'available', sizeBytes: 4116723, sizeIsEstimate: false })
    expect(r.bestFormat).toMatchObject({ formatId: '251', ext: 'webm', acodec: 'opus', abr: 137.143 })
  })

  it('lista só formatos de áudio com codec conhecido e marca DRC', () => {
    const r = parseEnrichInfo(real)!
    expect(r.formats.map((f) => f.formatId)).toEqual(['140', '251-drc', '251'])
    expect(r.formats.find((f) => f.formatId === '251-drc')?.drc).toBe(true)
  })

  it('estima tamanho por bitrate × duração quando falta filesize', () => {
    const r = parseEnrichInfo({ id: 'x', duration: 100, format_id: '251', ext: 'webm', acodec: 'opus', abr: 128 })!
    expect(r.sizeBytes).toBe(1600000)
    expect(r.sizeIsEstimate).toBe(true)
  })

  it('classifica live e restrições', () => {
    expect(parseEnrichInfo({ id: 'x', live_status: 'is_upcoming' })?.availability).toBe('unavailable')
    expect(parseEnrichInfo({ id: 'x', availability: 'needs_auth' })?.availability).toBe('restricted')
  })
})

describe('parseYoutubeUrl', () => {
  it.each([
    ['https://www.youtube.com/playlist?list=PL123', { listId: 'PL123', videoId: null }],
    ['https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123', { listId: 'PL123', videoId: 'jNQXAC9IVRw' }],
    ['https://youtu.be/jNQXAC9IVRw', { listId: null, videoId: 'jNQXAC9IVRw' }],
    ['https://www.youtube.com/shorts/jNQXAC9IVRw', { listId: null, videoId: 'jNQXAC9IVRw' }],
    ['não é url', { listId: null, videoId: null }]
  ])('%s', (url, expected) => {
    expect(parseYoutubeUrl(url)).toEqual(expected)
  })
})
