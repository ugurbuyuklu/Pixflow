import { fal } from '@fal-ai/client'
import fs from 'fs/promises'
import path from 'path'

let falConfigured = false

function ensureFalConfig() {
  if (!falConfigured) {
    fal.config({ credentials: process.env.FAL_API_KEY })
    falConfigured = true
  }
}

const OMNIHUMAN_MODEL = 'fal-ai/bytedance/omnihuman/v1.5'

export interface LipsyncOptions {
  imageUrl: string
  audioUrl: string
}

export interface LipsyncResult {
  videoUrl: string
  duration: number
}

export interface LipsyncJob {
  id: string
  status: 'pending' | 'processing' | 'complete' | 'error'
  videoUrl?: string
  error?: string
  progress?: number
}

interface OmniHumanOutput {
  video?: {
    url: string
    content_type?: string
    file_name?: string
    file_size?: number
  }
  duration?: number
}

/**
 * Create a lipsync video using fal.ai OmniHuman v1.5.
 * Takes an image URL and audio URL, returns the generated video.
 */
export async function createLipsyncVideo(options: LipsyncOptions): Promise<LipsyncResult> {
  ensureFalConfig()

  console.log(`[Lipsync] Generating video with OmniHuman v1.5...`)
  console.log(`[Lipsync] Image: ${options.imageUrl}`)
  console.log(`[Lipsync] Audio: ${options.audioUrl}`)

  try {
    const result = await fal.subscribe(OMNIHUMAN_MODEL, {
      input: {
        image_url: options.imageUrl,
        audio_url: options.audioUrl,
        resolution: '720p',
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS' && update.logs) {
          update.logs.forEach((log) => console.log(`[fal.ai OmniHuman] ${log.message}`))
        }
      },
    })
    return processResult(result)
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'body' in error) {
      console.error('[Lipsync] fal.ai error body:', JSON.stringify((error as { body: unknown }).body, null, 2))
    }
    throw error
  }
}

function processResult(result: { data: unknown }): LipsyncResult {
  const output = result.data as OmniHumanOutput

  if (!output.video?.url) {
    throw new Error('No video generated from OmniHuman')
  }

  console.log(`[Lipsync] Video generated: ${output.video.url}`)
  console.log(`[Lipsync] Duration: ${output.duration}s`)

  return {
    videoUrl: output.video.url,
    duration: output.duration || 0,
  }
}

/**
 * Create lipsync video and return as a job-like response for API compatibility.
 */
export async function createLipsyncVideoJob(options: LipsyncOptions): Promise<LipsyncJob> {
  try {
    const result = await createLipsyncVideo(options)
    return {
      id: `omnihuman_${Date.now()}`,
      status: 'complete',
      videoUrl: result.videoUrl,
    }
  } catch (error) {
    return {
      id: `omnihuman_${Date.now()}`,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Download the generated video to a local path.
 */
export async function downloadVideo(videoUrl: string, outputPath: string): Promise<string> {
  const response = await fetch(videoUrl)
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, buffer)

  console.log(`[Lipsync] Video saved to ${outputPath}`)

  return outputPath
}

/**
 * Upload a local file and get a public URL for fal.ai.
 * Uses fal.ai's storage service.
 */
export async function uploadToFal(filePath: string): Promise<string> {
  ensureFalConfig()

  const fileBuffer = await fs.readFile(filePath)
  const fileName = path.basename(filePath)
  const file = new File([fileBuffer], fileName)

  const url = await fal.storage.upload(file)
  console.log(`[Lipsync] Uploaded ${fileName} to fal.ai: ${url}`)

  return url
}
