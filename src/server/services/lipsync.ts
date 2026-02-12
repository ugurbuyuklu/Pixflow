import { createHedraVideo, downloadHedraVideo } from './hedra.js'

export interface LipsyncOptions {
  imagePath: string
  audioPath: string
  aspectRatio?: '16:9' | '9:16' | '1:1'
  resolution?: '540p' | '720p'
}

export interface LipsyncResult {
  videoUrl: string
  generationId: string
}

export interface LipsyncJob {
  id: string
  status: 'pending' | 'processing' | 'complete' | 'error'
  videoUrl?: string
  error?: string
  progress?: number
}

/**
 * Create a lipsync video using Hedra API.
 * Takes local image and audio paths, returns the generated video URL.
 */
export async function createLipsyncVideo(options: LipsyncOptions): Promise<LipsyncResult> {
  console.log(`[Lipsync] Generating video with Hedra...`)
  console.log(`[Lipsync] Image: ${options.imagePath}`)
  console.log(`[Lipsync] Audio: ${options.audioPath}`)

  try {
    const result = await createHedraVideo({
      imagePath: options.imagePath,
      audioPath: options.audioPath,
      aspectRatio: options.aspectRatio || '9:16',
      resolution: options.resolution || '720p',
    })

    console.log(`[Lipsync] Video generated: ${result.videoUrl}`)

    return {
      videoUrl: result.videoUrl,
      generationId: result.generationId,
    }
  } catch (error) {
    console.error('[Lipsync] Hedra error:', error)
    throw error
  }
}

/**
 * Create lipsync video and return as a job-like response for API compatibility.
 */
export async function createLipsyncVideoJob(options: LipsyncOptions): Promise<LipsyncJob> {
  try {
    const result = await createLipsyncVideo(options)
    return {
      id: result.generationId,
      status: 'complete',
      videoUrl: result.videoUrl,
    }
  } catch (error) {
    return {
      id: `hedra_error_${Date.now()}`,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Download the generated video to a local path.
 */
export async function downloadVideo(videoUrl: string, outputPath: string): Promise<string> {
  return downloadHedraVideo(videoUrl, outputPath)
}
