import fs from 'fs/promises'
import path from 'path'

const HEDRA_BASE_URL = 'https://api.hedra.com/web-app/public'
const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 600_000

function getApiKey(): string {
  return process.env.HEDRA_API_KEY || ''
}

function getModelId(): string {
  return process.env.HEDRA_MODEL_ID || 'd1dd37a3-e39a-4854-a298-6510289f9cf2'
}

export interface HedraLipsyncOptions {
  imagePath: string
  audioPath: string
  aspectRatio?: '16:9' | '9:16' | '1:1'
  resolution?: '540p' | '720p'
}

export interface HedraLipsyncResult {
  videoUrl: string
  generationId: string
}

function headers(contentType?: string): Record<string, string> {
  const h: Record<string, string> = { 'x-api-key': getApiKey() }
  if (contentType) h['Content-Type'] = contentType
  return h
}

async function hedraFetch(endpoint: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${HEDRA_BASE_URL}${endpoint}`, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Hedra API ${endpoint} failed (${res.status}): ${body}`)
  }
  return res
}

async function createAsset(name: string, type: 'image' | 'audio'): Promise<string> {
  const res = await hedraFetch('/assets', {
    method: 'POST',
    headers: headers('application/json'),
    body: JSON.stringify({ name, type }),
  })
  const data = await res.json() as { id: string }
  console.log(`[Hedra] Created ${type} asset: ${data.id}`)
  return data.id
}

async function uploadAsset(assetId: string, filePath: string): Promise<void> {
  const fileBuffer = await fs.readFile(filePath)
  const fileName = path.basename(filePath)
  const blob = new Blob([fileBuffer])
  const formData = new FormData()
  formData.append('file', blob, fileName)

  await hedraFetch(`/assets/${assetId}/upload`, {
    method: 'POST',
    headers: { 'x-api-key': getApiKey() },
    body: formData,
  })
  console.log(`[Hedra] Uploaded ${fileName} to asset ${assetId}`)
}

async function createGeneration(
  imageAssetId: string,
  audioAssetId: string,
  options: Pick<HedraLipsyncOptions, 'aspectRatio' | 'resolution'>
): Promise<string> {
  const res = await hedraFetch('/generations', {
    method: 'POST',
    headers: headers('application/json'),
    body: JSON.stringify({
      type: 'video',
      ai_model_id: getModelId(),
      start_keyframe_id: imageAssetId,
      audio_id: audioAssetId,
      generated_video_inputs: {
        text_prompt: '',
        resolution: options.resolution || '720p',
        aspect_ratio: options.aspectRatio || '9:16',
      },
    }),
  })
  const data = await res.json() as { id: string }
  console.log(`[Hedra] Generation started: ${data.id}`)
  return data.id
}

interface GenerationStatus {
  status: string
  url?: string
  error_message?: string
}

async function pollGeneration(generationId: string): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await hedraFetch(`/generations/${generationId}/status`, {
      headers: headers(),
    })
    const data = await res.json() as GenerationStatus

    if (data.status === 'complete' && data.url) {
      console.log(`[Hedra] Generation complete: ${data.url}`)
      return data.url
    }
    if (data.status === 'error') {
      throw new Error(`Hedra generation failed: ${data.error_message || 'Unknown error'}`)
    }

    console.log(`[Hedra] Status: ${data.status} (${Math.round((Date.now() - start) / 1000)}s)`)
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error('Hedra generation timed out after 10 minutes')
}

export async function createHedraVideo(options: HedraLipsyncOptions): Promise<HedraLipsyncResult> {
  if (!getApiKey()) {
    throw new Error('HEDRA_API_KEY is not configured')
  }

  console.log('[Hedra] Starting video generation...')
  console.log(`[Hedra] Image: ${options.imagePath}`)
  console.log(`[Hedra] Audio: ${options.audioPath}`)

  const imageName = path.basename(options.imagePath)
  const audioName = path.basename(options.audioPath)

  const [imageAssetId, audioAssetId] = await Promise.all([
    createAsset(imageName, 'image'),
    createAsset(audioName, 'audio'),
  ])

  await Promise.all([
    uploadAsset(imageAssetId, options.imagePath),
    uploadAsset(audioAssetId, options.audioPath),
  ])

  const generationId = await createGeneration(imageAssetId, audioAssetId, options)
  const videoUrl = await pollGeneration(generationId)

  return { videoUrl, generationId }
}

export async function downloadHedraVideo(videoUrl: string, outputPath: string): Promise<string> {
  const response = await fetch(videoUrl)
  if (!response.ok) {
    throw new Error(`Failed to download Hedra video: ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, buffer)

  console.log(`[Hedra] Video saved to ${outputPath}`)
  return outputPath
}
