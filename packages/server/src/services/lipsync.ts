import fs from 'fs/promises'
import path from 'path'

const HEDRA_API_BASE = 'https://api.hedra.com/web-app/public'

interface HedraRequestInit extends RequestInit {
  headers: Record<string, string>
}

function getHeaders(): Record<string, string> {
  const apiKey = process.env.HEDRA_API_KEY
  if (!apiKey) {
    throw new Error('HEDRA_API_KEY environment variable is not set')
  }
  return {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
  }
}

async function hedraFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${HEDRA_API_BASE}${endpoint}`
  const headers = getHeaders()

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string> || {}),
    },
  } as HedraRequestInit)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Hedra API error (${response.status}): ${errorText}`)
  }

  return response
}

export interface HedraVoice {
  id: string
  name: string
  gender?: string
  accent?: string
  age?: string
}

export interface LipsyncOptions {
  imageUrl?: string
  imagePath?: string
  audioUrl?: string
  audioPath?: string
  textPrompt?: string
  aspectRatio?: '16:9' | '9:16' | '1:1'
  resolution?: '540p' | '720p'
  voiceId?: string
  voiceText?: string
  durationMs?: number
  seed?: number
}

export interface LipsyncJob {
  id: string
  status: 'pending' | 'processing' | 'complete' | 'error'
  videoUrl?: string
  error?: string
  progress?: number
}

export interface HedraAsset {
  id: string
  name: string
  type: 'image' | 'audio'
}

interface HedraVoiceResponse {
  id: string
  name: string
  gender?: string
  accent?: string
  age?: string
}

interface HedraVoicesResponse {
  voices?: HedraVoiceResponse[]
}

interface HedraModelsResponse {
  models?: { id: string; name: string }[]
}

interface HedraAssetResponse {
  id: string
}

interface HedraGenerationResponse {
  job_id?: string
  id?: string
}

interface HedraStatusResponse {
  status: string
  video_url?: string
  url?: string
  error?: string
  progress?: number
}

/**
 * List available voices from Hedra for text-to-speech.
 */
export async function listHedraVoices(): Promise<HedraVoice[]> {
  const response = await hedraFetch('/voices')
  const data = await response.json() as HedraVoicesResponse

  return data.voices?.map((v) => ({
    id: v.id,
    name: v.name,
    gender: v.gender,
    accent: v.accent,
    age: v.age,
  })) || []
}

/**
 * Get available AI models from Hedra.
 */
export async function listHedraModels(): Promise<{ id: string; name: string }[]> {
  const response = await hedraFetch('/models')
  const data = await response.json() as HedraModelsResponse
  return data.models || []
}

/**
 * Upload an asset (image or audio) to Hedra.
 */
async function uploadAsset(
  filePath: string,
  type: 'image' | 'audio',
  name?: string
): Promise<HedraAsset> {
  const fileName = name || path.basename(filePath)

  const createResponse = await hedraFetch('/assets', {
    method: 'POST',
    body: JSON.stringify({
      name: fileName,
      type,
    }),
  })
  const assetData = await createResponse.json() as HedraAssetResponse
  const assetId = assetData.id

  const fileBuffer = await fs.readFile(filePath)
  const uploadResponse = await fetch(`${HEDRA_API_BASE}/assets/${assetId}/upload`, {
    method: 'POST',
    headers: {
      ...getHeaders(),
      'Content-Type': 'application/octet-stream',
    },
    body: fileBuffer,
  })

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text()
    throw new Error(`Failed to upload asset: ${errorText}`)
  }

  return {
    id: assetId,
    name: fileName,
    type,
  }
}

/**
 * Upload an asset from a URL (downloads first, then uploads to Hedra).
 */
async function uploadAssetFromUrl(
  url: string,
  type: 'image' | 'audio',
  name?: string
): Promise<HedraAsset> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download asset from URL: ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const ext = type === 'image' ? '.png' : '.mp3'
  const tempPath = path.join('/tmp', `hedra_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)

  await fs.writeFile(tempPath, buffer)

  try {
    const asset = await uploadAsset(tempPath, type, name)
    return asset
  } finally {
    await fs.unlink(tempPath).catch(() => {})
  }
}

/**
 * Create a lipsync video generation job.
 */
export async function createLipsyncVideo(options: LipsyncOptions): Promise<LipsyncJob> {
  let imageAssetId: string
  if (options.imagePath) {
    const imageAsset = await uploadAsset(options.imagePath, 'image')
    imageAssetId = imageAsset.id
  } else if (options.imageUrl) {
    const imageAsset = await uploadAssetFromUrl(options.imageUrl, 'image')
    imageAssetId = imageAsset.id
  } else {
    throw new Error('Either imagePath or imageUrl is required')
  }

  let audioAssetId: string | undefined
  if (options.audioPath) {
    const audioAsset = await uploadAsset(options.audioPath, 'audio')
    audioAssetId = audioAsset.id
  } else if (options.audioUrl) {
    const audioAsset = await uploadAssetFromUrl(options.audioUrl, 'audio')
    audioAssetId = audioAsset.id
  }

  const models = await listHedraModels()
  const modelId = models[0]?.id

  const generationPayload: Record<string, unknown> = {
    type: 'video',
    ai_model_id: modelId,
    start_keyframe_id: imageAssetId,
    generated_video_inputs: {
      resolution: options.resolution || '720p',
      aspect_ratio: options.aspectRatio || '9:16',
      text_prompt: options.textPrompt || 'A person talking at the camera',
    },
  }

  if (audioAssetId) {
    generationPayload.audio_id = audioAssetId
  } else if (options.voiceId && options.voiceText) {
    generationPayload.audio_generation = {
      voice_id: options.voiceId,
      text: options.voiceText,
    }
  } else {
    throw new Error('Either audio file or voice_id + voice_text is required')
  }

  if (options.durationMs) {
    generationPayload.duration_ms = options.durationMs
  }

  if (options.seed !== undefined) {
    generationPayload.seed = options.seed
  }

  const response = await hedraFetch('/generations', {
    method: 'POST',
    body: JSON.stringify(generationPayload),
  })

  const data = await response.json() as HedraGenerationResponse

  return {
    id: data.job_id || data.id || '',
    status: 'pending',
  }
}

/**
 * Check the status of a lipsync video generation job.
 */
export async function checkLipsyncStatus(jobId: string): Promise<LipsyncJob> {
  const response = await hedraFetch(`/generations/${jobId}/status`)
  const data = await response.json() as HedraStatusResponse

  let status: LipsyncJob['status'] = 'processing'
  if (data.status === 'complete' || data.status === 'completed') {
    status = 'complete'
  } else if (data.status === 'error' || data.status === 'failed') {
    status = 'error'
  } else if (data.status === 'pending' || data.status === 'queued') {
    status = 'pending'
  }

  return {
    id: jobId,
    status,
    videoUrl: data.video_url || data.url,
    error: data.error,
    progress: data.progress,
  }
}

/**
 * Poll for job completion with configurable interval.
 */
export async function waitForLipsyncCompletion(
  jobId: string,
  pollIntervalMs = 5000,
  maxWaitMs = 600000
): Promise<LipsyncJob> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkLipsyncStatus(jobId)

    if (status.status === 'complete' || status.status === 'error') {
      return status
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(`Lipsync job ${jobId} timed out after ${maxWaitMs}ms`)
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

  return outputPath
}
