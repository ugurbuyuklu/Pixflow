import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import type { AuthRequest } from '../middleware/auth.js'
import { createBatchJob, formatPromptForFal, generateBatch, getJob } from '../services/fal.js'
import { createPipelineSpan, recordPipelineEvent } from '../services/telemetry.js'
import { analyzeImage } from '../services/vision.js'
import { sendError, sendSuccess } from '../utils/http.js'

const MAX_PROMPTS = 20

function sanitizeConcept(concept: string): string {
  return concept
    .replace(/\.\./g, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase()
    .slice(0, 50)
}

interface GenerateRouterConfig {
  projectRoot: string
  openFolder?: (folderPath: string) => Promise<void>
}

function resolvePathInsideRoot(root: string, unsafePath: string): string | null {
  if (unsafePath.includes('\0')) return null

  const resolvedRoot = path.resolve(root)
  const candidate = path.resolve(unsafePath)
  const relative = path.relative(resolvedRoot, candidate)

  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return candidate
  }

  return null
}

export function createGenerateRouter(config: GenerateRouterConfig): Router {
  const { projectRoot } = config
  const outputsDir = path.join(projectRoot, 'outputs')
  const uploadsDir = path.join(projectRoot, 'uploads')

  const router = Router()

  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      await fs.mkdir(uploadsDir, { recursive: true })
      cb(null, uploadsDir)
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

  router.post('/batch', upload.array('referenceImages', MAX_REFERENCE_IMAGES), async (req: AuthRequest, res) => {
    let span: ReturnType<typeof createPipelineSpan> | null = null
    try {
      const {
        concept,
        prompts: promptsJson,
        aspectRatio = '9:16',
        numImagesPerPrompt = '1',
        resolution = '1080p',
        outputFormat = 'png',
      } = req.body
      const files = req.files as Express.Multer.File[]

      if (!files || files.length === 0) {
        sendError(res, 400, 'At least one reference image is required', 'MISSING_REFERENCE_IMAGE')
        return
      }

      if (files.length > MAX_REFERENCE_IMAGES) {
        sendError(res, 400, `Maximum ${MAX_REFERENCE_IMAGES} reference images allowed`, 'TOO_MANY_REFERENCE_IMAGES')
        return
      }

      if (!concept || !promptsJson) {
        sendError(res, 400, 'Concept and prompts are required', 'INVALID_BATCH_PAYLOAD')
        return
      }

      let prompts: Record<string, unknown>[]
      try {
        prompts = JSON.parse(promptsJson)
      } catch {
        sendError(res, 400, 'Invalid prompts JSON', 'INVALID_PROMPTS_JSON')
        return
      }

      if (!Array.isArray(prompts) || prompts.length === 0) {
        sendError(res, 400, 'Prompts must be a non-empty array', 'INVALID_PROMPTS')
        return
      }

      if (prompts.length > MAX_PROMPTS) {
        sendError(res, 400, `Maximum ${MAX_PROMPTS} prompts allowed per batch`, 'TOO_MANY_PROMPTS')
        return
      }

      const numImages = Math.min(4, Math.max(1, parseInt(numImagesPerPrompt, 10) || 1))
      const totalImages = prompts.length * numImages
      span = createPipelineSpan({
        pipeline: 'generate.batch.start',
        userId: req.user?.id,
        metadata: {
          promptCount: prompts.length,
          totalImages,
          referenceImageCount: files.length,
          aspectRatio,
          resolution,
          outputFormat,
        },
      })

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const safeConcept = sanitizeConcept(concept)
      const outputDir = path.join(outputsDir, `${safeConcept}_${timestamp}`)
      await fs.mkdir(outputDir, { recursive: true })

      const job = createBatchJob(concept, totalImages, outputDir, req.user?.id)
      job.prompts = prompts

      const referenceImageUrls = files.map((file) => `file://${file.path}`)
      const textPrompts = prompts.map((p) => formatPromptForFal(p))

      console.log(
        `[Batch] Starting with ${files.length} reference image(s), ${aspectRatio}, ${resolution}, ${numImages} images/prompt`,
      )

      generateBatch(job.id, referenceImageUrls, textPrompts, {
        resolution,
        aspectRatio,
        numImages,
        outputFormat,
        concurrency: 10,
      }).catch((err) => {
        console.error('[Batch] Generation failed:', err)
        void recordPipelineEvent({
          pipeline: 'generate.batch.async',
          status: 'error',
          userId: req.user?.id,
          metadata: { jobId: job.id },
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      })

      span.success({ jobId: job.id, outputDir: job.outputDir })

      sendSuccess(res, {
        jobId: job.id,
        status: job.status,
        totalImages: job.totalImages,
        outputDir: job.outputDir,
        referenceImageCount: files.length,
        message: 'Batch generation started',
      })
    } catch (error) {
      console.error('[Batch] Error:', error)
      span?.error(error)
      sendError(
        res,
        500,
        'Failed to start batch generation',
        'BATCH_START_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  router.get('/progress/:jobId', (req: AuthRequest, res) => {
    const { jobId } = req.params
    const job = getJob(jobId)

    if (!job) {
      sendError(res, 404, 'Job not found', 'JOB_NOT_FOUND')
      return
    }

    if (job.userId && job.userId !== req.user?.id) {
      sendError(res, 404, 'Job not found', 'JOB_NOT_FOUND')
      return
    }

    sendSuccess(res, {
      jobId: job.id,
      status: job.status,
      progress: Math.round((job.completedImages / job.totalImages) * 100),
      totalImages: job.totalImages,
      completedImages: job.completedImages,
      outputDir: job.outputDir,
      images: job.images.map((img) => ({
        index: img.promptIndex,
        status: img.status,
        url: img.localPath ? `/outputs/${path.relative(outputsDir, img.localPath)}` : img.url || undefined,
        localPath: img.localPath || undefined,
        error: img.error || undefined,
      })),
    })
  })

  router.post('/upload-reference', upload.single('image'), async (req, res) => {
    try {
      const file = req.file
      if (!file) {
        sendError(res, 400, 'Image is required', 'MISSING_IMAGE')
        return
      }
      sendSuccess(res, {
        path: `/uploads/${file.filename}`,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
      })
    } catch (error) {
      sendError(
        res,
        500,
        'Failed to upload image',
        'UPLOAD_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  router.post('/analyze-image', upload.single('image'), async (req, res) => {
    try {
      const file = req.file
      if (!file) {
        sendError(res, 400, 'Image is required', 'MISSING_IMAGE')
        return
      }

      const theme = req.body.theme // Extract optional theme from FormData

      console.log(`[Vision] Analyzing image: ${file.filename}${theme ? ` with theme: "${theme}"` : ''}`)
      const prompt = await analyzeImage(file.path, theme)
      console.log(`[Vision] Analysis complete`)

      sendSuccess(res, {
        prompt,
        sourceImage: {
          path: file.path,
          filename: file.filename,
          size: file.size,
        },
      })
    } catch (error) {
      console.error('[Vision] Error:', error)
      sendError(
        res,
        500,
        'Failed to analyze image',
        'IMAGE_ANALYSIS_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  router.post('/open-folder', async (req, res) => {
    const { folderPath } = req.body

    if (!folderPath || typeof folderPath !== 'string') {
      sendError(res, 400, 'Folder path is required', 'MISSING_FOLDER_PATH')
      return
    }

    const resolvedPath = resolvePathInsideRoot(projectRoot, folderPath)
    if (!resolvedPath) {
      sendError(res, 403, 'Access denied: path outside project directory', 'FORBIDDEN_PATH')
      return
    }

    try {
      await fs.access(resolvedPath)
    } catch {
      sendError(res, 404, 'Folder not found', 'FOLDER_NOT_FOUND')
      return
    }

    if (config.openFolder) {
      try {
        await config.openFolder(resolvedPath)
        sendSuccess(res, { path: resolvedPath })
      } catch {
        sendError(res, 500, 'Failed to open folder', 'OPEN_FOLDER_FAILED')
      }
    } else {
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
      execFile(command, [resolvedPath], (err) => {
        if (err) {
          sendError(res, 500, 'Failed to open folder', 'OPEN_FOLDER_FAILED')
          return
        }
        sendSuccess(res, { path: resolvedPath })
      })
    }
  })

  return router
}
