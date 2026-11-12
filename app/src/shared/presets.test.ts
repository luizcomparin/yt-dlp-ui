import { describe, expect, it } from 'vitest'
import type { Settings } from './ipc'
import { matchingPreset, presetValuesFrom, upsertPreset } from './presets'

const settings: Settings = {
  outputDir: 'C:\\Music', outputTemplate: '%(title)s.%(ext)s', cropThumbnail: true, audioFormat: 'best', ffmpegPath: null,
  ytdlpChannel: 'stable', extraArgs: '', antiBlock: 'safe', limitRate: '', numberFiles: false,
  cookiesBrowser: '', cookiesProfile: '', cookiesFile: '', presets: [], autoM3u: true, orderFileDates: true, clipboardWatch: true, notifyOnFinish: true
}

describe('presets', () => {
  it('guarda só as chaves de download (sem pasta, cookies ou caminhos)', () => {
    const v = presetValuesFrom(settings)
    expect(Object.keys(v).sort()).toEqual(['antiBlock', 'audioFormat', 'cropThumbnail', 'extraArgs', 'limitRate', 'numberFiles', 'outputTemplate'])
  })

  it('upsert cria e sobrescreve pelo nome (sem diferenciar caixa)', () => {
    let n = 0
    const id = (): string => `p${++n}`
    let ps = upsertPreset([], ' Capa original ', presetValuesFrom({ ...settings, cropThumbnail: false }), id)
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ id: 'p1', name: 'Capa original' })
    ps = upsertPreset(ps, 'capa ORIGINAL', presetValuesFrom({ ...settings, cropThumbnail: false, audioFormat: 'm4a' }), id)
    expect(ps).toHaveLength(1)
    expect(ps[0].values.audioFormat).toBe('m4a')
    expect(() => upsertPreset(ps, '  ', presetValuesFrom(settings), id)).toThrow()
  })

  it('identifica o preset ativo', () => {
    const ps = upsertPreset([], 'm4a', presetValuesFrom({ ...settings, audioFormat: 'm4a' }), () => 'x')
    expect(matchingPreset(settings, ps)).toBeNull()
    expect(matchingPreset({ ...settings, audioFormat: 'm4a', outputDir: 'D:\\outra' }, ps)?.name).toBe('m4a')
  })
})
