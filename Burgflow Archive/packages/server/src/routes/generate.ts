import { Router } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'
import { execFile } from 'child_process'
import {
  createBatchJob,
  generateBatch,
  getJob,
  formatPromptForFal,
  type BatchJob,
} from '../services/fal.js'
import { analyzeImage } from '../services/vision.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../../../../')

const MAX_PROMPTS = 20

function sanitizeConcept(concept: string): string {
  return concept
    .replace(/\.\./g, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase()
    .slice(0, 50)
}

const router = Router()

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const uploadDir = path.resolve(process.cwd(), 'uploads')
    await fs.mkdir(uploadDir, { recursive: true })
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${uuidv4()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP allowed.'))
    }
  },
})

const MAX_REFERENCE_IMAGES = 4

router.post('/batch', upload.array('referenceImages', MAX_REFERENCE_IMAGES), async (req, res) => {
  try {
    const {
      concept,
      prompts: promptsJson,
      aspectRatio = '9:16',
      numImagesPerPrompt = '1',
      resolution = '1080p',
      outputFormat = 'png'
    } = req.body
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'At least one reference image is required' })
      return
    }

    if (files.length > MAX_REFERENCE_IMAGES) {
      res.status(400).json({ error: `Maximum ${MAX_REFERENCE_IMAGES} reference images allowed` })
      return
    }

    if (!concept || !promptsJson) {
      res.status(400).json({ error: 'Concept and prompts are required' })
      return
    }

    let prompts: Record<string, unknown>[]
    try {
      prompts = JSON.parse(promptsJson)
    } catch {
      res.status(400).json({ error: 'Invalid prompts JSON' })
      return
    }

    if (!Array.isArray(prompts) || prompts.length === 0) {
      res.status(400).json({ error: 'Prompts must be a non-empty array' })
      return
    }

    if (prompts.length > MAX_PROMPTS) {
      res.status(400).json({ error: `Maximum ${MAX_PROMPTS} prompts allowed per batch` })
      return
    }

    const numImages = Math.min(4, Math.max(1, parseInt(numImagesPerPrompt, 10) || 1))
    const totalImages = prompts.length * numImages

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const safeConcept = sanitizeConcept(concept)
    const outputDir = path.resolve(
      PROJECT_ROOT,
      'outputs',
      `${safeConcept}_${timestamp}`
    )
    await fs.mkdir(outputDir, { recursive: true })

    const job = createBatchJob(concept, totalImages, outputDir)

    const referenceImageUrls = files.map((file) => `file://${file.path}`)
    const textPrompts = prompts.map((p) => formatPromptForFal(p))

    console.log(`[Batch] Starting with ${files.length} reference image(s), ${aspectRatio}, ${resolution}, ${numImages} images/prompt`)

    generateBatch(job.id, referenceImageUrls, textPrompts, {
      resolution,
      aspectRatio,
      numImages,
      outputFormat,
      concurrency: 4,
    }).catch((err) => {
      console.error('[Batch] Generation failed:', err)
    })

    res.json({
      jobId: job.id,
      status: job.status,
      totalImages: job.totalImages,
      outputDir: job.outputDir,
      referenceImageCount: files.length,
      message: 'Batch generation started',
    })
  } catch (error) {
    console.error('[Batch] Error:', error)
    res.status(500).json({
      error: 'Failed to start batch generation',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params
  const job = getJob(jobId)

  if (!job) {
    res.status(404).json({ error: 'Job not found' })
    return
  }

  const response: {
    jobId: string
    status: string
    progress: number
    totalImages: number
    completedImages: number
    outputDir: string
    images: Array<{
      index: number
      status: string
      url?: string
      localPath?: string
      error?: string
    }>
  } = {
    jobId: job.id,
    status: job.status,
    progress: Math.round((job.completedImages / job.totalImages) * 100),
    totalImages: job.totalImages,
    completedImages: job.completedImages,
    outputDir: job.outputDir,
    images: job.images.map((img) => ({
      index: img.promptIndex,
      status: img.status,
      url: img.url || undefined,
      localPath: img.localPath || undefined,
      error: img.error || undefined,
    })),
  }

  res.json(response)
})

router.post('/upload-reference', upload.single('image'), async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'Image is required' })
      return
    }

    res.json({
      path: file.path,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to upload image',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.post('/analyze-image', upload.single('image'), async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'Image is required' })
      return
    }

    console.log(`[Vision] Analyzing image: ${file.filename}`)
    const prompt = await analyzeImage(file.path)
    console.log(`[Vision] Analysis complete`)

    res.json({
      prompt,
      sourceImage: {
        path: file.path,
        filename: file.filename,
        size: file.size,
      },
    })
  } catch (error) {
    console.error('[Vision] Error:', error)
    res.status(500).json({
      error: 'Failed to analyze image',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.post('/open-folder', async (req, res) => {
  const { folderPath } = req.body

  if (!folderPath || typeof folderPath !== 'string') {
    res.status(400).json({ error: 'Folder path is required' })
    return
  }

  const normalizedPath = path.normalize(folderPath)
  if (!normalizedPath.startsWith(PROJECT_ROOT)) {
    res.status(403).json({ error: 'Access denied: path outside project directory' })
    return
  }

  try {
    await fs.access(normalizedPath)
  } catch {
    res.status(404).json({ error: 'Folder not found' })
    return
  }

  const platform = process.platform
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer' : 'xdg-open'

  execFile(command, [normalizedPath], (err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to open folder' })
      return
    }
    res.json({ success: true, path: normalizedPath })
  })
})

export default router
