import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { download as ensureYtDlpBinary } from '@distube/yt-dlp'

export interface YtDlpDownloadResult {
  videoPath: string
  title: string
  duration: number
  platform: string
}

const YTDLP_TIMEOUT_MS = 180_000

interface BinaryResolution {
  bin: string
  source: 'env' | 'distube' | 'global'
}

function parseTruthy(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function getCookieBrowserSetting(): string | null {
  const raw = process.env.PIXFLOW_YTDLP_COOKIES_FROM_BROWSER?.trim()

  if (!raw) return 'chrome'

  const normalized = raw.toLowerCase()
  if (['off', 'none', 'false', '0'].includes(normalized)) {
    return null
  }

  return raw
}

async function resolveYtDlpBinary(): Promise<BinaryResolution> {
  const configuredPath = process.env.PIXFLOW_YTDLP_BIN?.trim()
  if (configuredPath) {
    return { bin: configuredPath, source: 'env' }
  }

  try {
    const downloadedBin = await ensureYtDlpBinary()
    return { bin: downloadedBin, source: 'distube' }
  } catch (error) {
    console.warn('[yt-dlp] Failed to resolve bundled yt-dlp binary, falling back to global binary:', error)
    return { bin: 'yt-dlp', source: 'global' }
  }
}

function buildYtDlpArgs(url: string, outputTemplate: string, cookieBrowser: string | null): string[] {
  const args = [
    url,
    '--output',
    outputTemplate,
    '--format',
    'best[ext=mp4]/best',
    '--yes-playlist',
    '--playlist-items',
    '1',
    '--no-simulate',
    '--restrict-filenames',
    '--print',
    'before_dl:__META__%(title)s|%(duration)s|%(extractor)s',
    '--print',
    'after_move:__FILE__%(filepath)s',
  ]

  if (cookieBrowser) {
    args.push('--cookies-from-browser', cookieBrowser)
  }

  return args
}

async function runYtDlpDownload(
  ytdlpBin: string,
  args: string[],
  outputDir: string,
  timestamp: number,
): Promise<YtDlpDownloadResult> {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn(ytdlpBin, args)

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let done = false

    let metadata = { title: 'Downloaded Video', duration: 0, platform: 'unknown' }
    let downloadedFilePath: string | null = null

    const complete = (fn: () => void) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      fn()
    }

    const timeout = setTimeout(() => {
      timedOut = true
      ytdlp.kill('SIGKILL')
    }, YTDLP_TIMEOUT_MS)

    ytdlp.stdout.on('data', (data) => {
      const output = data.toString()
      stdout += output
      console.log('[yt-dlp]', output.trim())

      for (const line of output.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue

        if (trimmed.startsWith('__META__')) {
          const metaPayload = trimmed.slice('__META__'.length)
          const metaMatch = metaPayload.match(/^([^|]+)\|([^|]+)\|([^|]+)$/)
          if (metaMatch) {
            metadata = {
              title: metaMatch[1].trim(),
              duration: Number.parseFloat(metaMatch[2]) || 0,
              platform: metaMatch[3].trim(),
            }
          }
        } else if (trimmed.startsWith('__FILE__')) {
          downloadedFilePath = trimmed.slice('__FILE__'.length).trim()
        }
      }
    })

    ytdlp.stderr.on('data', (data) => {
      const output = data.toString().trim()
      stderr += `${output}\n`
      if (output) {
        console.error('[yt-dlp]', output)
      }
    })

    ytdlp.on('error', (error) => {
      complete(() => reject(new Error(`Failed to spawn yt-dlp: ${error.message}`)))
    })

    ytdlp.on('close', async (code) => {
      if (timedOut) {
        complete(() => reject(new Error(`yt-dlp timed out after ${YTDLP_TIMEOUT_MS / 1000} seconds`)))
        return
      }

      if (code !== 0) {
        const detail = (stderr || stdout || 'Unknown error').trim()
        complete(() => reject(new Error(`yt-dlp failed with code ${code}: ${detail}`)))
        return
      }

      try {
        if (downloadedFilePath) {
          complete(() =>
            resolve({
              videoPath: downloadedFilePath,
              ...metadata,
            }),
          )
          return
        }

        const files = await fs.readdir(outputDir)
        const downloadedFile = files.find(
          (f) =>
            f.startsWith(`ytdlp_${timestamp}.`) && (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')),
        )

        if (!downloadedFile) {
          console.error(
            '[yt-dlp] Downloaded file not found. Files in output dir:',
            files.filter((f) => f.startsWith('ytdlp_')).slice(0, 5),
          )
          complete(() => reject(new Error('Downloaded video file not found')))
          return
        }

        const videoPath = path.join(outputDir, downloadedFile)
        complete(() =>
          resolve({
            videoPath,
            ...metadata,
          }),
        )
      } catch (error) {
        complete(() => reject(error))
      }
    })
  })
}

/**
 * Download video from URL using yt-dlp binary.
 * Supports: Facebook, Instagram, TikTok, YouTube, and 1000+ sites.
 */
export async function downloadVideoWithYtDlp(url: string, outputDir: string): Promise<YtDlpDownloadResult> {
  const timestamp = Date.now()
  const sanitizedFilename = `ytdlp_${timestamp}.%(ext)s`
  const outputTemplate = path.join(outputDir, sanitizedFilename)

  const binary = await resolveYtDlpBinary()
  const cookieBrowser = getCookieBrowserSetting()

  console.log('[yt-dlp] Downloading video from:', {
    url,
    binarySource: binary.source,
    binary: binary.bin,
    cookieBrowser: cookieBrowser || 'disabled',
  })

  const attempts: Array<string | null> = cookieBrowser ? [cookieBrowser, null] : [null]
  let lastError: Error | null = null

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
    const browser = attempts[attemptIndex]
    const args = buildYtDlpArgs(url, outputTemplate, browser)

    try {
      const result = await runYtDlpDownload(binary.bin, args, outputDir, timestamp)
      console.log('[yt-dlp] Download complete:', result.videoPath)
      return result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      const shouldRetryWithoutCookies =
        browser !== null &&
        attemptIndex === 0 &&
        attempts.length > 1 &&
        !parseTruthy(process.env.PIXFLOW_YTDLP_DISABLE_COOKIE_RETRY)

      if (!shouldRetryWithoutCookies) {
        break
      }

      console.warn('[yt-dlp] Download failed with browser cookies, retrying without cookies:', lastError.message)
    }
  }

  throw lastError ?? new Error('yt-dlp download failed for unknown reason')
}

/**
 * Check if URL is supported by yt-dlp.
 * Returns platform name if supported, null otherwise.
 */
export function detectPlatform(url: string): string | null {
  const platforms = [
    { pattern: /facebook\.com|fb\.watch/i, name: 'Facebook' },
    { pattern: /instagram\.com/i, name: 'Instagram' },
    { pattern: /tiktok\.com/i, name: 'TikTok' },
    { pattern: /youtube\.com|youtu\.be/i, name: 'YouTube' },
    { pattern: /twitter\.com|x\.com/i, name: 'Twitter/X' },
    { pattern: /vimeo\.com/i, name: 'Vimeo' },
    { pattern: /dailymotion\.com/i, name: 'Dailymotion' },
  ]

  for (const { pattern, name } of platforms) {
    if (pattern.test(url)) {
      return name
    }
  }

  return null
}

/**
 * Check if URL is a Facebook Ads Library page.
 */
export function isFacebookAdsLibraryUrl(url: string): boolean {
  return /facebook\.com\/ads\/library/i.test(url)
}
