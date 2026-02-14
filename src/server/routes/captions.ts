import fs from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { renderSelectedCaptions, runAutoSubtitle, uploadVideoFile } from '../services/captions.js'
import { sendError, sendSuccess } from '../utils/http.js'

interface CaptionsRouterConfig {
  projectRoot: string
}

interface CaptionSegmentResponse {
  id: string
  start: number
  end: number
  text: string
}

function formatValidationDetail(detail: unknown): string | undefined {
  if (!detail) return undefined
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const e = entry as { loc?: unknown; msg?: unknown; type?: unknown }
        const loc = Array.isArray(e.loc) ? e.loc.join('.') : typeof e.loc === 'string' ? e.loc : ''
        const msg = typeof e.msg === 'string' ? e.msg : ''
        const type = typeof e.type === 'string' ? e.type : ''
        const head = loc ? `validation.${loc}` : 'validation'
        const tail = msg || type
        return tail ? `${head}: ${tail}` : head
      })
      .filter(Boolean)
    return parts.length ? parts.join(' | ') : undefined
  }
  return undefined
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeSegmentText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractSegmentsFromMetadata(metadata: unknown): CaptionSegmentResponse[] {
  if (!metadata || typeof metadata !== 'object') return []
  const maybeSegments = (metadata as { segments?: unknown }).segments
  if (!Array.isArray(maybeSegments)) return []

  return maybeSegments
    .map((segment, index) => {
      if (!segment || typeof segment !== 'object') return null
      const item = segment as { start?: unknown; end?: unknown; text?: unknown; caption?: unknown }
      const start = toNumber(item.start)
      const end = toNumber(item.end)
      const text = normalizeSegmentText(item.text ?? item.caption)
      if (start === null || end === null || end <= start || !text) return null
      return {
        id: `seg-${index + 1}`,
        start,
        end,
        text,
      }
    })
    .filter((segment): segment is CaptionSegmentResponse => Boolean(segment))
}

function extractSegmentsFromWords(words: unknown): CaptionSegmentResponse[] {
  if (!Array.isArray(words)) return []
  const tokens = words
    .map((token) => {
      if (!token || typeof token !== 'object') return null
      const entry = token as { text?: unknown; word?: unknown; start?: unknown; end?: unknown }
      const text = normalizeSegmentText(entry.text ?? entry.word)
      const start = toNumber(entry.start)
      const end = toNumber(entry.end)
      if (!text || start === null || end === null || end <= start) return null
      return { text, start, end }
    })
    .filter((token): token is { text: string; start: number; end: number } => Boolean(token))

  const segments: CaptionSegmentResponse[] = []
  let currentText = ''
  let currentStart: number | null = null
  let currentEnd: number | null = null

  for (const token of tokens) {
    if (currentStart === null) currentStart = token.start
    currentEnd = token.end
    currentText = currentText ? `${currentText} ${token.text}` : token.text

    if (/[.!?…]$/.test(token.text)) {
      const text = normalizeSegmentText(currentText)
      if (currentStart !== null && currentEnd !== null && text) {
        segments.push({
          id: `seg-${segments.length + 1}`,
          start: currentStart,
          end: currentEnd,
          text,
        })
      }
      currentText = ''
      currentStart = null
      currentEnd = null
    }
  }

  if (currentText && currentStart !== null && currentEnd !== null) {
    segments.push({
      id: `seg-${segments.length + 1}`,
      start: currentStart,
      end: currentEnd,
      text: normalizeSegmentText(currentText),
    })
  }

  return segments
}

function extractCaptionSegments(payload: {
  transcriptionMetadata?: unknown
  words?: unknown[]
}): CaptionSegmentResponse[] {
  const fromMetadata = extractSegmentsFromMetadata(payload.transcriptionMetadata)
  if (fromMetadata.length > 0) return fromMetadata
  return extractSegmentsFromWords(payload.words)
}

const captionsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many requests, please try again later', 'RATE_LIMITED')
  },
})

export function createCaptionsRouter(config: CaptionsRouterConfig): express.Router {
  const { projectRoot } = config
  const uploadsDir = path.join(projectRoot, 'uploads')

  const router = express.Router()

  const upload = multer({
    storage: multer.diskStorage({
      destination: async (_req, _file, cb) => {
        await fs.mkdir(uploadsDir, { recursive: true })
        cb(null, uploadsDir)
      },
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase()
        cb(null, `caption_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)
      },
    }),
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('video/')) {
        cb(null, true)
      } else {
        cb(new Error('Invalid file type. Video files only.'))
      }
    },
  })

  router.post('/auto-subtitle', captionsLimiter, upload.single('video'), async (req, res) => {
    let localPath: string | null = null
    try {
      const { videoUrl } = req.body as { videoUrl?: string }
      const file = req.file
      if (!videoUrl && !file) {
        sendError(res, 400, 'Video URL or file is required', 'MISSING_VIDEO')
        return
      }

      let finalVideoUrl = videoUrl
      if (file) {
        localPath = file.path
        finalVideoUrl = await uploadVideoFile(localPath, file.mimetype)
      }

      console.log('[captions] auto-subtitle request', {
        hasFile: Boolean(file),
        hasUrl: Boolean(videoUrl),
        fileType: file?.mimetype,
        urlPreview: finalVideoUrl ? finalVideoUrl.slice(0, 80) : null,
      })

      const input = {
        videoUrl: finalVideoUrl!,
        language: req.body.language || undefined,
        fontName: req.body.fontName || undefined,
        fontSize: req.body.fontSize ? Number(req.body.fontSize) : undefined,
        fontWeight: req.body.fontWeight || undefined,
        fontColor: req.body.fontColor || undefined,
        highlightColor: req.body.highlightColor || undefined,
        strokeWidth: req.body.strokeWidth ? Number(req.body.strokeWidth) : undefined,
        strokeColor: req.body.strokeColor || undefined,
        backgroundColor: req.body.backgroundColor || undefined,
        backgroundOpacity: req.body.backgroundOpacity ? Number(req.body.backgroundOpacity) : undefined,
        position: req.body.position || undefined,
        xOffset: req.body.xOffset !== undefined && req.body.xOffset !== '' ? Number(req.body.xOffset) : undefined,
        yOffset: req.body.yOffset !== undefined && req.body.yOffset !== '' ? Number(req.body.yOffset) : undefined,
        wordsPerSubtitle: req.body.wordsPerSubtitle ? Number(req.body.wordsPerSubtitle) : undefined,
        enableAnimation:
          typeof req.body.enableAnimation === 'string'
            ? ['1', 'true', 'yes', 'on'].includes(req.body.enableAnimation.toLowerCase())
            : undefined,
      }

      const result = await runAutoSubtitle(input)
      if (!result.videoUrl) {
        sendError(res, 500, 'Captioned video URL missing from provider', 'CAPTION_OUTPUT_MISSING')
        return
      }

      console.log('[captions] auto-subtitle success', {
        outputUrlPreview: result.videoUrl.slice(0, 80),
        subtitleCount: result.subtitleCount,
      })

      const segments = extractCaptionSegments({
        transcriptionMetadata: result.transcriptionMetadata,
        words: result.words,
      })

      sendSuccess(res, {
        ...result,
        sourceVideoUrl: finalVideoUrl,
        segments,
      })
    } catch (err) {
      const errorBody = (err as { body?: { detail?: unknown } })?.body
      const validationDetails = formatValidationDetail(errorBody?.detail)
      console.error('[captions] auto-subtitle failed', err)
      if (errorBody?.detail) {
        try {
          console.error('[captions] auto-subtitle error detail', JSON.stringify(errorBody.detail))
        } catch {
          console.error('[captions] auto-subtitle error detail', errorBody.detail)
        }
      } else if (errorBody) {
        try {
          console.error('[captions] auto-subtitle error body', JSON.stringify(errorBody))
        } catch {
          console.error('[captions] auto-subtitle error body', errorBody)
        }
      }
      sendError(
        res,
        500,
        'Failed to generate captions',
        'CAPTIONS_FAILED',
        validationDetails || (err instanceof Error ? err.message : 'Unknown error'),
      )
    } finally {
      if (localPath) {
        await fs.unlink(localPath).catch(() => {})
      }
    }
  })

  router.post('/render-selected', captionsLimiter, async (req, res) => {
    try {
      const body = req.body as {
        videoUrl?: string
        segments?: unknown
        fontName?: string
        fontSize?: number | string
        fontWeight?: 'normal' | 'bold' | 'black'
        fontColor?: string
        highlightColor?: string
        strokeWidth?: number | string
        strokeColor?: string
        backgroundColor?: string
        backgroundOpacity?: number | string
        position?: 'top' | 'center' | 'bottom'
        xOffset?: number | string
        yOffset?: number | string
        timingOffsetMs?: number | string
        wordsPerSubtitle?: number | string
      }

      const sourceVideoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : ''
      if (!sourceVideoUrl) {
        sendError(res, 400, 'Source video URL is required', 'MISSING_SOURCE_VIDEO_URL')
        return
      }

      const segmentsInput = Array.isArray(body.segments) ? body.segments : []
      const segments = segmentsInput
        .map((segment) => {
          if (!segment || typeof segment !== 'object') return null
          const item = segment as { start?: unknown; end?: unknown; text?: unknown }
          const start = toNumber(item.start)
          const end = toNumber(item.end)
          const text = normalizeSegmentText(item.text)
          if (start === null || end === null || end <= start || !text) return null
          return { start, end, text }
        })
        .filter((segment): segment is { start: number; end: number; text: string } => Boolean(segment))

      if (segments.length === 0) {
        sendError(res, 400, 'At least one valid subtitle segment is required', 'MISSING_SUBTITLE_SEGMENTS')
        return
      }

      const outputDir = path.join(projectRoot, 'outputs')
      const result = await renderSelectedCaptions({
        videoUrl: sourceVideoUrl,
        outputDir,
        segments,
        fontName: body.fontName || undefined,
        fontSize: toNumber(body.fontSize) ?? undefined,
        fontWeight: body.fontWeight || undefined,
        fontColor: body.fontColor || undefined,
        highlightColor: body.highlightColor || undefined,
        strokeWidth: toNumber(body.strokeWidth) ?? undefined,
        strokeColor: body.strokeColor || undefined,
        backgroundColor: body.backgroundColor || undefined,
        backgroundOpacity: toNumber(body.backgroundOpacity) ?? undefined,
        position: body.position || undefined,
        xOffset: toNumber(body.xOffset) ?? undefined,
        yOffset: toNumber(body.yOffset) ?? undefined,
        timingOffsetMs: toNumber(body.timingOffsetMs) ?? undefined,
        wordsPerSubtitle: toNumber(body.wordsPerSubtitle) ?? undefined,
      })

      sendSuccess(res, result)
    } catch (error) {
      console.error('[captions] render-selected failed', error)
      sendError(
        res,
        500,
        'Failed to render selected captions',
        'CAPTIONS_RENDER_SELECTED_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  return router
}
