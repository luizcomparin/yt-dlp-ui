import { describe, expect, it } from 'vitest'
import { parseLine } from './parse'

describe('parseLine', () => {
  it('lê progresso de download (formato real do yt-dlp)', () => {
    const line =
      '[ytui:progress] {"status": "downloading", "downloaded_bytes": 64512, "total_bytes": 252182, "eta": 0, "speed": 2423015.07}'
    expect(parseLine(line)).toEqual({
      type: 'progress',
      progress: { status: 'downloading', downloadedBytes: 64512, totalBytes: 252182, speed: 2423015.07, eta: 0, filename: null }
    })
  })

  it('guarda o filename do download (para limpeza de .part)', () => {
    const r = parseLine('[ytui:progress] {"status": "downloading", "downloaded_bytes": 1, "filename": "out\\\\Me at the zoo.webm"}')
    expect(r.type === 'progress' && r.progress.filename).toBe('out\\Me at the zoo.webm')
  })

  it('detecta vídeo já presente no archive', () => {
    expect(parseLine('[download] jNQXAC9IVRw: Me at the zoo has already been recorded in the archive').type).toBe('archived')
  })

  it('usa total_bytes_estimate quando total_bytes falta', () => {
    const r = parseLine('[ytui:progress] {"status": "downloading", "downloaded_bytes": 1, "total_bytes_estimate": 99.5, "speed": null}')
    expect(r.type === 'progress' && r.progress.totalBytes).toBe(99.5)
    expect(r.type === 'progress' && r.progress.speed).toBeNull()
  })

  it('reconhece status finished', () => {
    const r = parseLine('[ytui:progress] {"status": "finished", "downloaded_bytes": 10, "total_bytes": 10}')
    expect(r.type === 'progress' && r.progress.status).toBe('finished')
  })

  it('lê pós-processamento', () => {
    expect(parseLine('[ytui:pp] {"status": "started", "postprocessor": "ExtractAudio"}')).toEqual({
      type: 'postprocess',
      postprocessor: 'ExtractAudio',
      status: 'started'
    })
  })

  it('lê caminho final em JSON com escapes unicode (formato real do %(filepath)j)', () => {
    const line = String.raw`[ytui:file] "C:\\M\u00fasica\\PSY - GANGNAM STYLE(\uac15\ub0a8\uc2a4\ud0c0\uc77c) M\u29f8V.opus"`
    expect(parseLine(line)).toEqual({
      type: 'file',
      path: 'C:\\Música\\PSY - GANGNAM STYLE(강남스타일) M⧸V.opus'
    })
  })

  it('aceita caminho cru (não JSON) como fallback', () => {
    expect(parseLine('[ytui:file] C:\\Music\\a b.opus')).toEqual({ type: 'file', path: 'C:\\Music\\a b.opus' })
  })

  it('lê linhas de erro', () => {
    expect(parseLine('ERROR: [youtube] abc: Private video. Sign in if you have access')).toEqual({
      type: 'error',
      message: '[youtube] abc: Private video. Sign in if you have access'
    })
  })

  it('não quebra com JSON inválido', () => {
    expect(parseLine('[ytui:progress] {quebrado').type).toBe('other')
  })

  it('demais linhas viram "other"', () => {
    expect(parseLine('[youtube] Extracting URL: x')).toEqual({ type: 'other', line: '[youtube] Extracting URL: x' })
  })
})
