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

  console.log(`[Wizper] Transcription complete: ${transcript.length} characters`)

  return {
    transcript,
    duration: result.data?.duration || 0,
    language: result.data?.languages?.[0] || result.data?.language,
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
