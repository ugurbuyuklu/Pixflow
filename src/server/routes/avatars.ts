import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import rateLimit from 'express-rate-limit'
import { generateAvatar, generateAvatarFromReference } from '../services/avatar.js'
import { generateVoiceoverScript, refineScript } from '../services/voiceover.js'
import { textToSpeech, listVoices, getAvailableModels } from '../services/tts.js'
import { createHedraVideo, downloadHedraVideo } from '../services/hedra.js'
import { generateKlingVideo, downloadKlingVideo } from '../services/kling.js'
import { notify } from '../services/notifications.js'
import type { AuthRequest } from '../middleware/auth.js'
import { sendError, sendSuccess } from '../utils/http.js'
import { createPipelineSpan } from '../services/telemetry.js'

interface AvatarsRouterConfig {
  projectRoot: string
}

const avatarLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many requests, please try again later', 'RATE_LIMITED')
  },
})

const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many generation requests, please wait before trying again', 'RATE_LIMITED')
  },
})

const MAX_PROMPT_LENGTH = 2000
const MAX_TEXT_LENGTH = 5000
const VALID_ASPECT_RATIOS = ['1:1', '9:16', '16:9']
const VALID_TONES = ['casual', 'professional', 'energetic', 'friendly', 'dramatic']

function sanitizePath(basePath: string, userPath: string): string | null {
  const normalizedBase = path.resolve(basePath)
  const resolved = path.resolve(basePath, userPath)
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    return null
  }
  return resolved
}

export function createAvatarsRouter(config: AvatarsRouterConfig): express.Router {
  const { projectRoot } = config
  const outputsDir = path.join(projectRoot, 'outputs')
  const avatarsDir = path.join(projectRoot, 'avatars')
  const uploadsDir = path.join(projectRoot, 'uploads')

  const router = express.Router()

  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      await fs.mkdir(uploadsDir, { recursive: true })
      cb(null, uploadsDir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `avatar_ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)
    },
  })

  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        cb(null, true)
      } else {
        cb(new Error('Invalid file type'))
      }
    },
  })

  const avatarUploadStorage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      await fs.mkdir(avatarsDir, { recursive: true })
      cb(null, avatarsDir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)
    },
  })

  const avatarUpload = multer({
    storage: avatarUploadStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        cb(null, true)
      } else {
        cb(new Error('Invalid file type. Only JPG, PNG, and WebP are allowed.'))
      }
    },
  })

  router.post('/upload', avatarLimiter, avatarUpload.array('files', 10), (req, res) => {
    const files = req.files as Express.Multer.File[]
    if (!files || files.length === 0) {
      sendError(res, 400, 'No files uploaded', 'NO_FILES_UPLOADED')
      return
    }
    const uploaded = files.map(f => ({
      name: f.filename,
      filename: f.filename,
      url: `/avatars/${encodeURIComponent(f.filename)}`,
    }))
    console.log(`[Avatar] Uploaded ${files.length} file(s) to gallery`)
    sendSuccess(res, { avatars: uploaded })
  })

  router.post('/generate', generationLimiter, async (req, res) => {
    try {
      const { prompt, aspectRatio } = req.body
      if (!prompt || typeof prompt !== 'string') {
        sendError(res, 400, 'Prompt is required', 'INVALID_PROMPT')
        return
      }
      if (prompt.length > MAX_PROMPT_LENGTH) {
        sendError(res, 400, `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)`, 'PROMPT_TOO_LONG')
        return
      }
      if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
        sendError(res, 400, 'Invalid aspect ratio', 'INVALID_ASPECT_RATIO')
        return
      }

      console.log('[Avatar] Generating avatar with prompt...')
      const result = await generateAvatar(prompt, { aspectRatio })

      const fileName = `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
      const localPath = path.join(avatarsDir, fileName)
      const response = await fetch(result.imageUrl)
      if (!response.ok) throw new Error(`Failed to download generated avatar: ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      await fs.mkdir(avatarsDir, { recursive: true })
      await fs.writeFile(localPath, buffer)
      console.log(`[Avatar] Saved to ${localPath}`)

      sendSuccess(res, {
        imageUrl: result.imageUrl,
        localPath: `/avatars/${fileName}`,
        requestId: result.requestId,
      })
    } catch (error) {
      console.error('[Avatar] Generation failed:', error)
      sendError(res, 500, 'Failed to generate avatar', 'AVATAR_GENERATION_FAILED')
    }
  })

  router.post('/generate-from-reference', generationLimiter, upload.single('referenceImage'), async (req, res) => {
    const file = req.file
    try {
      const { prompt, aspectRatio } = req.body
      if (!file) { sendError(res, 400, 'Reference image is required', 'MISSING_REFERENCE_IMAGE'); return }
      if (!prompt || typeof prompt !== 'string') { sendError(res, 400, 'Prompt is required', 'INVALID_PROMPT'); return }
      if (prompt.length > MAX_PROMPT_LENGTH) { sendError(res, 400, `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)`, 'PROMPT_TOO_LONG'); return }
      if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) { sendError(res, 400, 'Invalid aspect ratio', 'INVALID_ASPECT_RATIO'); return }

      const imageBuffer = await fs.readFile(file.path)
      const dataUrl = `data:${file.mimetype};base64,${imageBuffer.toString('base64')}`

      console.log('[Avatar] Generating avatar from reference...')
      const result = await generateAvatarFromReference(dataUrl, prompt, { aspectRatio })

      const fileName = `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
      const localPath = path.join(avatarsDir, fileName)
      const response = await fetch(result.imageUrl)
      if (!response.ok) throw new Error(`Failed to download generated avatar: ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      await fs.mkdir(avatarsDir, { recursive: true })
      await fs.writeFile(localPath, buffer)
      console.log(`[Avatar] Saved to ${localPath}`)

      sendSuccess(res, {
        imageUrl: result.imageUrl,
        localPath: `/avatars/${fileName}`,
        requestId: result.requestId,
      })
    } catch (error) {
      console.error('[Avatar] Generation from reference failed:', error)
      sendError(res, 500, 'Failed to generate avatar from reference', 'AVATAR_REFERENCE_GENERATION_FAILED')
    } finally {
      if (file) await fs.unlink(file.path).catch(() => {})
    }
  })

  router.post('/script', avatarLimiter, async (req, res) => {
    let span: ReturnType<typeof createPipelineSpan> | null = null
    try {
      const { concept, duration, examples, tone } = req.body
      if (!concept || typeof concept !== 'string') { sendError(res, 400, 'Concept is required', 'INVALID_CONCEPT'); return }
      if (concept.length > 500) { sendError(res, 400, 'Concept too long (max 500 characters)', 'CONCEPT_TOO_LONG'); return }
      if (!duration || typeof duration !== 'number' || duration < 5 || duration > 120) { sendError(res, 400, 'Duration must be between 5 and 120 seconds', 'INVALID_DURATION'); return }
      if (tone && !VALID_TONES.includes(tone)) { sendError(res, 400, 'Invalid tone', 'INVALID_TONE'); return }
      if (examples && (!Array.isArray(examples) || examples.length > 5)) { sendError(res, 400, 'Examples must be an array with max 5 items', 'INVALID_EXAMPLES'); return }
      span = createPipelineSpan({
        pipeline: 'avatars.script',
        metadata: { conceptLength: concept.length, duration, tone: tone || 'default' },
      })

      console.log(`[Script] Generating ${duration}s script for "${concept}"...`)
      const result = await generateVoiceoverScript({ concept, duration, examples, tone })
      if (!result.script || result.wordCount === 0) throw new Error('Script generation returned empty result')
      console.log(`[Script] Generated ${result.wordCount} words (~${result.estimatedDuration}s)`)
      span.success({ wordCount: result.wordCount, estimatedDuration: result.estimatedDuration })
      sendSuccess(res, { ...result })
    } catch (error) {
      console.error('[Script] Generation failed:', error)
      span?.error(error)
      sendError(res, 500, 'Failed to generate script', 'SCRIPT_GENERATION_FAILED')
    }
  })

  router.post('/script/refine', avatarLimiter, async (req, res) => {
    try {
      const { script, feedback, duration } = req.body
      if (!script || typeof script !== 'string') { sendError(res, 400, 'Script is required', 'INVALID_SCRIPT'); return }
      if (!feedback || typeof feedback !== 'string') { sendError(res, 400, 'Feedback is required', 'INVALID_FEEDBACK'); return }
      if (script.length > MAX_TEXT_LENGTH || feedback.length > 1000) { sendError(res, 400, 'Input too long', 'INPUT_TOO_LONG'); return }

      console.log('[Script] Refining script...')
      const result = await refineScript(script, feedback, duration || 30)
      sendSuccess(res, { ...result })
    } catch (error) {
      console.error('[Script] Refinement failed:', error)
      sendError(res, 500, 'Failed to refine script', 'SCRIPT_REFINEMENT_FAILED')
    }
  })

  router.get('/voices', avatarLimiter, async (_req, res) => {
    try {
      const voices = await listVoices()
      sendSuccess(res, { voices })
    } catch (error) {
      console.error('[TTS] Failed to list voices:', error)
      sendError(res, 500, 'Failed to list voices', 'VOICE_LIST_FAILED')
    }
  })

  router.get('/tts/models', (_req, res) => {
    sendSuccess(res, { models: getAvailableModels() })
  })

  router.post('/tts', generationLimiter, async (req, res) => {
    let span: ReturnType<typeof createPipelineSpan> | null = null
    try {
      const { text, voiceId, modelId } = req.body
      if (!text || typeof text !== 'string') { sendError(res, 400, 'Text is required', 'INVALID_TEXT'); return }
      if (text.length > MAX_TEXT_LENGTH) { sendError(res, 400, `Text too long (max ${MAX_TEXT_LENGTH} characters)`, 'TEXT_TOO_LONG'); return }
      if (!voiceId || typeof voiceId !== 'string') { sendError(res, 400, 'Voice ID is required', 'INVALID_VOICE_ID'); return }
      if (voiceId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(voiceId)) { sendError(res, 400, 'Invalid voice ID format', 'INVALID_VOICE_ID'); return }
      span = createPipelineSpan({
        pipeline: 'avatars.tts',
        metadata: { textLength: text.length, voiceId, modelId: modelId || 'default' },
      })

      await fs.mkdir(outputsDir, { recursive: true })
      const outputPath = path.join(outputsDir, `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`)

      console.log(`[TTS] Converting ${text.length} characters to speech...`)
      const result = await textToSpeech({ text, voiceId, outputPath, modelId })
      console.log(`[TTS] Saved to ${result.audioPath}`)
      span.success({ audioFile: path.basename(result.audioPath) })

      sendSuccess(res, {
        audioPath: result.audioPath,
        audioUrl: `/outputs/${path.basename(result.audioPath)}`,
      })
    } catch (error) {
      console.error('[TTS] Conversion failed:', error)
      span?.error(error)
      sendError(res, 500, 'Failed to convert text to speech', 'TTS_FAILED')
    }
  })

  router.post('/lipsync', generationLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(660_000)
    res.setTimeout(660_000)
    let span: ReturnType<typeof createPipelineSpan> | null = null

    try {
      const { imageUrl, audioUrl } = req.body
      if (!imageUrl) { sendError(res, 400, 'Image URL is required', 'MISSING_IMAGE_URL'); return }
      if (!audioUrl) { sendError(res, 400, 'Audio URL is required', 'MISSING_AUDIO_URL'); return }
      span = createPipelineSpan({
        pipeline: 'avatars.lipsync',
        userId: req.user?.id,
        metadata: { imageUrl, audioUrl },
      })

      let imagePath: string | null = null
      let audioPath: string | null = null

      if (imageUrl.startsWith('/avatars/')) {
        imagePath = sanitizePath(avatarsDir, path.basename(decodeURIComponent(imageUrl)))
      } else if (imageUrl.startsWith('/outputs/')) {
        imagePath = sanitizePath(outputsDir, path.basename(decodeURIComponent(imageUrl)))
      }

      if (audioUrl.startsWith('/outputs/')) {
        audioPath = sanitizePath(outputsDir, path.basename(decodeURIComponent(audioUrl)))
      }

      if (!imagePath) { sendError(res, 400, 'Invalid image path — must be a local avatar or output', 'INVALID_IMAGE_PATH'); return }
      if (!audioPath) { sendError(res, 400, 'Invalid audio path — must be a local output', 'INVALID_AUDIO_PATH'); return }

      try { await fs.access(imagePath) } catch {
        sendError(res, 400, `Image file not found: ${path.basename(imagePath)}`, 'IMAGE_NOT_FOUND')
        return
      }
      try { await fs.access(audioPath) } catch {
        sendError(res, 400, `Audio file not found: ${path.basename(audioPath)}`, 'AUDIO_NOT_FOUND')
        return
      }

      console.log('[Lipsync] Creating video with Hedra Character-3...')
      const result = await createHedraVideo({ imagePath, audioPath, aspectRatio: '9:16' })

      await fs.mkdir(outputsDir, { recursive: true })
      const outputFilename = `lipsync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
      await downloadHedraVideo(result.videoUrl, path.join(outputsDir, outputFilename))

      if (req.user?.id) notify(req.user.id, 'lipsync_complete', 'Lipsync Video Ready', 'Your talking avatar video is ready to download')
      span.success({ outputFile: outputFilename, generationId: result.generationId })

      sendSuccess(res, {
        videoUrl: result.videoUrl,
        localPath: `/outputs/${outputFilename}`,
        generationId: result.generationId,
      })
    } catch (error) {
      console.error('[Lipsync] Generation failed:', error)
      span?.error(error)
      sendError(res, 500, 'Failed to create lipsync video', 'LIPSYNC_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  router.post('/i2v', generationLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(300_000)
    res.setTimeout(300_000)
    let span: ReturnType<typeof createPipelineSpan> | null = null

    try {
      const { imageUrl, prompt, duration, aspectRatio } = req.body
      if (!imageUrl || typeof imageUrl !== 'string') { sendError(res, 400, 'Image URL is required', 'MISSING_IMAGE_URL'); return }
      if (!prompt || typeof prompt !== 'string') { sendError(res, 400, 'Prompt is required', 'INVALID_PROMPT'); return }
      if (prompt.length > MAX_PROMPT_LENGTH) { sendError(res, 400, `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)`, 'PROMPT_TOO_LONG'); return }
      if (duration && !['5', '10'].includes(String(duration))) { sendError(res, 400, 'Duration must be 5 or 10', 'INVALID_DURATION'); return }
      if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) { sendError(res, 400, 'Invalid aspect ratio', 'INVALID_ASPECT_RATIO'); return }
      span = createPipelineSpan({
        pipeline: 'avatars.i2v',
        userId: req.user?.id,
        metadata: { imageUrl, duration: String(duration || '5'), aspectRatio: aspectRatio || '9:16' },
      })

      let imagePath: string | null = null
      if (imageUrl.startsWith('/avatars/')) {
        imagePath = sanitizePath(avatarsDir, path.basename(decodeURIComponent(imageUrl)))
      } else if (imageUrl.startsWith('/outputs/')) {
        imagePath = sanitizePath(outputsDir, path.basename(decodeURIComponent(imageUrl)))
      }
      if (!imagePath) { sendError(res, 400, 'Invalid image path — must be a local avatar or output', 'INVALID_IMAGE_PATH'); return }

      try { await fs.access(imagePath) } catch {
        sendError(res, 400, `Image file not found: ${path.basename(imagePath)}`, 'IMAGE_NOT_FOUND')
        return
      }

      console.log(`[I2V] Generating video with Kling AI from ${path.basename(imagePath)}...`)
      const result = await generateKlingVideo({
        imagePath,
        prompt,
        duration: String(duration || '5') as '5' | '10',
        aspectRatio: aspectRatio || '9:16',
      })

      await fs.mkdir(outputsDir, { recursive: true })
      const outputFilename = `i2v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
      await downloadKlingVideo(result.videoUrl, path.join(outputsDir, outputFilename))

      if (req.user?.id) notify(req.user.id, 'i2v_complete', 'Video Ready', 'Your image-to-video is ready to download')
      span.success({ outputFile: outputFilename, requestId: result.requestId })

      sendSuccess(res, {
        videoUrl: result.videoUrl,
        localPath: `/outputs/${outputFilename}`,
        requestId: result.requestId,
      })
    } catch (error) {
      console.error('[I2V] Generation failed:', error)
      span?.error(error)
      sendError(res, 500, 'Failed to generate video', 'I2V_FAILED', error instanceof Error ? error.message : 'Unknown error')
    }
  })

  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return

    if (error instanceof multer.MulterError) {
      const code = error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_FAILED'
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'File too large (max 10MB)'
        : error.message || 'Upload failed'
      sendError(res, 400, message, code)
      return
    }

    if (error instanceof Error) {
      sendError(res, 400, error.message || 'Request failed', 'REQUEST_FAILED')
      return
    }

    sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR')
  })

  return router
}
