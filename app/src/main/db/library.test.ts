import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, openDb } from './index'
import { createLibrary, type Library } from './library'
import { parseEnrichInfo, parseFlatEntry } from '../ytdlp/info'

let lib: Library

beforeEach(() => {
  lib = createLibrary(openDb(':memory:'))
})
afterEach(() => closeDb())

const flat = (id: string, title = `t-${id}`) => parseFlatEntry({ id, title, duration: 100, channel: 'c' })!

describe('library', () => {
  it('salva playlist, itens e devolve faixas na ordem', () => {
    lib.upsertPlaylist({ id: 'PL1', url: 'u', title: 'Minha', channel: null, count: 2, isSingleVideo: false })
    lib.upsertFlatEntry(flat('bbbbbbbbbbb'))
    lib.upsertFlatEntry(flat('aaaaaaaaaaa'))
    lib.setPlaylistItems('PL1', ['bbbbbbbbbbb', 'aaaaaaaaaaa'])
    const tracks = lib.getPlaylistTracks('PL1')
    expect(tracks.map((t) => [t.index, t.videoId, t.availability])).toEqual([
      [1, 'bbbbbbbbbbb', 'pending'],
      [2, 'aaaaaaaaaaa', 'pending']
    ])
    expect(lib.getPlaylist('PL1')?.title).toBe('Minha')
  })

  it('reescrever itens remove os que saíram e ignora duplicatas', () => {
    lib.upsertPlaylist({ id: 'PL1', url: 'u', title: 'x', channel: null, count: null, isSingleVideo: false })
    for (const id of ['aaaaaaaaaaa', 'bbbbbbbbbbb']) lib.upsertFlatEntry(flat(id))
    lib.setPlaylistItems('PL1', ['aaaaaaaaaaa', 'bbbbbbbbbbb'])
    lib.setPlaylistItems('PL1', ['bbbbbbbbbbb', 'bbbbbbbbbbb'])
    expect(lib.getPlaylistTracks('PL1').map((t) => t.videoId)).toEqual(['bbbbbbbbbbb'])
  })

  it('enriquecimento persiste e uma nova listagem flat não o apaga', () => {
    lib.upsertPlaylist({ id: 'PL1', url: 'u', title: 'x', channel: null, count: null, isSingleVideo: false })
    lib.upsertFlatEntry(flat('aaaaaaaaaaa'))
    lib.setPlaylistItems('PL1', ['aaaaaaaaaaa'])
    lib.saveEnriched(parseEnrichInfo({ id: 'aaaaaaaaaaa', upload_date: '20200101', duration: 100, format_id: '251', ext: 'webm', acodec: 'opus', abr: 130, filesize: 1234 })!)
    lib.upsertFlatEntry(flat('aaaaaaaaaaa', 'título novo'))
    const t = lib.getPlaylistTracks('PL1')[0]
    expect(t).toMatchObject({ title: 'título novo', uploadDate: '20200101', availability: 'available', sizeBytes: 1234, sizeIsEstimate: false })
    expect(t.bestFormat?.formatId).toBe('251')
    expect(t.enrichedAt).not.toBeNull()
  })

  it('privado na listagem preserva o título conhecido', () => {
    lib.upsertFlatEntry(flat('aaaaaaaaaaa', 'Música boa'))
    lib.upsertFlatEntry(parseFlatEntry({ id: 'aaaaaaaaaaa', title: '[Private video]' })!)
    expect(lib.getTrack('aaaaaaaaaaa', 1)).toMatchObject({ title: 'Música boa', availability: 'private' })
  })

  it('flat sem título (formato real de vídeo privado/removido) preserva título e marca para re-checar', () => {
    lib.upsertFlatEntry(flat('aaaaaaaaaaa', 'Música boa'))
    lib.saveEnriched(parseEnrichInfo({ id: 'aaaaaaaaaaa', upload_date: '20200101', format_id: '251', acodec: 'opus', filesize: 10 })!)
    expect(lib.getTrack('aaaaaaaaaaa', 1)?.availability).toBe('available')

    lib.upsertFlatEntry(parseFlatEntry({ id: 'aaaaaaaaaaa', playlist_id: 'PL1', playlist_index: 1 })!)
    expect(lib.getTrack('aaaaaaaaaaa', 1)).toMatchObject({ title: 'Música boa', availability: 'pending', enrichedAt: null })
  })

  it('vídeo novo sem título usa o id como título provisório', () => {
    lib.upsertFlatEntry(parseFlatEntry({ id: 'aaaaaaaaaaa' })!)
    expect(lib.getTrack('aaaaaaaaaaa', 1)).toMatchObject({ title: 'aaaaaaaaaaa', availability: 'pending' })
  })

  it('vídeo indisponível que volta a ter título é re-checado', () => {
    lib.upsertFlatEntry(flat('aaaaaaaaaaa'))
    lib.markUnavailable('aaaaaaaaaaa', 'deleted', 'vídeo removido')
    lib.upsertFlatEntry(parseFlatEntry({ id: 'aaaaaaaaaaa' })!) // continua sem título → mantém
    expect(lib.getTrack('aaaaaaaaaaa', 1)).toMatchObject({ availability: 'deleted', availabilityReason: 'vídeo removido' })
    lib.upsertFlatEntry(flat('aaaaaaaaaaa', 'Voltou')) // título voltou → re-checar
    expect(lib.getTrack('aaaaaaaaaaa', 1)).toMatchObject({ title: 'Voltou', availability: 'pending', availabilityReason: null, enrichedAt: null })
  })

  it('indisponível com título (Content ID/regional) NÃO é re-checado a cada listagem', () => {
    lib.upsertFlatEntry(flat('aaaaaaaaaaa', 'Música bloqueada'))
    lib.markUnavailable('aaaaaaaaaaa', 'unavailable', 'bloqueado por reivindicação de direitos (gravadora)')
    lib.upsertFlatEntry(flat('aaaaaaaaaaa', 'Música bloqueada'))
    expect(lib.getTrack('aaaaaaaaaaa', 1)).toMatchObject({ availability: 'unavailable' })
    expect(lib.getTrack('aaaaaaaaaaa', 1)?.enrichedAt).not.toBeNull()
  })

  it('substituição: mantém a posição (rowId) e usa os dados do substituto; desfazer volta ao original', () => {
    lib.upsertPlaylist({ id: 'PL1', url: 'u', title: 'x', channel: null, count: null, isSingleVideo: false })
    for (const id of ['aaaaaaaaaaa', 'bbbbbbbbbbb']) lib.upsertFlatEntry(flat(id, `Música ${id[0]}`))
    lib.setPlaylistItems('PL1', ['aaaaaaaaaaa', 'bbbbbbbbbbb'])
    lib.markUnavailable('bbbbbbbbbbb', 'deleted', 'vídeo removido')
    // substituto
    lib.upsertFlatEntry(flat('ccccccccccc', 'Música b (reupload)'))
    lib.saveEnriched(parseEnrichInfo({ id: 'ccccccccccc', format_id: '251', acodec: 'opus', filesize: 99 })!)
    lib.setReplacement('PL1', 'bbbbbbbbbbb', 'ccccccccccc')

    const [a, b] = lib.getPlaylistTracks('PL1')
    expect(a).toMatchObject({ rowId: 'aaaaaaaaaaa', videoId: 'aaaaaaaaaaa', replacedFrom: null })
    expect(b).toMatchObject({
      rowId: 'bbbbbbbbbbb', videoId: 'ccccccccccc', index: 2, title: 'Música b (reupload)', availability: 'available', sizeBytes: 99,
      replacedFrom: { videoId: 'bbbbbbbbbbb', title: 'Música b', availability: 'deleted', availabilityReason: 'vídeo removido' }
    })
    expect(lib.getRow('PL1', 'bbbbbbbbbbb', 2)?.videoId).toBe('ccccccccccc')
    expect(lib.indexOf('PL1', 'bbbbbbbbbbb')).toBe(2)

    lib.clearReplacement('PL1', 'bbbbbbbbbbb')
    expect(lib.getRow('PL1', 'bbbbbbbbbbb', 2)).toMatchObject({ videoId: 'bbbbbbbbbbb', availability: 'deleted', replacedFrom: null })
  })

  it('markUnavailable grava motivo', () => {
    lib.upsertFlatEntry(flat('aaaaaaaaaaa'))
    lib.markUnavailable('aaaaaaaaaaa', 'deleted', 'vídeo removido')
    expect(lib.getTrack('aaaaaaaaaaa', 1)).toMatchObject({ availability: 'deleted', availabilityReason: 'vídeo removido' })
  })
})
