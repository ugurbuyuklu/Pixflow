import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fal } from '@fal-ai/client'
import ffmpegStatic from 'ffmpeg-static'
import { ensureFalConfig } from './falConfig.js'
import { isMockProvidersEnabled, recordMockProviderSuccess, runWithRetries } from './providerRuntime.js'

const WIZPER_MODEL = 'fal-ai/wizper'
const DEFAULT_FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg'

function getFfmpegCandidates(): string[] {
  return [process.env.FFMPEG_PATH?.trim(), DEFAULT_FFMPEG_PATH, ffmpegStatic || undefined, 'ffmpeg']
    .filter((c): c is string => Boolean(c))
    .filter((c, i, list) => list.indexOf(c) === i)
}

const FFMPEG_TIMEOUT_MS = 30_000

class SpawnError extends Error {
  constructor(
    message: string,
    public readonly isSpawnFailure: boolean,
  ) {
    super(message)
  }
}

function spawnFfmpeg(args: string[]): Promise<void> {
  const runWithBinary = (binary: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const proc = spawn(binary, args)
      let stderr = ''
      let settled = false
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true
          fn()
        }
      }
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      proc.on('close', (code) => {
        settle(() => {
          if (code === 0) resolve()
          else
            reject(
              new SpawnError(`ffmpeg failed (binary=${binary}, code ${code}): ${stderr || 'unknown error'}`, false),
            )
        })
      })
      proc.on('error', (error: Error) => {
        settle(() => reject(new SpawnError(`ffmpeg spawn failed (binary=${binary}): ${error.message}`, true)))
      })
      setTimeout(() => {
        settle(() => {
          proc.kill()
          reject(new SpawnError(`ffmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms (binary=${binary})`, false))
        })
      }, FFMPEG_TIMEOUT_MS)
    })

  return getFfmpegCandidates()
    .reduce<Promise<void>>(
      (chain, binary) =>
        chain.catch((err) =>
          err instanceof SpawnError && err.isSpawnFailure ? runWithBinary(binary) : Promise.reject(err),
        ),
      Promise.reject(new SpawnError('ffmpeg execution not started', true)),
    )
    .catch((error) => {
      throw error instanceof Error ? error : new Error('ffmpeg execution failed')
    })
}

export interface TranscriptionResult {
  transcript: string
  duration: number
  language?: string
  segments?: Array<{
    start: number
    end: number
    text: string
  }>
}

interface FalValidationErrorShape {
  status?: number
  body?: {
    detail?: unknown
  }
}

function isValidationError(error: unknown): error is FalValidationErrorShape {
  const err = error as FalValidationErrorShape
  return err?.status === 422
}

function serializeValidationDetail(error: unknown): string {
  const detail = (error as FalValidationErrorShape)?.body?.detail
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const normalizeSegmentText = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const parseTimePair = (value: unknown): { start: number; end: number } | null => {
  if (Array.isArray(value) && value.length >= 2) {
    const start = toFiniteNumber(value[0])
    const end = toFiniteNumber(value[1])
    if (start !== null && end !== null && end > start) {
      return { start, end }
    }
  }
  return null
}

const toObjectRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null

const extractTimedSegmentsFromEntries = (entries: unknown): Array<{ start: number; end: number; text: string }> => {
  if (!Array.isArray(entries)) return []
  return entries
    .map((entry) => {
      const item = toObjectRecord(entry)
      if (!item) return null
      const text = normalizeSegmentText(item.text ?? item.caption ?? item.transcript ?? item.sentence)
      let start =
        toFiniteNumber(item.start) ??
        toFiniteNumber(item.start_time) ??
        toFiniteNumber(item.from) ??
        toFiniteNumber(item.begin)
      let end =
        toFiniteNumber(item.end) ??
        toFiniteNumber(item.end_time) ??
        toFiniteNumber(item.to) ??
        toFiniteNumber(item.finish)
      if (start === null || end === null || end <= start) {
        const pair = parseTimePair(item.timestamp ?? item.timestamps ?? item.time)
        if (pair) {
          start = pair.start
          end = pair.end
        }
      }
      if (start === null || end === null || end <= start || !text) return null
      return { start, end, text }
    })
    .filter((segment): segment is { start: number; end: number; text: string } => Boolean(segment))
}

const extractWordTokens = (entries: unknown): Array<{ start: number; end: number; text: string }> => {
  if (!Array.isArray(entries)) return []
  return entries
    .map((entry) => {
      const item = toObjectRecord(entry)
      if (!item) return null
      const text = normalizeSegmentText(item.text ?? item.word ?? item.token)
      let start =
        toFiniteNumber(item.start) ??
        toFiniteNumber(item.start_time) ??
        toFiniteNumber(item.from) ??
        toFiniteNumber(item.begin)
      let end =
        toFiniteNumber(item.end) ??
        toFiniteNumber(item.end_time) ??
        toFiniteNumber(item.to) ??
        toFiniteNumber(item.finish)
      if (start === null || end === null || end <= start) {
        const pair = parseTimePair(item.timestamp ?? item.timestamps ?? item.time)
        if (pair) {
          start = pair.start
          end = pair.end
        }
      }
      if (start === null || end === null || end <= start || !text) return null
      return { start, end, text }
    })
    .filter((token): token is { start: number; end: number; text: string } => Boolean(token))
}

const buildSegmentsFromWordTokens = (
  tokens: Array<{ start: number; end: number; text: string }>,
): Array<{ start: number; end: number; text: string }> => {
  if (tokens.length === 0) return []
  const output: Array<{ start: number; end: number; text: string }> = []
  const maxWords = 8
  const maxDuration = 4.2

  let currentStart: number | null = null
  let currentEnd: number | null = null
  let currentWords = 0
  let currentText = ''

  const flush = () => {
    const text = normalizeSegmentText(currentText)
    if (currentStart !== null && currentEnd !== null && currentEnd > currentStart && text) {
      output.push({ start: currentStart, end: currentEnd, text })
    }
    currentStart = null
    currentEnd = null
    currentWords = 0
    currentText = ''
  }

  for (const token of tokens) {
    if (currentStart === null) currentStart = token.start
    currentEnd = token.end
    currentWords += 1
    currentText = currentText ? `${currentText} ${token.text}` : token.text

    const textEndsSentence = /[.!?…]$/.test(token.text)
    const duration = currentStart !== null && currentEnd !== null ? currentEnd - currentStart : 0
    const shouldBreak = textEndsSentence || currentWords >= maxWords || duration >= maxDuration
    if (shouldBreak) flush()
  }

  flush()
  return output
}

const looksLikeWordLevelEntries = (entries: Array<{ text: string }>): boolean => {
  if (entries.length === 0) return false
  const singleWordCount = entries.filter((entry) => entry.text.split(/\s+/).filter(Boolean).length <= 1).length
  return singleWordCount / entries.length >= 0.7
}

const extractTimedSegments = (payload: unknown): Array<{ start: number; end: number; text: string }> => {
  const root = toObjectRecord(payload)
  if (!root) return []

  const nestedTranscription = toObjectRecord(root.transcription)
  const nestedResult = toObjectRecord(root.result)
  const nestedOutput = toObjectRecord(root.output)
  const nestedMetadata = toObjectRecord(root.transcription_metadata)

  const segmentCandidates: unknown[] = [
    root.segments,
    root.chunks,
    root.utterances,
    root.sentences,
    nestedTranscription?.segments,
    nestedResult?.segments,
    nestedOutput?.segments,
    nestedMetadata?.segments,
  ]

  for (const candidate of segmentCandidates) {
    const segments = extractTimedSegmentsFromEntries(candidate)
    if (segments.length === 0) continue
    if (looksLikeWordLevelEntries(segments)) {
      const tokens = segments.map((segment) => ({ start: segment.start, end: segment.end, text: segment.text }))
      const grouped = buildSegmentsFromWordTokens(tokens)
      if (grouped.length > 0) return grouped
    }
    return segments
  }

  const wordCandidates: unknown[] = [
    root.words,
    root.tokens,
    root.chunks,
    nestedTranscription?.words,
    nestedResult?.words,
    nestedOutput?.words,
    nestedMetadata?.words,
  ]

  for (const candidate of wordCandidates) {
    const tokens = extractWordTokens(candidate)
    const segments = buildSegmentsFromWordTokens(tokens)
    if (segments.length > 0) return segments
  }

  return []
}

/**
 * Extract audio from video file using ffmpeg.
 * Returns path to temporary MP3 file.
 */
export async function extractAudioFromVideo(videoPath: string): Promise<string> {
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const tempAudioPath = `/tmp/wizper_audio_${timestamp}_${random}.mp3`

  await spawnFfmpeg([
    '-i',
    videoPath,
    '-vn',
    '-acodec',
    'libmp3lame',
    '-ar',
    '16000',
    '-ac',
    '1',
    '-b:a',
    '64k',
    tempAudioPath,
  ])
  console.log(`[Wizper] Audio extracted to ${tempAudioPath}`)
  return tempAudioPath
}

/**
 * Upload audio file to fal.ai storage.
 * Returns public URL for fal.ai API consumption.
 */
async function uploadToFal(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath)
  const blob = new Blob([buffer], { type: 'audio/mpeg' })
  const file = new File([blob], path.basename(filePath), { type: 'audio/mpeg' })
  const url = await fal.storage.upload(file)
  console.log(`[Wizper] Audio uploaded to fal.ai: ${url}`)
  return url
}

/**
 * Transcribe audio file using fal-ai/wizper model.
 * Returns transcript text and metadata.
 */
export async function transcribeAudio(audioPath: string): Promise<TranscriptionResult> {
  if (isMockProvidersEnabled()) {
    await recordMockProviderSuccess({
      pipeline: 'avatars.transcribe.provider',
      provider: 'fal',
      metadata: { audioPath },
    })
    return {
      transcript: 'Mock transcript for testing purposes.',
      duration: 30,
      language: 'en',
    }
  }

  ensureFalConfig()

  console.log(`[Wizper] Transcribing audio: ${audioPath}`)

  // Upload audio to fal.ai
  const audioUrl = await uploadToFal(audioPath)
  const payloadAttempts: Array<{ name: string; payload: Record<string, unknown> }> = [
    {
      name: 'minimal',
      payload: {
        audio_url: audioUrl,
        task: 'transcribe',
        // Force source-language transcription (no implicit English default).
        language: null,
      },
    },
    {
      name: 'segment',
      payload: {
        audio_url: audioUrl,
        task: 'transcribe',
        // Keep auto-detect on fallback payload as well.
        language: null,
        chunk_level: 'segment',
        merge_chunks: true,
        max_segment_len: 29,
      },
    },
  ]

  let result: Awaited<ReturnType<typeof fal.subscribe>> | null = null
  let lastError: unknown = null

  for (const attempt of payloadAttempts) {
    try {
      result = await runWithRetries(
        () =>
          fal.subscribe(WIZPER_MODEL, {
            input: attempt.payload,
            logs: true,
            onQueueUpdate: (update) => {
              if (update.status === 'IN_PROGRESS' && update.logs) {
                // biome-ignore lint/suspicious/useIterableCallbackReturn: side-effect logging
                update.logs.forEach((log) => console.log(`[fal.ai Wizper] ${log.message}`))
              }
            },
          }),
        {
          pipeline: 'avatars.transcribe.provider',
          provider: 'fal',
          metadata: { audioPath, attempt: attempt.name },
        },
      )
      break
    } catch (error) {
      lastError = error
      if (!isValidationError(error)) {
        throw error
      }

      console.warn('[Wizper] Validation error; retrying with fallback payload', {
        attempt: attempt.name,
        detail: serializeValidationDetail(error),
      })
    }
  }

  if (!result) {
    throw lastError instanceof Error ? lastError : new Error('Wizper transcription failed')
  }

  const transcript = result.data?.text
  if (!transcript) {
    throw new Error('No transcript returned from Wizper')
  }

  const segments = extractTimedSegments(result.data)

  console.log('[Wizper] Transcription complete', {
    transcriptChars: transcript.length,
    segmentCount: segments.length,
  })

  return {
    transcript,
    duration: result.data?.duration || 0,
    language: result.data?.languages?.[0] || result.data?.language,
    ...(segments.length > 0 ? { segments } : {}),
  }
}

/**
 * Main orchestrator: Extract audio from video and transcribe.
 * Cleans up temporary audio file in finally block.
 */
export async function transcribeVideo(videoPath: string): Promise<TranscriptionResult> {
  let tempAudioPath: string | null = null

  try {
    // Step 1: Extract audio
    tempAudioPath = await extractAudioFromVideo(videoPath)

    // Step 2: Transcribe
    const result = await transcribeAudio(tempAudioPath)

    return result
  } finally {
    // Cleanup: Delete temp audio file
    if (tempAudioPath) {
      try {
        await fs.unlink(tempAudioPath)
        console.log(`[Wizper] Cleaned up temp audio: ${tempAudioPath}`)
      } catch (err) {
        console.warn(`[Wizper] Failed to cleanup temp audio: ${tempAudioPath}`, err)
      }
    }
  }
}
