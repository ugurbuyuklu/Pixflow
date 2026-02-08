import { fal } from '@fal-ai/client'

let falConfigured = false

function ensureFalConfig() {
  if (!falConfigured) {
    fal.config({ credentials: process.env.FAL_API_KEY })
    falConfigured = true
  }
}

const AVATAR_MODEL = 'fal-ai/nano-banana-pro'

export interface AvatarGenerationOptions {
  resolution?: '1K' | '2K' | '4K'
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:3' | '3:4'
}

export interface AvatarGenerationResult {
  imageUrl: string
  requestId: string
}

/**
 * Generate an avatar image using fal.ai's nano-banana-pro/edit model.
 * Works with prompt only (no reference image needed).
 */
export async function generateAvatar(
  prompt: string,
  options: AvatarGenerationOptions = {}
): Promise<AvatarGenerationResult> {
  ensureFalConfig()

  const result = await fal.subscribe(AVATAR_MODEL, {
    input: {
      prompt,
      resolution: options.resolution || '2K',
      aspect_ratio: options.aspectRatio || '9:16',
      output_format: 'png',
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS' && update.logs) {
        update.logs.forEach((log) => console.log(`[fal.ai avatar] ${log.message}`))
      }
    },
  })

  const imageUrl = result.data?.images?.[0]?.url
  if (!imageUrl) {
    throw new Error('No image generated')
  }

  return {
    imageUrl,
    requestId: result.requestId,
  }
}

/**
 * Generate an avatar from a reference image using fal.ai's nano-banana-pro/edit model.
 * This preserves the face/identity from the reference while applying the prompt styling.
 */
export async function generateAvatarFromReference(
  referenceImageUrl: string,
  prompt: string,
  options: AvatarGenerationOptions = {}
): Promise<AvatarGenerationResult> {
  ensureFalConfig()

  const result = await fal.subscribe(AVATAR_MODEL, {
    input: {
      prompt,
      image_urls: [referenceImageUrl],
      resolution: options.resolution || '2K',
      aspect_ratio: options.aspectRatio || '9:16',
      output_format: 'png',
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS' && update.logs) {
        update.logs.forEach((log) => console.log(`[fal.ai avatar i2i] ${log.message}`))
      }
    },
  })

  const imageUrl = result.data?.images?.[0]?.url
  if (!imageUrl) {
    throw new Error('No image generated')
  }

  return {
    imageUrl,
    requestId: result.requestId,
  }
}
