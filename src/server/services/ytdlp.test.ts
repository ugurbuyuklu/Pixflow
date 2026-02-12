import { EventEmitter } from 'node:events'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock, readdirMock, ensureYtDlpBinaryMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  readdirMock: vi.fn(),
  ensureYtDlpBinaryMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: readdirMock,
  },
}))

vi.mock('@distube/yt-dlp', () => ({
  download: ensureYtDlpBinaryMock,
}))

import { downloadVideoWithYtDlp } from './ytdlp.js'

interface FakeChildProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

function makeFakeChildProcess(): FakeChildProcess {
  const child = new EventEmitter() as FakeChildProcess
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.PIXFLOW_YTDLP_BIN
  delete process.env.PIXFLOW_YTDLP_COOKIES_FROM_BROWSER
  delete process.env.PIXFLOW_YTDLP_DISABLE_COOKIE_RETRY
  ensureYtDlpBinaryMock.mockResolvedValue('/tmp/yt-dlp-bin')
})

describe('downloadVideoWithYtDlp', () => {
  it('uses playlist-items + no-simulate and returns __FILE__ path when provided', async () => {
    spawnMock.mockImplementation((_cmd: string, _args: string[]) => {
      const child = makeFakeChildProcess()
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('__META__Creative Title|12.5|facebook:ads\n'))
        child.stdout.emit('data', Buffer.from('__FILE__/tmp/fb-ad-video.mp4\n'))
        child.emit('close', 0)
      })
      return child
    })

    const result = await downloadVideoWithYtDlp('https://www.facebook.com/ads/library/?id=123', '/tmp')

    expect(result).toEqual({
      videoPath: '/tmp/fb-ad-video.mp4',
      title: 'Creative Title',
      duration: 12.5,
      platform: 'facebook:ads',
    })

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('/tmp/yt-dlp-bin')
    expect(args).toEqual(
      expect.arrayContaining([
        '--yes-playlist',
        '--playlist-items',
        '1',
        '--no-simulate',
        '--print',
        'before_dl:__META__%(title)s|%(duration)s|%(extractor)s',
        '--print',
        'after_move:__FILE__%(filepath)s',
        '--cookies-from-browser',
        'chrome',
      ]),
    )
    expect(args).not.toContain('--max-downloads')
  })

  it('falls back to directory scan when __FILE__ is missing', async () => {
    const fixedNow = 1_777_000_000_000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow)
    readdirMock.mockResolvedValue([`ytdlp_${fixedNow}.mp4`])

    spawnMock.mockImplementation((_cmd: string, _args: string[]) => {
      const child = makeFakeChildProcess()
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('__META__Fallback Title|NA|facebook:ads\n'))
        child.emit('close', 0)
      })
      return child
    })

    const outputDir = '/tmp/pixflow'
    const result = await downloadVideoWithYtDlp('https://www.facebook.com/ads/library/?id=456', outputDir)

    expect(result).toEqual({
      videoPath: path.join(outputDir, `ytdlp_${fixedNow}.mp4`),
      title: 'Fallback Title',
      duration: 0,
      platform: 'facebook:ads',
    })

    nowSpy.mockRestore()
  })

  it('retries without browser cookies after first attempt failure', async () => {
    let callCount = 0
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      callCount += 1
      const child = makeFakeChildProcess()
      queueMicrotask(() => {
        if (callCount === 1) {
          child.stderr.emit('data', Buffer.from('cookies unavailable'))
          child.emit('close', 1)
          return
        }

        expect(args).not.toContain('--cookies-from-browser')
        child.stdout.emit('data', Buffer.from('__META__Retry Success|9|facebook\n'))
        child.stdout.emit('data', Buffer.from('__FILE__/tmp/retry-success.mp4\n'))
        child.emit('close', 0)
      })
      return child
    })

    const result = await downloadVideoWithYtDlp('https://facebook.com/video/1', '/tmp')

    expect(result.videoPath).toBe('/tmp/retry-success.mp4')
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })
})
