import { fal } from '@fal-ai/client'
import { ensureFalConfig } from './falConfig.js'
import {
  isMockProvidersEnabled,
  makeMockId,
  makeMockPngDataUrl,
  recordMockProviderSuccess,
  runWithRetries,
} from './providerRuntime.js'

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
  if (isMockProvidersEnabled()) {
    await recordMockProviderSuccess({
      pipeline: 'avatars.generate',
      provider: 'fal',
      metadata: { mock: true, aspectRatio: options.aspectRatio || '9:16', promptLength: prompt.length },
    })
    return {
      imageUrl: makeMockPngDataUrl(),
      requestId: makeMockId('avatar'),
    }
  }

  ensureFalConfig()

  const result = await runWithRetries(
    () => fal.subscribe(AVATAR_MODEL, {
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
    }),
    {
      pipeline: 'avatars.generate',
      provider: 'fal',
      metadata: { aspectRatio: options.aspectRatio || '9:16', promptLength: prompt.length },
    }
  )

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
  if (isMockProvidersEnabled()) {
    await recordMockProviderSuccess({
      pipeline: 'avatars.generateFromReference',
      provider: 'fal',
      metadata: { mock: true, aspectRatio: options.aspectRatio || '9:16', promptLength: prompt.length },
    })
    return {
      imageUrl: makeMockPngDataUrl(),
      requestId: makeMockId('avatar-ref'),
    }
  }

  ensureFalConfig()

  const result = await runWithRetries(
    () => fal.subscribe(AVATAR_MODEL, {
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
    }),
    {
      pipeline: 'avatars.generateFromReference',
      provider: 'fal',
      metadata: { aspectRatio: options.aspectRatio || '9:16', promptLength: prompt.length },
    }
  )

  const imageUrl = result.data?.images?.[0]?.url
  if (!imageUrl) {
    throw new Error('No image generated')
  }

  return {
    imageUrl,
    requestId: result.requestId,
  }
}
