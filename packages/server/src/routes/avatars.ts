import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import { generateAvatar, generateAvatarFromReference } from '../services/avatar.js'
import { generateVoiceoverScript, refineScript } from '../services/voiceover.js'
import { textToSpeech, listVoices, getAvailableModels } from '../services/tts.js'
import {
  createLipsyncVideo,
  checkLipsyncStatus,
  downloadVideo,
  listHedraVoices,
} from '../services/lipsync.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../../../..')
const OUTPUTS_DIR = path.join(PROJECT_ROOT, 'outputs')
const AVATARS_DIR = path.join(PROJECT_ROOT, 'avatars')

const router = express.Router()

// Rate limiting for avatar endpoints (expensive AI operations)
const avatarLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Stricter rate limit for generation endpoints
const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many generation requests, please wait before trying again' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Validation helpers
const MAX_PROMPT_LENGTH = 2000
const MAX_TEXT_LENGTH = 5000
const VALID_ASPECT_RATIOS = ['1:1', '9:16', '16:9']
const VALID_RESOLUTIONS = ['540p', '720p']
const VALID_TONES = ['casual', 'professional', 'energetic', 'friendly', 'dramatic']
const JOB_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

function sanitizePath(basePath: string, userPath: string): string | null {
  const normalizedBase = path.resolve(basePath)
  const resolved = path.resolve(basePath, userPath)
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    return null
  }
  return resolved
}

function validateJobId(jobId: string): boolean {
  return JOB_ID_PATTERN.test(jobId) && jobId.length > 0 && jobId.length <= 100
}

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const uploadDir = path.join(PROJECT_ROOT, 'uploads')
    await fs.mkdir(uploadDir, { recursive: true })
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const safeName = `avatar_ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
    cb(null, safeName)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type'))
    }
  },
})

/**
 * POST /api/avatars/generate
 * Generate a new avatar image using fal.ai
 */
router.post('/generate', generationLimiter, async (req, res) => {
  try {
    const { prompt, aspectRatio } = req.body

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required' })
      return
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)` })
      return
    }

    if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
      res.status(400).json({ error: 'Invalid aspect ratio' })
      return
    }

    console.log('[Avatar] Generating avatar with prompt...')
    const result = await generateAvatar(prompt, { aspectRatio })

    const fileName = `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
    const localPath = path.join(AVATARS_DIR, fileName)

    const response = await fetch(result.imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to download generated avatar: ${response.status}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await fs.mkdir(AVATARS_DIR, { recursive: true })
    await fs.writeFile(localPath, buffer)

    console.log(`[Avatar] Saved to ${localPath}`)

    res.json({
      success: true,
      imageUrl: result.imageUrl,
      localPath: `/avatars/${fileName}`,
      requestId: result.requestId,
    })
  } catch (error) {
    console.error('[Avatar] Generation failed:', error)
    res.status(500).json({
      error: 'Failed to generate avatar',
    })
  }
})

/**
 * POST /api/avatars/generate-from-reference
 * Generate avatar from reference image
 */
router.post('/generate-from-reference', generationLimiter, upload.single('referenceImage'), async (req, res) => {
  const file = req.file
  try {
    const { prompt, aspectRatio } = req.body

    if (!file) {
      res.status(400).json({ error: 'Reference image is required' })
      return
    }

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Prompt is required' })
      return
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)` })
      return
    }

    if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
      res.status(400).json({ error: 'Invalid aspect ratio' })
      return
    }

    const imageBuffer = await fs.readFile(file.path)
    const base64 = imageBuffer.toString('base64')
    const mimeType = file.mimetype
    const dataUrl = `data:${mimeType};base64,${base64}`

    console.log('[Avatar] Generating avatar from reference...')
    const result = await generateAvatarFromReference(dataUrl, prompt, { aspectRatio })

    const fileName = `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
    const localPath = path.join(AVATARS_DIR, fileName)

    const response = await fetch(result.imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to download generated avatar: ${response.status}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await fs.mkdir(AVATARS_DIR, { recursive: true })
    await fs.writeFile(localPath, buffer)

    console.log(`[Avatar] Saved to ${localPath}`)

    res.json({
      success: true,
      imageUrl: result.imageUrl,
      localPath: `/avatars/${fileName}`,
      requestId: result.requestId,
    })
  } catch (error) {
    console.error('[Avatar] Generation from reference failed:', error)
    res.status(500).json({
      error: 'Failed to generate avatar from reference',
    })
  } finally {
    if (file) {
      await fs.unlink(file.path).catch(() => {})
    }
  }
})

/**
 * POST /api/avatars/script
 * Generate voiceover script using GPT-4o
 */
router.post('/script', avatarLimiter, async (req, res) => {
  try {
    const { concept, duration, examples, tone } = req.body

    if (!concept || typeof concept !== 'string') {
      res.status(400).json({ error: 'Concept is required' })
      return
    }

    if (concept.length > 500) {
      res.status(400).json({ error: 'Concept too long (max 500 characters)' })
      return
    }

    if (!duration || typeof duration !== 'number' || duration < 5 || duration > 120) {
      res.status(400).json({ error: 'Duration must be between 5 and 120 seconds' })
      return
    }

    if (tone && !VALID_TONES.includes(tone)) {
      res.status(400).json({ error: 'Invalid tone' })
      return
    }

    if (examples && (!Array.isArray(examples) || examples.length > 5)) {
      res.status(400).json({ error: 'Examples must be an array with max 5 items' })
      return
    }

    console.log(`[Script] Generating ${duration}s script for "${concept}"...`)
    const result = await generateVoiceoverScript({
      concept,
      duration,
      examples,
      tone,
    })

    if (!result.script || result.wordCount === 0) {
      throw new Error('Script generation returned empty result')
    }

    console.log(`[Script] Generated ${result.wordCount} words (~${result.estimatedDuration}s)`)

    res.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('[Script] Generation failed:', error)
    res.status(500).json({
      error: 'Failed to generate script',
    })
  }
})

/**
 * POST /api/avatars/script/refine
 * Refine an existing script based on feedback
 */
router.post('/script/refine', avatarLimiter, async (req, res) => {
  try {
    const { script, feedback, duration } = req.body

    if (!script || typeof script !== 'string') {
      res.status(400).json({ error: 'Script is required' })
      return
    }

    if (!feedback || typeof feedback !== 'string') {
      res.status(400).json({ error: 'Feedback is required' })
      return
    }

    if (script.length > MAX_TEXT_LENGTH || feedback.length > 1000) {
      res.status(400).json({ error: 'Input too long' })
      return
    }

    console.log('[Script] Refining script...')
    const result = await refineScript(script, feedback, duration || 30)

    res.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error('[Script] Refinement failed:', error)
    res.status(500).json({
      error: 'Failed to refine script',
    })
  }
})

/**
 * GET /api/avatars/voices
 * List available ElevenLabs voices
 */
router.get('/voices', avatarLimiter, async (_req, res) => {
  try {
    const voices = await listVoices()
    res.json({
      success: true,
      voices,
    })
  } catch (error) {
    console.error('[TTS] Failed to list voices:', error)
    res.status(500).json({
      error: 'Failed to list voices',
    })
  }
})

/**
 * GET /api/avatars/voices/hedra
 * List available Hedra voices for built-in TTS
 */
router.get('/voices/hedra', avatarLimiter, async (_req, res) => {
  try {
    const voices = await listHedraVoices()
    res.json({
      success: true,
      voices,
    })
  } catch (error) {
    console.error('[Hedra] Failed to list voices:', error)
    res.status(500).json({
      error: 'Failed to list Hedra voices',
    })
  }
})

/**
 * GET /api/avatars/tts/models
 * List available TTS models
 */
router.get('/tts/models', (_req, res) => {
  const models = getAvailableModels()
  res.json({
    success: true,
    models,
  })
})

/**
 * POST /api/avatars/tts
 * Convert text to speech using ElevenLabs
 */
router.post('/tts', generationLimiter, async (req, res) => {
  try {
    const { text, voiceId, modelId } = req.body

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Text is required' })
      return
    }

    if (text.length > MAX_TEXT_LENGTH) {
      res.status(400).json({ error: `Text too long (max ${MAX_TEXT_LENGTH} characters)` })
      return
    }

    if (!voiceId || typeof voiceId !== 'string') {
      res.status(400).json({ error: 'Voice ID is required' })
      return
    }

    if (voiceId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(voiceId)) {
      res.status(400).json({ error: 'Invalid voice ID format' })
      return
    }

    await fs.mkdir(OUTPUTS_DIR, { recursive: true })
    const outputPath = path.join(OUTPUTS_DIR, `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`)

    console.log(`[TTS] Converting ${text.length} characters to speech...`)
    const result = await textToSpeech({
      text,
      voiceId,
      outputPath,
      modelId,
    })

    console.log(`[TTS] Saved to ${result.audioPath}`)

    const relativePath = `/outputs/${path.basename(result.audioPath)}`
    res.json({
      success: true,
      audioPath: result.audioPath,
      audioUrl: relativePath,
    })
  } catch (error) {
    console.error('[TTS] Conversion failed:', error)
    res.status(500).json({
      error: 'Failed to convert text to speech',
    })
  }
})

/**
 * POST /api/avatars/lipsync
 * Create a lipsync video using Hedra
 */
router.post('/lipsync', generationLimiter, async (req, res) => {
  try {
    const {
      imageUrl,
      audioUrl,
      textPrompt,
      aspectRatio,
      resolution,
      voiceId,
      voiceText,
    } = req.body

    if (!imageUrl) {
      res.status(400).json({ error: 'Image URL is required' })
      return
    }

    if (!audioUrl && (!voiceId || !voiceText)) {
      res.status(400).json({ error: 'Audio URL or voice settings are required' })
      return
    }

    if (aspectRatio && !['16:9', '9:16', '1:1'].includes(aspectRatio)) {
      res.status(400).json({ error: 'Invalid aspect ratio' })
      return
    }

    if (resolution && !VALID_RESOLUTIONS.includes(resolution)) {
      res.status(400).json({ error: 'Invalid resolution' })
      return
    }

    let resolvedImagePath: string | undefined
    if (imageUrl.startsWith('/avatars/')) {
      const filename = path.basename(imageUrl)
      const safePath = sanitizePath(AVATARS_DIR, filename)
      if (!safePath) {
        res.status(400).json({ error: 'Invalid image path' })
        return
      }
      resolvedImagePath = safePath
    }

    let resolvedAudioPath: string | undefined
    if (audioUrl?.startsWith('/outputs/')) {
      const filename = path.basename(audioUrl)
      const safePath = sanitizePath(OUTPUTS_DIR, filename)
      if (!safePath) {
        res.status(400).json({ error: 'Invalid audio path' })
        return
      }
      resolvedAudioPath = safePath
    }

    console.log('[Lipsync] Creating video generation job...')
    const job = await createLipsyncVideo({
      imageUrl: resolvedImagePath ? undefined : imageUrl,
      imagePath: resolvedImagePath,
      audioUrl: resolvedAudioPath ? undefined : audioUrl,
      audioPath: resolvedAudioPath,
      textPrompt: textPrompt?.slice(0, 500),
      aspectRatio,
      resolution,
      voiceId,
      voiceText: voiceText?.slice(0, MAX_TEXT_LENGTH),
    })

    console.log(`[Lipsync] Job created: ${job.id}`)

    res.json({
      success: true,
      job,
    })
  } catch (error) {
    console.error('[Lipsync] Job creation failed:', error)
    res.status(500).json({
      error: 'Failed to create lipsync video',
    })
  }
})

/**
 * GET /api/avatars/lipsync/:jobId
 * Check lipsync job status
 */
router.get('/lipsync/:jobId', avatarLimiter, async (req, res) => {
  try {
    const { jobId } = req.params

    if (!validateJobId(jobId)) {
      res.status(400).json({ error: 'Invalid job ID format' })
      return
    }

    const status = await checkLipsyncStatus(jobId)

    res.json({
      success: true,
      ...status,
    })
  } catch (error) {
    console.error('[Lipsync] Status check failed:', error)
    res.status(500).json({
      error: 'Failed to check lipsync status',
    })
  }
})

/**
 * POST /api/avatars/lipsync/:jobId/download
 * Download completed lipsync video
 */
router.post('/lipsync/:jobId/download', avatarLimiter, async (req, res) => {
  try {
    const { jobId } = req.params

    if (!validateJobId(jobId)) {
      res.status(400).json({ error: 'Invalid job ID format' })
      return
    }

    const status = await checkLipsyncStatus(jobId)

    if (status.status !== 'complete') {
      res.status(400).json({ error: 'Video is not ready yet', status: status.status })
      return
    }

    if (!status.videoUrl) {
      res.status(400).json({ error: 'No video URL available' })
      return
    }

    await fs.mkdir(OUTPUTS_DIR, { recursive: true })
    const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '')
    const outputPath = path.join(OUTPUTS_DIR, `lipsync_${safeJobId}_${Date.now()}.mp4`)

    console.log(`[Lipsync] Downloading video to ${outputPath}...`)
    await downloadVideo(status.videoUrl, outputPath)

    const relativePath = `/outputs/${path.basename(outputPath)}`
    res.json({
      success: true,
      videoPath: outputPath,
      videoUrl: relativePath,
    })
  } catch (error) {
    console.error('[Lipsync] Download failed:', error)
    res.status(500).json({
      error: 'Failed to download video',
    })
  }
})

export default router
