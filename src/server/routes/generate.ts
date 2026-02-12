import fs from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import type { AuthRequest } from '../middleware/auth.js'
import { createBatchJob, formatPromptForFal, generateBatch, generateImage, getJob } from '../services/fal.js'
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
}

function _resolvePathInsideRoot(root: string, unsafePath: string): string | null {
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

  router.post('/img2img/transform', async (req: AuthRequest, res) => {
    let span: ReturnType<typeof createPipelineSpan> | null = null
    try {
      const {
        imageUrl,
        imageUrls,
        prompt,
        aspectRatio = '1:1',
        numberOfOutputs = 1,
        resolution = '1K',
        format = 'PNG',
      } = req.body

      // Validate format parameter (whitelist to prevent path traversal)
      const ALLOWED_FORMATS = ['PNG', 'JPG', 'JPEG', 'WEBP']
      if (!format || !ALLOWED_FORMATS.includes(format.toUpperCase())) {
        sendError(res, 400, `Invalid format. Allowed formats: ${ALLOWED_FORMATS.join(', ')}`, 'INVALID_IMG2IMG_PAYLOAD')
        return
      }

      // Validate numberOfOutputs (must be integer in range [1,4])
      const numOutputs = Number(numberOfOutputs)
      if (!Number.isInteger(numOutputs) || numOutputs < 1 || numOutputs > 4) {
        sendError(res, 400, 'numberOfOutputs must be an integer between 1 and 4', 'INVALID_IMG2IMG_PAYLOAD')
        return
      }

      // Support both single imageUrl and multiple imageUrls
      // Fix empty array fallback: check length explicitly
      const urls = imageUrls && imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : null

      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        sendError(res, 400, 'At least one image URL is required', 'INVALID_IMG2IMG_PAYLOAD')
        return
      }

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        sendError(res, 400, 'Valid prompt is required', 'INVALID_IMG2IMG_PAYLOAD')
        return
      }

      // Validate all URLs are strings
      if (!urls.every((url) => typeof url === 'string')) {
        sendError(res, 400, 'All image URLs must be strings', 'INVALID_IMG2IMG_PAYLOAD')
        return
      }

      // Security: Validate URLs are from safe paths only (uploads or outputs)
      // Prevent arbitrary file:// access
      for (const url of urls) {
        if (url.includes('..') || url.includes('~')) {
          sendError(res, 400, 'Invalid image URL: path traversal detected', 'INVALID_IMG2IMG_PAYLOAD')
          return
        }
        // Only allow /uploads/ or /outputs/ paths
        if (!url.startsWith('/uploads/') && !url.startsWith('/outputs/')) {
          sendError(res, 400, 'Invalid image URL: must be from /uploads/ or /outputs/', 'INVALID_IMG2IMG_PAYLOAD')
          return
        }
      }

      span = createPipelineSpan({
        pipeline: 'img2img.transform',
        userId: req.user?.id,
        metadata: {
          aspectRatio,
          numberOfOutputs: numOutputs,
          resolution,
          format,
          imageCount: urls.length,
        },
      })

      // Sanitized logging (avoid logging full prompts/URLs in production)
      console.log(`[Img2Img] Transforming ${urls.length} images`)
      console.log(`[Img2Img] Settings:`, { aspectRatio, numberOfOutputs: numOutputs, resolution, format })

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const outputDir = path.join(outputsDir, `img2img_${timestamp}`)
      await fs.mkdir(outputDir, { recursive: true })

      // Resolve all imageUrls to full paths (already validated to be safe paths)
      const fullImagePaths = urls.map((imageUrl: string) => {
        let fullImagePath: string
        if (imageUrl.startsWith('/uploads/')) {
          fullImagePath = path.join(uploadsDir, path.basename(imageUrl))
        } else if (imageUrl.startsWith('/outputs/')) {
          fullImagePath = path.join(outputsDir, path.basename(imageUrl))
        } else {
          // Should never reach here due to validation above
          throw new Error('Invalid image path')
        }
        return `file://${fullImagePath}`
      })

      // Normalize format: case-insensitive comparison
      const formatUpper = format.toUpperCase()
      const normalizedFormat = formatUpper === 'JPG' || formatUpper === 'JPEG' ? 'jpeg' : format.toLowerCase()

      // FAL API uses all image_urls together as context/reference for generation
      // num_images is the total number of output variations (max 4)
      console.log(`[Img2Img] Generating ${numOutputs} outputs using ${fullImagePaths.length} reference images`)

      const result = await generateImage(
        fullImagePaths, // All images as context
        prompt,
        {
          resolution,
          aspectRatio,
          numImages: numOutputs, // Already validated to be [1,4]
          outputFormat: normalizedFormat,
        },
      )

      console.log(`[Img2Img] Generation complete, got ${result.urls.length} outputs`)

      // Download images to local storage
      const images = await Promise.all(
        result.urls.map(async (url, index) => {
          const fileName = `img2img_${timestamp}_output${index + 1}.${normalizedFormat}`
          const localPath = path.join(outputDir, fileName)

          try {
            const response = await fetch(url)
            const buffer = await response.arrayBuffer()
            await fs.writeFile(localPath, Buffer.from(buffer))

            return {
              url,
              localPath: `/outputs/${path.relative(outputsDir, localPath)}`,
            }
          } catch (downloadErr) {
            console.error(`[Img2Img] Download failed for ${fileName}:`, downloadErr)
            return { url, localPath: undefined }
          }
        }),
      )

      span.success({ outputDir, imageCount: images.length })

      sendSuccess(res, { images })
    } catch (error) {
      // Sanitized error logging (avoid logging sensitive data in production)
      console.error('[Img2Img] Transform failed:', error instanceof Error ? error.message : 'Unknown error')
      if (process.env.NODE_ENV === 'development' && error instanceof Error) {
        console.error('[Img2Img] Stack:', error.stack)
      }
      span?.error(error)
      sendError(
        res,
        500,
        'Failed to transform image',
        'IMG2IMG_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  return router
}
