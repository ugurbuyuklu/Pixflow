import { fal } from '@fal-ai/client'
import fs from 'fs/promises'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

let falConfigured = false

function ensureFalConfig() {
  if (!falConfigured) {
    fal.config({ credentials: process.env.FAL_API_KEY })
    falConfigured = true
  }
}

const MODEL_ID = 'fal-ai/nano-banana-pro/edit'

export interface GeneratedImage {
  id: string
  url: string
  localPath?: string
  promptIndex: number
  status: 'pending' | 'generating' | 'completed' | 'failed'
  error?: string
}

export interface BatchJob {
  id: string
  concept: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  totalImages: number
  completedImages: number
  images: GeneratedImage[]
  outputDir: string
  createdAt: Date
}

const activeJobs = new Map<string, BatchJob>()
const JOB_RETENTION_MS = 30 * 60 * 1000 // 30 minutes

function cleanupOldJobs() {
  const now = Date.now()
  for (const [jobId, job] of activeJobs) {
    const jobAge = now - job.createdAt.getTime()
    if (jobAge > JOB_RETENTION_MS && (job.status === 'completed' || job.status === 'failed')) {
      activeJobs.delete(jobId)
    }
  }
}

setInterval(cleanupOldJobs, 5 * 60 * 1000) // Run every 5 minutes

async function fileToDataUrl(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath)
  const base64 = buffer.toString('base64')
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return `data:${mimeType};base64,${base64}`
}

export async function generateImage(
  referenceImagePaths: string | string[],
  prompt: string,
  options: { resolution?: string; aspectRatio?: string; numImages?: number; outputFormat?: string } = {}
): Promise<{ urls: string[]; requestId: string }> {
  ensureFalConfig()

  const paths = Array.isArray(referenceImagePaths) ? referenceImagePaths : [referenceImagePaths]

  const imageUrls = await Promise.all(
    paths.map(async (p) => {
      if (p.startsWith('file://') || p.startsWith('/')) {
        const filePath = p.replace('file://', '')
        return fileToDataUrl(filePath)
      }
      return p
    })
  )

  const numImages = options.numImages || 1

  const result = await fal.subscribe(MODEL_ID, {
    input: {
      prompt,
      image_urls: imageUrls,
      resolution: (options.resolution || '2K') as '1K' | '2K' | '4K',
      aspect_ratio: (options.aspectRatio || '9:16') as '9:16' | '16:9' | '1:1' | '4:3' | '3:4' | '4:5' | '5:4' | '3:2' | '2:3' | '21:9',
      num_images: numImages,
      output_format: (options.outputFormat || 'png') as 'png' | 'jpeg' | 'webp',
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS' && update.logs) {
        update.logs.forEach((log) => console.log(`[fal.ai] ${log.message}`))
      }
    },
  })

  const generatedUrls = result.data?.images?.map((img: { url: string }) => img.url) || []
  if (generatedUrls.length === 0) {
    throw new Error('No images generated')
  }

  return { urls: generatedUrls, requestId: result.requestId }
}

export async function downloadImage(url: string, outputPath: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download: ${response.status}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, buffer)

  return outputPath
}

export function createBatchJob(
  concept: string,
  promptCount: number,
  outputDir: string
): BatchJob {
  const job: BatchJob = {
    id: uuidv4(),
    concept,
    status: 'pending',
    totalImages: promptCount,
    completedImages: 0,
    images: Array.from({ length: promptCount }, (_, i) => ({
      id: uuidv4(),
      url: '',
      promptIndex: i,
      status: 'pending',
    })),
    outputDir,
    createdAt: new Date(),
  }
  activeJobs.set(job.id, job)
  return job
}

export function getJob(jobId: string): BatchJob | undefined {
  return activeJobs.get(jobId)
}

export async function generateBatch(
  jobId: string,
  referenceImageUrls: string | string[],
  prompts: string[],
  options: { resolution?: string; aspectRatio?: string; numImages?: number; outputFormat?: string; concurrency?: number } = {}
): Promise<void> {
  const job = activeJobs.get(jobId)
  if (!job) throw new Error('Job not found')

  job.status = 'in_progress'
  const concurrency = options.concurrency || 2
  const numImagesPerPrompt = options.numImages || 1
  const outputFormat = options.outputFormat || 'png'

  const generateOne = async (imageIndex: number): Promise<void> => {
    const image = job.images[imageIndex]
    if (!image) return

    const promptIndex = Math.floor(imageIndex / numImagesPerPrompt)
    const variantIndex = imageIndex % numImagesPerPrompt

    image.status = 'generating'

    try {
      const { urls } = await generateImage(referenceImageUrls, prompts[promptIndex], {
        resolution: options.resolution,
        aspectRatio: options.aspectRatio,
        numImages: 1,
        outputFormat,
      })

      const url = urls[0]
      image.url = url
      image.status = 'completed'

      const safeConcept = job.concept.toLowerCase().replace(/\.\./g, '').replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').slice(0, 50)
      const fileName = numImagesPerPrompt > 1
        ? `${safeConcept}_${String(promptIndex + 1).padStart(2, '0')}_v${variantIndex + 1}.${outputFormat}`
        : `${safeConcept}_${String(imageIndex + 1).padStart(2, '0')}.${outputFormat}`
      const localPath = path.join(job.outputDir, fileName)

      try {
        await downloadImage(url, localPath)
        image.localPath = localPath
        console.log(`[Batch] Saved: ${fileName}`)
      } catch (downloadErr) {
        console.error(`[Batch] Download failed for ${fileName}:`, downloadErr)
      }

      job.completedImages++
    } catch (err) {
      image.status = 'failed'
      image.error = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[Batch] Failed image ${imageIndex + 1}:`, err)
    }
  }

  const queue = [...Array(job.totalImages).keys()]
  const workers = Array.from({ length: Math.min(concurrency, job.totalImages) }, async () => {
    while (queue.length > 0) {
      const index = queue.shift()
      if (index !== undefined) {
        await generateOne(index)
      }
    }
  })

  await Promise.all(workers)

  job.status = job.images.every((img) => img.status === 'completed') ? 'completed' : 'failed'
}

export function formatPromptForFal(promptJson: Record<string, unknown>): string {
  const style = promptJson.style as string || ''
  const pose = promptJson.pose as Record<string, unknown> || {}
  const lighting = promptJson.lighting as Record<string, unknown> || {}
  const setDesign = promptJson.set_design as Record<string, unknown> || {}
  const outfit = promptJson.outfit as Record<string, unknown> || {}
  const hairstyle = promptJson.hairstyle as Record<string, unknown> || {}
  const makeup = promptJson.makeup as Record<string, unknown> || {}
  const effects = promptJson.effects as Record<string, unknown> || {}
  const camera = promptJson.camera as Record<string, unknown> || {}

  const parts = [
    style,
    `Pose: ${pose.framing || ''}, ${pose.body_position || ''}, ${(pose.expression as Record<string, unknown>)?.facial || ''}`,
    `Lighting: ${lighting.setup || ''}, ${lighting.mood || ''}`,
    `Background: ${setDesign.backdrop || ''}`,
    `Outfit: ${outfit.main || ''}, ${outfit.accessories || ''}`,
    `Hair: ${hairstyle.style || ''}`,
    `Makeup: ${makeup.style || ''}, ${makeup.eyes || ''}, ${makeup.lips || ''}`,
    `Camera: ${camera.lens || ''}, ${camera.angle || ''}`,
    `Effects: ${effects.color_grade || ''}, ${effects.grain || ''}`,
  ]

  return parts.filter(Boolean).join('. ').replace(/\s+/g, ' ').trim()
}
