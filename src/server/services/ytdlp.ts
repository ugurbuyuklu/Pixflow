import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { download as ensureYtDlpBinary } from '@distube/yt-dlp'

export interface YtDlpDownloadResult {
  videoPath: string
  title: string
  duration: number
  platform: string
}

const YTDLP_TIMEOUT_MS = 180_000
const FB_ADS_EXTRACTION_TIMEOUT_MS = 45_000
const FB_ADS_SETTLE_MS = 6_000

interface BinaryResolution {
  bin: string
  source: 'env' | 'distube' | 'global'
}

interface FacebookAdsExtractionCandidate {
  url: string
  source: 'ad-payload' | 'network' | 'video' | 'html'
  field?: string
}

function isSpawnBinaryError(error: Error): boolean {
  return /spawn (ENOEXEC|ENOENT|EACCES)/i.test(error.message)
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
    await ensureYtDlpBinary()
    const require = createRequire(import.meta.url)
    const distubeDir = path.dirname(require.resolve('@distube/yt-dlp'))
    const bin = path.join(distubeDir, '..', 'bin', `yt-dlp${process.platform === 'win32' ? '.exe' : ''}`)
    await fs.access(bin, fs.constants.X_OK)
    return { bin, source: 'distube' }
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
  const binaries = binary.source === 'distube' ? [binary.bin, 'yt-dlp'] : [binary.bin]

  console.log('[yt-dlp] Downloading video from:', {
    url,
    binarySource: binary.source,
    binary: binary.bin,
    cookieBrowser: cookieBrowser || 'disabled',
  })

  const attempts: Array<string | null> = cookieBrowser ? [cookieBrowser, null] : [null]
  let lastError: Error | null = null

  for (const currentBinary of binaries) {
    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
      const browser = attempts[attemptIndex]
      const args = buildYtDlpArgs(url, outputTemplate, browser)

      try {
        const result = await runYtDlpDownload(currentBinary, args, outputDir, timestamp)
        console.log('[yt-dlp] Download complete:', result.videoPath)
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        const isLastBinary = currentBinary === binaries[binaries.length - 1]
        if (!isLastBinary && isSpawnBinaryError(lastError)) {
          console.warn(
            `[yt-dlp] Binary failed to execute (${currentBinary}), retrying with fallback binary: ${lastError.message}`,
          )
          break
        }

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
  }

  throw lastError ?? new Error('yt-dlp download failed for unknown reason')
}

function parseFacebookAdsId(pageUrl: string): string | null {
  try {
    const parsed = new URL(pageUrl)
    const idParam = parsed.searchParams.get('id')
    if (idParam) {
      return idParam.trim()
    }
  } catch {
    // no-op
  }

  const match = pageUrl.match(/[?&]id=(\d+)/i)
  return match?.[1] ?? null
}

function decodeFacebookUrl(rawUrl: string): string {
  return rawUrl
    .replace(/&amp;/g, '&')
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
}

function normalizeFacebookVideoUrl(rawUrl: string): string | null {
  const decoded = decodeFacebookUrl(rawUrl.trim())
  const noQuotes = decoded.replace(/^['"]|['"]$/g, '')
  if (!/^https?:\/\//i.test(noQuotes)) {
    return null
  }

  try {
    const parsed = new URL(noQuotes)
    if (!parsed.pathname.toLowerCase().includes('.mp4')) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function getFacebookCandidateKey(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function scoreFacebookCandidate(candidate: FacebookAdsExtractionCandidate, adId: string | null): number {
  const { url, source, field } = candidate
  let score = 0
  if (/video\./i.test(url)) score += 3
  if (/fbcdn\.net/i.test(url)) score += 4
  if (/\/v\/t42\.1790-2\//i.test(url)) score += 4
  if (/\/v\/t39\.25447-2\//i.test(url)) score += 2
  if (/\/o1\/v\/t2\//i.test(url)) score += 1
  if (adId && url.includes(adId)) score += 6

  if (source === 'ad-payload') score += 50
  if (source === 'video') score += 8
  if (source === 'network') score += 5
  if (source === 'html') score += 3

  const normalizedField = field?.toLowerCase() ?? ''
  if (normalizedField.includes('video_sd_url')) score += 8
  if (normalizedField.includes('video_hd_url')) score += 6
  if (normalizedField.includes('watermarked')) score -= 6
  if (normalizedField.includes('preview')) score -= 8

  return score
}

function pickBestFacebookCandidate(
  candidates: FacebookAdsExtractionCandidate[],
  adId: string | null,
): FacebookAdsExtractionCandidate | null {
  if (candidates.length === 0) {
    return null
  }

  const deduped = new Map<string, FacebookAdsExtractionCandidate>()
  for (const candidate of candidates) {
    const key = getFacebookCandidateKey(candidate.url)
    if (!deduped.has(key)) {
      deduped.set(key, candidate)
      continue
    }
    const existing = deduped.get(key)
    if (existing && scoreFacebookCandidate(candidate, adId) > scoreFacebookCandidate(existing, adId)) {
      deduped.set(key, candidate)
    }
  }

  const sorted = Array.from(deduped.values()).sort((a, b) => {
    const scoreDiff = scoreFacebookCandidate(b, adId) - scoreFacebookCandidate(a, adId)
    if (scoreDiff !== 0) return scoreDiff

    const sourceWeight = (source: FacebookAdsExtractionCandidate['source']) => {
      if (source === 'ad-payload') return 4
      if (source === 'video') return 3
      if (source === 'network') return 2
      return 1
    }
    return sourceWeight(b.source) - sourceWeight(a.source)
  })

  return sorted[0] ?? null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Extract direct MP4 URL from a Facebook Ads Library page.
 * This is used as a fallback when the facebook:ads yt-dlp extractor fails.
 */
export async function extractFacebookAdsVideoUrl(pageUrl: string): Promise<string> {
  const adId = parseFacebookAdsId(pageUrl)
  console.log('[fb-ads] Launching headless browser for:', { pageUrl, adId })

  const puppeteerModule = await import('puppeteer')
  const puppeteer = puppeteerModule.default ?? puppeteerModule

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    )

    const collectedCandidates: FacebookAdsExtractionCandidate[] = []
    const maybeAddCandidate = (rawUrl: string, source: FacebookAdsExtractionCandidate['source'], field?: string) => {
      const normalized = normalizeFacebookVideoUrl(rawUrl)
      if (!normalized) {
        return
      }
      collectedCandidates.push({ url: normalized, source, field })
    }

    page.on('request', (request) => {
      maybeAddCandidate(request.url(), 'network')
    })

    page.on('response', (response) => {
      maybeAddCandidate(response.url(), 'network')
    })

    console.log('[fb-ads] Navigating to page...')
    await page.goto(pageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: FB_ADS_EXTRACTION_TIMEOUT_MS,
    })

    if (adId) {
      await page
        .waitForFunction(
          (targetAdId: string) => document.documentElement.innerHTML.includes(`"ad_archive_id":"${targetAdId}"`),
          { timeout: 12_000 },
          adId,
        )
        .catch(() => {})
    }

    await Promise.allSettled([
      page.waitForSelector('video', { timeout: FB_ADS_SETTLE_MS }),
      page.waitForSelector('[href*="ad_archive_id"]', { timeout: FB_ADS_SETTLE_MS }),
    ])

    await sleep(FB_ADS_SETTLE_MS)

    const extracted = await page.evaluate((targetAdId: string | null) => {
      const fromDom = new Set<string>()
      const payloadCandidates: Array<{ url: string; field: string }> = []
      const contextualCandidates = new Set<string>()
      const adScopedNodes: unknown[] = []

      if (targetAdId) {
        const scriptElements = document.querySelectorAll('script[type="application/json"]')
        const parsedPayloads: unknown[] = []

        for (let i = 0; i < scriptElements.length; i += 1) {
          const raw = scriptElements[i]?.textContent
          if (!raw) continue
          try {
            parsedPayloads.push(JSON.parse(raw))
          } catch {
            // ignore parse errors from unrelated script tags
          }
        }

        for (let payloadIndex = 0; payloadIndex < parsedPayloads.length; payloadIndex += 1) {
          const stack: unknown[] = [parsedPayloads[payloadIndex]]
          const seen = new Set<unknown>()

          while (stack.length > 0) {
            const current = stack.pop()
            if (!current || typeof current !== 'object') continue
            if (seen.has(current)) continue
            seen.add(current)

            if ((current as Record<string, unknown>).ad_archive_id === targetAdId) {
              adScopedNodes.push(current)
            }

            if (Array.isArray(current)) {
              for (let j = 0; j < current.length; j += 1) {
                const item = current[j]
                if (item && typeof item === 'object') stack.push(item)
              }
            } else {
              const values = Object.values(current as Record<string, unknown>)
              for (let j = 0; j < values.length; j += 1) {
                const value = values[j]
                if (value && typeof value === 'object') stack.push(value)
              }
            }
          }
        }

        for (let nodeIndex = 0; nodeIndex < adScopedNodes.length; nodeIndex += 1) {
          const traverseStack: Array<{ value: unknown; path: string; depth: number }> = [
            { value: adScopedNodes[nodeIndex], path: `ad_payload[${nodeIndex}]`, depth: 0 },
          ]

          while (traverseStack.length > 0) {
            const current = traverseStack.pop()
            if (!current) continue
            if (!current.value || typeof current.value !== 'object' || current.depth > 8) continue

            if (Array.isArray(current.value)) {
              for (let j = 0; j < current.value.length; j += 1) {
                traverseStack.push({
                  value: current.value[j],
                  path: `${current.path}[${j}]`,
                  depth: current.depth + 1,
                })
              }
              continue
            }

            const entries = Object.entries(current.value as Record<string, unknown>)
            for (let j = 0; j < entries.length; j += 1) {
              const [key, value] = entries[j]
              const nextPath = `${current.path}.${key}`
              if (typeof value === 'string' && /^https?:\/\//i.test(value) && /\.mp4/i.test(value)) {
                payloadCandidates.push({ url: value, field: nextPath })
              } else if (value && typeof value === 'object') {
                traverseStack.push({
                  value,
                  path: nextPath,
                  depth: current.depth + 1,
                })
              }
            }
          }
        }
      }

      const videoElements = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[]
      for (const video of videoElements) {
        if (video.currentSrc && /\.mp4/i.test(video.currentSrc) && /^https?:\/\//i.test(video.currentSrc)) {
          fromDom.add(video.currentSrc)
        }
        if (video.src && /\.mp4/i.test(video.src) && /^https?:\/\//i.test(video.src)) {
          fromDom.add(video.src)
        }
      }

      const sourceElements = Array.from(document.querySelectorAll('video source')) as HTMLSourceElement[]
      for (const source of sourceElements) {
        if (source.src && /\.mp4/i.test(source.src) && /^https?:\/\//i.test(source.src)) {
          fromDom.add(source.src)
        }
      }

      const html = document.documentElement.innerHTML
      const htmlMatches =
        html.match(/https:\/\/video[^\s"'<>]+\.mp4[^\s"'<>]*|https:\\\/\\\/video[^\s"'<>]+\.mp4[^\s"'<>]*/g) ?? []

      const adIdSignals: string[] = []
      if (targetAdId) {
        adIdSignals.push(`id=${targetAdId}`)
        adIdSignals.push(`"ad_archive_id":"${targetAdId}"`)
        adIdSignals.push(`"adArchiveID":"${targetAdId}"`)
        adIdSignals.push(`\\"ad_archive_id\\":\\"${targetAdId}\\"`)
        adIdSignals.push(`\\"adArchiveID\\":\\"${targetAdId}\\"`)
      }

      for (const match of htmlMatches) {
        if (match && /\.mp4/i.test(match) && /^https?:\/\//i.test(match)) {
          fromDom.add(match)
        }

        if (targetAdId) {
          const index = html.indexOf(match)
          if (index >= 0) {
            const context = html.slice(Math.max(0, index - 12_000), Math.min(html.length, index + 12_000))
            if (adIdSignals.some((signal) => context.includes(signal))) {
              contextualCandidates.add(match)
            }
          }
        }
      }

      return {
        payloadCandidates,
        domCandidates: Array.from(fromDom),
        contextualCandidates: Array.from(contextualCandidates),
        adScopedNodeCount: adScopedNodes.length,
        rawMp4MatchesCount: htmlMatches.length,
        adIdSignalCounts: adIdSignals.map((signal) => ({
          signal,
          count: html.split(signal).length - 1,
        })),
      }
    }, adId)

    for (const candidate of extracted.payloadCandidates) {
      maybeAddCandidate(candidate.url, 'ad-payload', candidate.field)
    }
    for (const url of extracted.domCandidates) {
      maybeAddCandidate(url, 'video')
    }
    for (const url of extracted.contextualCandidates) {
      maybeAddCandidate(url, 'html', 'ad_context')
    }

    const payloadCandidates = collectedCandidates.filter((candidate) => candidate.source === 'ad-payload')
    const networkCandidates = collectedCandidates.filter((candidate) => candidate.source === 'network')
    const contextualCandidates = collectedCandidates.filter((candidate) => candidate.source === 'html')

    const networkKeys = new Set(networkCandidates.map((candidate) => getFacebookCandidateKey(candidate.url)))
    const adScopedNetworkCandidates = payloadCandidates.filter((candidate) =>
      networkKeys.has(getFacebookCandidateKey(candidate.url)),
    )

    let selected: FacebookAdsExtractionCandidate | null = null
    let selectionMode: string = 'none'

    if (adScopedNetworkCandidates.length > 0) {
      selected = pickBestFacebookCandidate(adScopedNetworkCandidates, adId)
      selectionMode = 'ad-payload-network'
    } else if (payloadCandidates.length > 0) {
      selected = pickBestFacebookCandidate(payloadCandidates, adId)
      selectionMode = 'ad-payload'
    } else if (contextualCandidates.length > 0) {
      selected = pickBestFacebookCandidate(contextualCandidates, adId)
      selectionMode = 'html-context-adid'
    } else {
      const fallbackCandidates = collectedCandidates.filter((candidate) => candidate.source !== 'ad-payload')
      const fallbackUniqueCount = new Set(fallbackCandidates.map((candidate) => getFacebookCandidateKey(candidate.url)))
        .size

      // Avoid returning a random wrong ad video when multiple candidates exist.
      if (adId && fallbackUniqueCount > 1) {
        throw new Error(
          `Ambiguous fallback candidates for ad id=${adId} (${fallbackUniqueCount} candidates). Refusing unsafe selection.`,
        )
      }

      selected = pickBestFacebookCandidate(fallbackCandidates, adId)
      selectionMode = 'fallback'
    }

    if (selected?.source === 'ad-payload' && selected.field) {
      const watermarkedToPlainMap: Record<string, string> = {
        watermarked_video_hd_url: 'video_hd_url',
        watermarked_video_sd_url: 'video_sd_url',
      }

      for (const [watermarkedField, plainField] of Object.entries(watermarkedToPlainMap)) {
        if (!selected.field.endsWith(watermarkedField)) {
          continue
        }

        const siblingField = selected.field.slice(0, -watermarkedField.length) + plainField
        const siblingCandidate = payloadCandidates.find((candidate) => candidate.field === siblingField)
        if (siblingCandidate) {
          selected = siblingCandidate
          selectionMode = `${selectionMode}-prefer-unwatermarked`
        }
        break
      }
    }

    console.log('[fb-ads] Extraction result:', {
      adId,
      method: selectionMode,
      candidateCount: new Set(collectedCandidates.map((candidate) => getFacebookCandidateKey(candidate.url))).size,
      payloadCandidateCount: new Set(payloadCandidates.map((candidate) => getFacebookCandidateKey(candidate.url))).size,
      adScopedNetworkCandidateCount: new Set(
        adScopedNetworkCandidates.map((candidate) => getFacebookCandidateKey(candidate.url)),
      ).size,
      contextualCandidateCount: new Set(contextualCandidates.map((candidate) => getFacebookCandidateKey(candidate.url)))
        .size,
      adScopedNodeCount: extracted.adScopedNodeCount,
      rawMp4MatchesCount: extracted.rawMp4MatchesCount,
      adIdSignalCounts: extracted.adIdSignalCounts,
      selectedSource: selected?.source ?? null,
      selectedField: selected?.field ?? null,
      selectedPreview: selected?.url?.slice(0, 140) ?? null,
    })

    if (!selected) {
      throw new Error(`Could not extract any direct MP4 candidate${adId ? ` for ad id=${adId}` : ''}.`)
    }

    return selected.url
  } catch (error) {
    throw new Error(
      `Failed to extract video from Facebook Ads Library: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
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
