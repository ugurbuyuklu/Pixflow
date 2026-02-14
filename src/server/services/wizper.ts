import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fal } from '@fal-ai/client'
import { ensureFalConfig } from './falConfig.js'
import { isMockProvidersEnabled, recordMockProviderSuccess, runWithRetries } from './providerRuntime.js'

const WIZPER_MODEL = 'fal-ai/wizper'
const FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg'

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

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, [
      '-i',
      videoPath,
      '-vn', // No video
      '-acodec',
      'libmp3lame',
      '-ar',
      '44100', // 44.1kHz sample rate
      '-ac',
      '2', // Stereo
      '-b:a',
      '192k', // 192kbps bitrate
      tempAudioPath,
    ])

    let stderr = ''

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log(`[Wizper] Audio extracted to ${tempAudioPath}`)
        resolve(tempAudioPath)
      } else {
        console.error('[Wizper] FFmpeg extraction failed:', stderr)
        reject(new Error(`FFmpeg extraction failed with code ${code}`))
      }
    })

    ffmpeg.on('error', (err) => {
      console.error('[Wizper] FFmpeg spawn error:', err)
      reject(new Error(`FFmpeg not available: ${err.message}`))
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      ffmpeg.kill()
      reject(new Error('Audio extraction timed out after 30 seconds'))
    }, 30000)
  })
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

  const result = await runWithRetries(
    () =>
      fal.subscribe(WIZPER_MODEL, {
        input: {
          audio_url: audioUrl,
          task: 'transcribe',
          // Wizper defaults to English when language is omitted; null enables auto-detect.
          language: null as unknown as string,
          chunk_level: 'word',
          merge_chunks: false,
          max_segment_len: 8,
        },
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
      metadata: { audioPath },
    },
  )

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
