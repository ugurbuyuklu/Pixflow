import { fal } from '@fal-ai/client'
import fs from 'fs/promises'
import path from 'path'
import { ensureFalConfig } from './falConfig.js'
import { isMockProvidersEnabled, makeMockDataUrl, makeMockId, recordMockProviderSuccess, runWithRetries } from './providerRuntime.js'

const MODEL_ID = 'fal-ai/kling-video/v2.1/master/image-to-video'

async function fileToDataUrl(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export interface KlingI2VOptions {
  imagePath: string
  prompt: string
  duration?: '5' | '10'
  aspectRatio?: '16:9' | '9:16' | '1:1'
  negativePrompt?: string
  cfgScale?: number
}

export interface KlingI2VResult {
  videoUrl: string
  requestId: string
}

export async function generateKlingVideo(options: KlingI2VOptions): Promise<KlingI2VResult> {
  if (isMockProvidersEnabled()) {
    await recordMockProviderSuccess({
      pipeline: 'avatars.i2v.provider',
      provider: 'kling',
      metadata: { duration: options.duration || '5', aspectRatio: options.aspectRatio || '9:16' },
    })
    return {
      videoUrl: makeMockDataUrl('video/mp4', 'mock-kling-video'),
      requestId: makeMockId('kling'),
    }
  }

  ensureFalConfig()

  const resolved = path.resolve(options.imagePath)
  try { await fs.access(resolved) } catch {
    throw new Error(`Image file not found: ${resolved}`)
  }

  const imageUrl = await fileToDataUrl(resolved)

  const result = await runWithRetries(
    () => fal.subscribe(MODEL_ID, {
      input: {
        prompt: options.prompt,
        image_url: imageUrl,
        duration: options.duration || '5',
        aspect_ratio: options.aspectRatio || '9:16',
        negative_prompt: options.negativePrompt || 'blur, distort, and low quality',
        cfg_scale: options.cfgScale ?? 0.5,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS' && update.logs) {
          update.logs.forEach((log) => console.log(`[Kling] ${log.message}`))
        }
      },
    }),
    {
      pipeline: 'avatars.i2v.provider',
      provider: 'kling',
      metadata: { duration: options.duration || '5', aspectRatio: options.aspectRatio || '9:16' },
    }
  )

  const data = result.data as Record<string, unknown> | undefined
  const videoUrl = (typeof data?.video_url === 'string' && data.video_url)
    || (typeof (data?.video as Record<string, unknown>)?.url === 'string' && (data.video as Record<string, unknown>).url as string)
  if (!videoUrl) throw new Error(`Kling returned no video URL. Response keys: ${data ? Object.keys(data).join(', ') : 'none'}`)

  return { videoUrl, requestId: result.requestId }
}

const MAX_VIDEO_SIZE = 500 * 1024 * 1024 // 500MB
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export async function downloadKlingVideo(videoUrl: string, outputPath: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(videoUrl, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) throw new Error(`Failed to download Kling video: ${response.status}`)

  const contentLength = Number(response.headers.get('content-length') || '0')
  if (contentLength > MAX_VIDEO_SIZE) {
    throw new Error(`Video too large: ${Math.round(contentLength / 1024 / 1024)}MB exceeds ${MAX_VIDEO_SIZE / 1024 / 1024}MB limit`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_VIDEO_SIZE) {
    throw new Error(`Video too large: ${Math.round(buffer.length / 1024 / 1024)}MB exceeds ${MAX_VIDEO_SIZE / 1024 / 1024}MB limit`)
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, buffer)
  console.log(`[Kling] Video saved to ${outputPath}`)
  return outputPath
}
