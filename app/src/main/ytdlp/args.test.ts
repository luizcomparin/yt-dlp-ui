import { describe, expect, it } from 'vitest'
import { buildDownloadArgs, cookieArgs, SQUARE_CROP_PPA, type DownloadArgsInput } from './args'

const base: DownloadArgsInput = {
  url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  outputDir: 'C:\\Music',
  outputTemplate: '%(title)s.%(ext)s',
  cropThumbnail: true,
  ffmpegLocation: 'C:\\ffmpeg\\bin',
  denoPath: 'C:\\bin\\deno.exe'
}

const valueOf = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1]

describe('cookieArgs', () => {
  it('desligado', () => {
    expect(cookieArgs({ cookiesBrowser: '', cookiesProfile: '', cookiesFile: '' })).toEqual([])
  })
  it('navegador, com e sem perfil', () => {
    expect(cookieArgs({ cookiesBrowser: 'firefox', cookiesProfile: '', cookiesFile: '' })).toEqual(['--cookies-from-browser', 'firefox'])
    expect(cookieArgs({ cookiesBrowser: 'chrome', cookiesProfile: 'Profile 1', cookiesFile: 'x' })).toEqual(['--cookies-from-browser', 'chrome:Profile 1'])
  })
  it('arquivo quando não há navegador', () => {
    expect(cookieArgs({ cookiesBrowser: '', cookiesProfile: '', cookiesFile: ' C:\\c.txt ' })).toEqual(['--cookies', 'C:\\c.txt'])
  })
})

describe('buildDownloadArgs', () => {
  it('usa melhor áudio original sem recodificar por padrão', () => {
    const args = buildDownloadArgs(base)
    expect(valueOf(args, '-f')).toBe('bestaudio')
    expect(valueOf(args, '--audio-format')).toBe('best')
    expect(args).toContain('-x')
  })

  it('usa o formato/seletor informado', () => {
    expect(valueOf(buildDownloadArgs({ ...base, format: '251' }), '-f')).toBe('251')
    expect(valueOf(buildDownloadArgs({ ...base, format: 'bestaudio[ext=m4a]/bestaudio' }), '-f')).toBe('bestaudio[ext=m4a]/bestaudio')
  })

  it('embute capa e metadados', () => {
    const args = buildDownloadArgs(base)
    expect(args).toContain('--embed-thumbnail')
    expect(args).toContain('--embed-metadata')
    expect(valueOf(args, '--convert-thumbnails')).toBe('jpg')
  })

  it('adiciona o crop quadrado só quando ligado', () => {
    expect(valueOf(buildDownloadArgs(base), '--ppa')).toBe(SQUARE_CROP_PPA)
    expect(buildDownloadArgs({ ...base, cropThumbnail: false })).not.toContain('--ppa')
  })

  it('passa ffmpeg, deno, pasta e template', () => {
    const args = buildDownloadArgs(base)
    expect(valueOf(args, '--ffmpeg-location')).toBe('C:\\ffmpeg\\bin')
    expect(valueOf(args, '--js-runtimes')).toBe('deno:C:\\bin\\deno.exe')
    expect(valueOf(args, '-P')).toBe('C:\\Music')
    expect(valueOf(args, '-o')).toBe('%(title)s.%(ext)s')
  })

  it('força UTF-8 e pede o caminho final em JSON', () => {
    const args = buildDownloadArgs(base)
    expect(valueOf(args, '--encoding')).toBe('utf-8')
    expect(valueOf(args, '--print')).toBe('after_move:[ytui:file] %(filepath)j')
  })

  it('archive e argumentos do app vêm antes dos extras do usuário', () => {
    const args = buildDownloadArgs({
      ...base,
      archiveFile: 'C:\\Music\\.yt-dlp-archive.txt',
      appArgs: ['--sleep-interval', '3'],
      extraArgs: '--sleep-interval 0'
    })
    expect(valueOf(args, '--download-archive')).toBe('C:\\Music\\.yt-dlp-archive.txt')
    const app = args.indexOf('3')
    const user = args.lastIndexOf('0')
    expect(app).toBeGreaterThan(0)
    expect(user).toBeGreaterThan(app)
  })

  it('omite --js-runtimes sem deno', () => {
    expect(buildDownloadArgs({ ...base, denoPath: null })).not.toContain('--js-runtimes')
  })

  it('anexa argumentos extras antes do "--" e a URL por último', () => {
    const args = buildDownloadArgs({ ...base, extraArgs: '--limit-rate 2M -o "%(id)s.%(ext)s"' })
    expect(args.slice(-2)).toEqual(['--', base.url])
    const sep = args.indexOf('--')
    expect(args.slice(sep - 4, sep)).toEqual(['--limit-rate', '2M', '-o', '%(id)s.%(ext)s'])
  })
})
