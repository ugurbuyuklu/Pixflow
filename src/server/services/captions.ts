import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fal } from '@fal-ai/client'
import ffmpegStatic from 'ffmpeg-static'
import { ensureFalConfig } from './falConfig.js'
import { isMockProvidersEnabled, makeMockId, recordMockProviderSuccess, runWithRetries } from './providerRuntime.js'

const PRIMARY_MODEL_ID = 'fal-ai/workflow-utilities/auto-subtitle'
const FALLBACK_MODEL_ID = 'fal-ai/auto-caption'
const DEFAULT_FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg'

const COLOR_MAP: Record<string, [number, number, number]> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  brown: [165, 42, 42],
  gray: [128, 128, 128],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
}

const BASE_COLOR_ENUM = Object.keys(COLOR_MAP)
const BACKGROUND_COLOR_ENUM = [...BASE_COLOR_ENUM, 'none', 'transparent']

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const parseHexColor = (input: string): [number, number, number] | null => {
  const normalized = input.replace('#', '').trim()
  if (normalized.length === 3) {
    const r = Number.parseInt(normalized[0] + normalized[0], 16)
    const g = Number.parseInt(normalized[1] + normalized[1], 16)
    const b = Number.parseInt(normalized[2] + normalized[2], 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    return [r, g, b]
  }
  if (normalized.length !== 6) return null
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return [r, g, b]
}

const nearestNamedColor = (rgb: [number, number, number]): string => {
  let best = 'white'
  let bestDist = Number.POSITIVE_INFINITY
  for (const [name, [r, g, b]] of Object.entries(COLOR_MAP)) {
    const dr = rgb[0] - r
    const dg = rgb[1] - g
    const db = rgb[2] - b
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      best = name
    }
  }
  return best
}

const normalizeColorEnum = (
  input: string | undefined,
  fallback: string,
  allowed: string[] = BASE_COLOR_ENUM,
): string => {
  if (!input) return fallback
  const value = input.trim().toLowerCase()
  if (allowed.includes(value)) return value
  const rgb = parseHexColor(value)
  if (rgb) return nearestNamedColor(rgb)
  return fallback
}

export interface AutoSubtitleInput {
  videoUrl: string
  language?: string
  fontName?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold' | 'black'
  fontColor?: string
  highlightColor?: string
  strokeWidth?: number
  strokeColor?: string
  backgroundColor?: string
  backgroundOpacity?: number
  position?: 'top' | 'center' | 'bottom'
  xOffset?: number
  yOffset?: number
  wordsPerSubtitle?: number
  enableAnimation?: boolean
}

function normalizeFontWeight(weight: AutoSubtitleInput['fontWeight']): 'normal' | 'bold' | undefined {
  if (!weight) return undefined
  return weight === 'normal' ? 'normal' : 'bold'
}

export interface AutoSubtitleResult {
  videoUrl: string
  transcription?: string
  subtitleCount?: number
  words?: unknown[]
  transcriptionMetadata?: unknown
  modelUsed?: string
}

export interface CaptionSegment {
  start: number
  end: number
  text: string
}

export interface RenderSelectedCaptionsInput {
  videoUrl: string
  outputDir: string
  segments: CaptionSegment[]
  fontName?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold' | 'black'
  fontColor?: string
  strokeWidth?: number
  strokeColor?: string
  backgroundColor?: string
  backgroundOpacity?: number
  position?: 'top' | 'center' | 'bottom'
  xOffset?: number
  yOffset?: number
}

export interface RenderSelectedCaptionsResult {
  videoUrl: string
  subtitleCount: number
}

async function uploadVideoToFal(filePath: string, contentType?: string): Promise<string> {
  ensureFalConfig()
  const buffer = await fs.readFile(filePath)
  const type = contentType || 'video/mp4'
  const blob = new Blob([buffer], { type })
  const file = new File([blob], path.basename(filePath), { type })
  const url = await fal.storage.upload(file)
  return url
}

function isModelUnavailable(error: unknown): boolean {
  const err = error as { status?: number; body?: { detail?: string } }
  if (err?.status !== 503) return false
  const detail = err?.body?.detail
  return typeof detail === 'string' && detail.toLowerCase().includes('not available')
}

function isValidationError(error: unknown): boolean {
  const err = error as { status?: number }
  return err?.status === 422
}

function logValidationError(error: unknown, payload: Record<string, unknown>) {
  const err = error as { body?: { detail?: unknown } }
  let detail = err?.body?.detail
  try {
    detail = JSON.stringify(detail)
  } catch {
    // ignore
  }
  console.error('[captions] auto-subtitle validation error', {
    detail,
    payload,
  })
}

function mapFallbackFont(fontName?: string): string {
  if (!fontName) return 'Standard'
  const normalized = fontName.toLowerCase()
  if (normalized.includes('arial')) return 'Arial'
  if (normalized.includes('georgia')) return 'Georgia'
  if (normalized.includes('garamond')) return 'Garamond'
  if (normalized.includes('times')) return 'Times New Roman'
  return 'Standard'
}

async function runAutoCaptionFallback(input: AutoSubtitleInput): Promise<AutoSubtitleResult> {
  const payload: Record<string, unknown> = {
    video_url: input.videoUrl,
    txt_color: normalizeColorEnum(input.fontColor, 'white'),
    txt_font: mapFallbackFont(input.fontName),
    font_size: input.fontSize ?? 24,
    stroke_width: input.strokeWidth ?? 1,
    left_align: 'center',
    top_align: input.position ?? 'center',
  }

  const result = await runWithRetries(
    () =>
      fal.subscribe(FALLBACK_MODEL_ID, {
        input: payload,
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS' && update.logs) {
            update.logs.forEach((log) => {
              console.log(`[fal.ai captions] ${log.message}`)
            })
          }
        },
      }),
    {
      pipeline: 'captions.auto_subtitle.provider',
      provider: 'fal',
      metadata: { model: FALLBACK_MODEL_ID, fallback: true },
    },
  )

  const data = result.data as { video_url?: string }

  return {
    videoUrl: data.video_url || '',
    modelUsed: FALLBACK_MODEL_ID,
  }
}

export async function runAutoSubtitle(input: AutoSubtitleInput): Promise<AutoSubtitleResult> {
  if (isMockProvidersEnabled()) {
    await recordMockProviderSuccess({
      pipeline: 'captions.auto_subtitle.provider',
      provider: 'fal',
      metadata: { mock: true },
    })
    return {
      videoUrl: `https://fal.mock/${makeMockId('caption')}.mp4`,
      transcription: 'Mock transcription for captions.',
      subtitleCount: 12,
    }
  }

  ensureFalConfig()

  const payload: Record<string, unknown> = {
    video_url: input.videoUrl,
  }
  if (input.language) payload.language = input.language
  if (input.fontName) payload.font_name = input.fontName
  if (input.fontSize) payload.font_size = input.fontSize
  const normalizedFontWeight = normalizeFontWeight(input.fontWeight)
  if (normalizedFontWeight) payload.font_weight = normalizedFontWeight
  if (input.fontColor) payload.font_color = normalizeColorEnum(input.fontColor, 'white')
  if (input.highlightColor) payload.highlight_color = normalizeColorEnum(input.highlightColor, 'purple')
  if (typeof input.strokeWidth === 'number') payload.stroke_width = input.strokeWidth
  if (input.strokeColor) payload.stroke_color = normalizeColorEnum(input.strokeColor, 'black')
  if (input.backgroundColor) {
    payload.background_color = normalizeColorEnum(input.backgroundColor, 'none', BACKGROUND_COLOR_ENUM)
  }
  if (typeof input.backgroundOpacity === 'number') {
    payload.background_opacity = clamp(input.backgroundOpacity, 0, 1)
  }
  if (input.position) payload.position = input.position
  if (typeof input.xOffset === 'number') payload.x_offset = input.xOffset
  if (typeof input.yOffset === 'number') payload.y_offset = input.yOffset
  if (typeof input.wordsPerSubtitle === 'number') payload.words_per_subtitle = input.wordsPerSubtitle
  if (typeof input.enableAnimation === 'boolean') payload.enable_animation = input.enableAnimation

  const runPrimary = async (
    primaryPayload: Record<string, unknown>,
    metadata: Record<string, unknown> = {},
  ): Promise<AutoSubtitleResult> => {
    const result = await runWithRetries(
      () =>
        fal.subscribe(PRIMARY_MODEL_ID, {
          input: primaryPayload,
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === 'IN_PROGRESS' && update.logs) {
              update.logs.forEach((log) => {
                console.log(`[fal.ai captions] ${log.message}`)
              })
            }
          },
        }),
      {
        pipeline: 'captions.auto_subtitle.provider',
        provider: 'fal',
        metadata: { model: PRIMARY_MODEL_ID, ...metadata },
        retries: 4,
        baseDelayMs: 800,
      },
    )

    const data = result.data as {
      video?: { url?: string }
      transcription?: string
      subtitle_count?: number
      words?: unknown[]
      transcription_metadata?: unknown
    }

    const videoUrl = data.video?.url || ''

    return {
      videoUrl,
      transcription: data.transcription,
      subtitleCount: data.subtitle_count,
      words: data.words,
      transcriptionMetadata: data.transcription_metadata,
      modelUsed: PRIMARY_MODEL_ID,
    }
  }

  try {
    const result = await runPrimary(payload)
    if (!result.videoUrl || result.videoUrl === input.videoUrl) {
      console.warn('[captions] primary output missing or matches input, falling back to auto-caption')
      return runAutoCaptionFallback(input)
    }
    return result
  } catch (error) {
    if (isModelUnavailable(error)) {
      console.warn('[captions] primary model unavailable, falling back to auto-caption')
      return runAutoCaptionFallback(input)
    }
    if (isValidationError(error)) {
      logValidationError(error, payload)
      const minimalPayload: Record<string, unknown> = { video_url: input.videoUrl }
      if (input.language) minimalPayload.language = input.language
      try {
        const minimalResult = await runPrimary(minimalPayload, { mode: 'minimal' })
        if (!minimalResult.videoUrl || minimalResult.videoUrl === input.videoUrl) {
          console.warn('[captions] minimal output missing or matches input, falling back to auto-caption')
          return runAutoCaptionFallback(input)
        }
        return minimalResult
      } catch (minimalError) {
        if (isValidationError(minimalError)) {
          logValidationError(minimalError, minimalPayload)
        }
        console.warn('[captions] validation failed, falling back to auto-caption')
        return runAutoCaptionFallback(input)
      }
    }
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    const cause = (error as { cause?: { code?: string } })?.cause
    if (message.includes('fetch') || message.includes('epipe') || cause?.code === 'EPIPE') {
      console.warn('[captions] primary model network error, falling back to auto-caption')
      return runAutoCaptionFallback(input)
    }
    throw error
  }
}

function toSrtTimestamp(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const totalMs = Math.round(safe * 1000)
  const hours = Math.floor(totalMs / 3600000)
  const minutes = Math.floor((totalMs % 3600000) / 60000)
  const secs = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

function sanitizeSubtitleText(text: string): string {
  return text
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSrt(segments: CaptionSegment[]): string {
  return segments
    .map((segment, index) => {
      const start = toSrtTimestamp(segment.start)
      const end = toSrtTimestamp(segment.end)
      const text = sanitizeSubtitleText(segment.text)
      return `${index + 1}\n${start} --> ${end}\n${text}`
    })
    .join('\n\n')
}

function toAssColor(input: string | undefined, fallback: [number, number, number], alpha: number): string {
  const rgb = input ? (parseHexColor(input) ?? fallback) : fallback
  const a = clamp(Math.round(alpha), 0, 255)
  const aHex = a.toString(16).padStart(2, '0').toUpperCase()
  const bHex = rgb[2].toString(16).padStart(2, '0').toUpperCase()
  const gHex = rgb[1].toString(16).padStart(2, '0').toUpperCase()
  const rHex = rgb[0].toString(16).padStart(2, '0').toUpperCase()
  return `&H${aHex}${bHex}${gHex}${rHex}`
}

function buildAssForceStyle(input: RenderSelectedCaptionsInput): string {
  const position = input.position ?? 'bottom'
  const alignment = position === 'top' ? 8 : position === 'center' ? 5 : 2
  const fontName = (input.fontName ?? 'Poppins').replace(/[^a-zA-Z0-9 _-]/g, '') || 'Poppins'
  const fontSize = Math.round(clamp(input.fontSize ?? 48, 12, 160))
  const outline = Number(clamp(input.strokeWidth ?? 2, 0, 12).toFixed(2))
  const bold = normalizeFontWeight(input.fontWeight) === 'bold' ? -1 : 0
  const xOffset = Math.round(input.xOffset ?? 0)
  const yOffset = Math.round(input.yOffset ?? 0)
  const marginL = clamp(40 + Math.max(0, -xOffset), 0, 1000)
  const marginR = clamp(40 + Math.max(0, xOffset), 0, 1000)

  // Libass margin semantics are alignment-specific. This keeps a deterministic baseline.
  let marginV = 80
  if (position === 'bottom') marginV = clamp(80 - yOffset, 0, 1000)
  else if (position === 'top') marginV = clamp(80 + yOffset, 0, 1000)
  else marginV = clamp(80 + yOffset, 0, 1000)

  const hasBackground =
    input.backgroundColor !== undefined && !['none', 'transparent'].includes(input.backgroundColor.trim().toLowerCase())
  const backgroundOpacity = clamp(input.backgroundOpacity ?? 0.35, 0, 1)
  const backAlpha = hasBackground ? 255 - Math.round(backgroundOpacity * 255) : 255

  const styles = [
    `FontName=${fontName}`,
    `FontSize=${fontSize}`,
    `Bold=${bold}`,
    `PrimaryColour=${toAssColor(input.fontColor, [255, 255, 255], 0)}`,
    `OutlineColour=${toAssColor(input.strokeColor, [0, 0, 0], 0)}`,
    `BackColour=${toAssColor(input.backgroundColor, [0, 0, 0], backAlpha)}`,
    `BorderStyle=${hasBackground ? 3 : 1}`,
    `Outline=${outline}`,
    'Shadow=0',
    `Alignment=${alignment}`,
    `MarginL=${Math.round(marginL)}`,
    `MarginR=${Math.round(marginR)}`,
    `MarginV=${Math.round(marginV)}`,
  ]

  return styles.join(',')
}

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

async function resolveInputVideoPath(videoUrl: string, outputDir: string, destinationPath: string): Promise<void> {
  if (videoUrl.startsWith('/')) {
    const projectRoot = path.dirname(outputDir)
    const allowedPrefixes = ['/outputs/', '/uploads/']
    if (!allowedPrefixes.some((prefix) => videoUrl.startsWith(prefix))) {
      throw new Error('Unsupported local video path. Use /outputs/... or /uploads/...')
    }
    const localPath = path.resolve(projectRoot, `.${videoUrl}`)
    const relative = path.relative(projectRoot, localPath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Invalid local video path')
    }
    await fs.copyFile(localPath, destinationPath)
    return
  }

  if (!/^https?:\/\//i.test(videoUrl)) {
    throw new Error('Unsupported video URL. Use a local /outputs path or an http(s) URL.')
  }

  const response = await fetch(videoUrl)
  if (!response.ok) {
    throw new Error(`Failed to download source video: HTTP ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(destinationPath, buffer)
}

function runFfmpeg(args: string[]): Promise<void> {
  const configured = process.env.FFMPEG_PATH?.trim()
  const candidates = [configured, DEFAULT_FFMPEG_PATH, ffmpegStatic || undefined, 'ffmpeg']
    .filter((candidate): candidate is string => Boolean(candidate))
    .filter((candidate, index, list) => list.indexOf(candidate) === index)

  const runWithBinary = (binary: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const proc = spawn(binary, args)
      let stderr = ''
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`ffmpeg failed (binary=${binary}, code ${code}): ${stderr || 'unknown error'}`))
        }
      })
      proc.on('error', (error) => {
        reject(new Error(`ffmpeg spawn failed (binary=${binary}): ${error.message}`))
      })
    })

  return candidates
    .reduce<Promise<void>>(
      (chain, binary) => {
        return chain.catch(() => runWithBinary(binary))
      },
      Promise.reject(new Error('ffmpeg execution not started')),
    )
    .catch((error) => {
      throw error instanceof Error ? error : new Error('ffmpeg execution failed')
    })
}

export async function renderSelectedCaptions(
  input: RenderSelectedCaptionsInput,
): Promise<RenderSelectedCaptionsResult> {
  const segments = input.segments
    .map((segment) => ({
      start: Number(segment.start),
      end: Number(segment.end),
      text: sanitizeSubtitleText(segment.text ?? ''),
    }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .filter((segment) => segment.text.length > 0)

  if (segments.length === 0) {
    throw new Error('No valid subtitle segments to render')
  }

  await fs.mkdir(input.outputDir, { recursive: true })

  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`
  const tempDir = path.join(input.outputDir, `caption_render_${runId}`)
  const inputPath = path.join(tempDir, 'input.mp4')
  const subtitlesPath = path.join(tempDir, 'captions.srt')
  const outputName = `captioned_${runId}.mp4`
  const outputPath = path.join(input.outputDir, outputName)

  await fs.mkdir(tempDir, { recursive: true })

  try {
    await resolveInputVideoPath(input.videoUrl, input.outputDir, inputPath)
    await fs.writeFile(subtitlesPath, buildSrt(segments), 'utf8')

    const forceStyle = buildAssForceStyle(input)
    const subtitleFilter = `subtitles=filename='${escapeFilterPath(subtitlesPath)}':charenc=UTF-8:force_style='${forceStyle}'`

    await runFfmpeg([
      '-y',
      '-i',
      inputPath,
      '-vf',
      subtitleFilter,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'copy',
      outputPath,
    ])

    return {
      videoUrl: `/outputs/${outputName}`,
      subtitleCount: segments.length,
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function uploadVideoFile(filePath: string, contentType?: string): Promise<string> {
  return uploadVideoToFal(filePath, contentType)
}
