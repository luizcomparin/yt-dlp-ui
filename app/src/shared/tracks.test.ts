import { describe, expect, it } from 'vitest'
import type { AudioFormat, Track } from './ipc'
import { filterTracks, formatLabel, formatSelector, needsReplacement, pickFormat, sortTracks } from './tracks'

const fmt = (formatId: string, ext: string, acodec: string, abr: number, extra: Partial<AudioFormat> = {}): AudioFormat => ({
  formatId, ext, acodec, abr, asr: 48000, filesize: abr * 1000, filesizeIsEstimate: false, note: null, language: null, drc: false, ...extra
})
const F251 = fmt('251', 'webm', 'opus', 137)
const F140 = fmt('140', 'm4a', 'mp4a.40.2', 129)
const F251DRC = fmt('251-drc', 'webm', 'opus', 150, { drc: true })

const track = (index: number, over: Partial<Track> = {}): Track => ({
  rowId: `id${index}`, videoId: `id${index}`, url: '', index, title: `Faixa ${index}`, channel: 'canal', duration: 100 + index, thumbnail: '',
  uploadDate: null, availability: 'available', availabilityReason: null, sizeBytes: null, sizeIsEstimate: false,
  bestFormat: F251, formats: [F140, F251DRC, F251], enrichedAt: 1, replacedFrom: null, ...over
})

const ids = (ts: Track[]): number[] => ts.map((t) => t.index)

describe('sortTracks', () => {
  const ts = [
    track(1, { uploadDate: '20200101', title: 'Bravo', duration: 300 }),
    track(2, { uploadDate: '20220101', title: 'alfa', duration: 100 }),
    track(3, { uploadDate: null, title: 'Ágata', duration: null }), // ainda não enriquecida
    track(4, { uploadDate: '20210101', title: 'charlie', duration: 200 })
  ]

  it('ordem da playlist e inversa', () => {
    expect(ids(sortTracks(ts, { key: 'playlist', dir: 'asc' }))).toEqual([1, 2, 3, 4])
    expect(ids(sortTracks(ts, { key: 'playlist', dir: 'desc' }))).toEqual([4, 3, 2, 1])
  })

  it('mais recentes / mais antigas, com sem-data sempre no fim', () => {
    expect(ids(sortTracks(ts, { key: 'date', dir: 'desc' }))).toEqual([2, 4, 1, 3])
    expect(ids(sortTracks(ts, { key: 'date', dir: 'asc' }))).toEqual([1, 4, 2, 3])
  })

  it('título ignora caixa e acentos', () => {
    expect(ids(sortTracks(ts, { key: 'title', dir: 'asc' }))).toEqual([3, 2, 1, 4])
  })

  it('duração com nulos no fim', () => {
    expect(ids(sortTracks(ts, { key: 'duration', dir: 'asc' }))).toEqual([2, 4, 1, 3])
  })

  it('não muta a entrada', () => {
    const copy = [...ts]
    sortTracks(ts, { key: 'title', dir: 'desc' })
    expect(copy).toEqual(ts)
  })
})

describe('filterTracks', () => {
  const ts = [
    track(1, { title: 'Canção Bonita' }),
    track(2, { availability: 'private' }),
    track(3, { availability: 'restricted', channel: 'NightcoreLounge' })
  ]
  it('oculta indisponíveis (restrito continua)', () => {
    expect(ids(filterTracks(ts, { text: '', availability: 'available' }))).toEqual([1, 3])
  })
  it('busca por título ou canal sem acento', () => {
    expect(ids(filterTracks(ts, { text: 'cancao', availability: 'all' }))).toEqual([1])
    expect(ids(filterTracks(ts, { text: 'nightcore', availability: 'all' }))).toEqual([3])
  })

  it('precisam substituir: indisponíveis e restritas sem formatos, exceto as já substituídas', () => {
    const rep = { videoId: 'x', title: 'orig', availability: 'deleted' as const, availabilityReason: null }
    const list = [
      track(1),
      track(2, { availability: 'private' }),
      track(3, { availability: 'deleted' }),
      track(4, { availability: 'restricted', formats: [] }),
      track(5, { availability: 'restricted' }), // restrita mas com formatos (ex.: cookies): baixável
      track(6, { replacedFrom: rep }) // já substituída
    ]
    expect(ids(filterTracks(list, { text: '', availability: 'needs-replacement' }))).toEqual([2, 3, 4])
    expect(ids(filterTracks(list, { text: '', availability: 'replaced' }))).toEqual([6])
    expect(needsReplacement(track(7, { availability: 'unavailable', replacedFrom: rep }))).toBe(false)
  })

  it('erros de download: usa o conjunto de vídeos com erro na fila (pelo vídeo efetivo)', () => {
    const list = [track(1), track(2), track(3, { videoId: 'substituto' })]
    const errs = new Set(['id2', 'substituto'])
    expect(ids(filterTracks(list, { text: '', availability: 'errors', errorVideoIds: errs }))).toEqual([2, 3])
    expect(ids(filterTracks(list, { text: '', availability: 'errors' }))).toEqual([])
  })
})

describe('pickFormat / formatSelector', () => {
  it('best usa o bestaudio do enriquecimento', () => {
    expect(pickFormat(track(1), 'best')?.formatId).toBe('251')
  })
  it('opus ignora DRC; m4a escolhe o AAC', () => {
    expect(pickFormat(track(1), 'opus')?.formatId).toBe('251')
    expect(pickFormat(track(1), 'm4a')?.formatId).toBe('140')
  })
  it('escolha manual tem prioridade', () => {
    expect(pickFormat(track(1), 'best', '140')?.formatId).toBe('140')
  })
  it('sem formatos cai para o bestFormat', () => {
    expect(pickFormat(track(1, { formats: [] }), 'm4a')?.formatId).toBe('251')
  })
  it('seletores sempre com fallback', () => {
    expect(formatSelector('best')).toBe('bestaudio')
    expect(formatSelector('m4a')).toBe('bestaudio[ext=m4a]/bestaudio')
  })
  it('rótulo', () => {
    expect(formatLabel(F140)).toBe('aac 129k')
    expect(formatLabel(F251DRC)).toBe('opus 150k (drc)')
  })
})
