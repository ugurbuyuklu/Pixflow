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

interface AvatarsRouterConfig {
  projectRoot: string
}

const avatarLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many generation requests, please wait before trying again' },
  standardHeaders: true,
  legacyHeaders: false,
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
      res.status(400).json({ error: 'No files uploaded' })
      return
    }
    const uploaded = files.map(f => ({
      name: f.filename,
      filename: f.filename,
      url: `/avatars/${encodeURIComponent(f.filename)}`,
    }))
    console.log(`[Avatar] Uploaded ${files.length} file(s) to gallery`)
    res.json({ success: true, avatars: uploaded })
  })

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
      const localPath = path.join(avatarsDir, fileName)
      const response = await fetch(result.imageUrl)
      if (!response.ok) throw new Error(`Failed to download generated avatar: ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      await fs.mkdir(avatarsDir, { recursive: true })
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
      res.status(500).json({ error: 'Failed to generate avatar' })
    }
  })

  router.post('/generate-from-reference', generationLimiter, upload.single('referenceImage'), async (req, res) => {
    const file = req.file
    try {
      const { prompt, aspectRatio } = req.body
      if (!file) { res.status(400).json({ error: 'Reference image is required' }); return }
      if (!prompt || typeof prompt !== 'string') { res.status(400).json({ error: 'Prompt is required' }); return }
      if (prompt.length > MAX_PROMPT_LENGTH) { res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)` }); return }
      if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) { res.status(400).json({ error: 'Invalid aspect ratio' }); return }

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

      res.json({
        success: true,
        imageUrl: result.imageUrl,
        localPath: `/avatars/${fileName}`,
        requestId: result.requestId,
      })
    } catch (error) {
      console.error('[Avatar] Generation from reference failed:', error)
      res.status(500).json({ error: 'Failed to generate avatar from reference' })
    } finally {
      if (file) await fs.unlink(file.path).catch(() => {})
    }
  })

  router.post('/script', avatarLimiter, async (req, res) => {
    try {
      const { concept, duration, examples, tone } = req.body
      if (!concept || typeof concept !== 'string') { res.status(400).json({ error: 'Concept is required' }); return }
      if (concept.length > 500) { res.status(400).json({ error: 'Concept too long (max 500 characters)' }); return }
      if (!duration || typeof duration !== 'number' || duration < 5 || duration > 120) { res.status(400).json({ error: 'Duration must be between 5 and 120 seconds' }); return }
      if (tone && !VALID_TONES.includes(tone)) { res.status(400).json({ error: 'Invalid tone' }); return }
      if (examples && (!Array.isArray(examples) || examples.length > 5)) { res.status(400).json({ error: 'Examples must be an array with max 5 items' }); return }

      console.log(`[Script] Generating ${duration}s script for "${concept}"...`)
      const result = await generateVoiceoverScript({ concept, duration, examples, tone })
      if (!result.script || result.wordCount === 0) throw new Error('Script generation returned empty result')
      console.log(`[Script] Generated ${result.wordCount} words (~${result.estimatedDuration}s)`)
      res.json({ success: true, ...result })
    } catch (error) {
      console.error('[Script] Generation failed:', error)
      res.status(500).json({ error: 'Failed to generate script' })
    }
  })

  router.post('/script/refine', avatarLimiter, async (req, res) => {
    try {
      const { script, feedback, duration } = req.body
      if (!script || typeof script !== 'string') { res.status(400).json({ error: 'Script is required' }); return }
      if (!feedback || typeof feedback !== 'string') { res.status(400).json({ error: 'Feedback is required' }); return }
      if (script.length > MAX_TEXT_LENGTH || feedback.length > 1000) { res.status(400).json({ error: 'Input too long' }); return }

      console.log('[Script] Refining script...')
      const result = await refineScript(script, feedback, duration || 30)
      res.json({ success: true, ...result })
    } catch (error) {
      console.error('[Script] Refinement failed:', error)
      res.status(500).json({ error: 'Failed to refine script' })
    }
  })

  router.get('/voices', avatarLimiter, async (_req, res) => {
    try {
      const voices = await listVoices()
      res.json({ success: true, voices })
    } catch (error) {
      console.error('[TTS] Failed to list voices:', error)
      res.status(500).json({ error: 'Failed to list voices' })
    }
  })

  router.get('/tts/models', (_req, res) => {
    res.json({ success: true, models: getAvailableModels() })
  })

  router.post('/tts', generationLimiter, async (req, res) => {
    try {
      const { text, voiceId, modelId } = req.body
      if (!text || typeof text !== 'string') { res.status(400).json({ error: 'Text is required' }); return }
      if (text.length > MAX_TEXT_LENGTH) { res.status(400).json({ error: `Text too long (max ${MAX_TEXT_LENGTH} characters)` }); return }
      if (!voiceId || typeof voiceId !== 'string') { res.status(400).json({ error: 'Voice ID is required' }); return }
      if (voiceId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(voiceId)) { res.status(400).json({ error: 'Invalid voice ID format' }); return }

      await fs.mkdir(outputsDir, { recursive: true })
      const outputPath = path.join(outputsDir, `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`)

      console.log(`[TTS] Converting ${text.length} characters to speech...`)
      const result = await textToSpeech({ text, voiceId, outputPath, modelId })
      console.log(`[TTS] Saved to ${result.audioPath}`)

      res.json({
        success: true,
        audioPath: result.audioPath,
        audioUrl: `/outputs/${path.basename(result.audioPath)}`,
      })
    } catch (error) {
      console.error('[TTS] Conversion failed:', error)
      res.status(500).json({ error: 'Failed to convert text to speech' })
    }
  })

  router.post('/lipsync', generationLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(660_000)
    res.setTimeout(660_000)

    try {
      const { imageUrl, audioUrl } = req.body
      if (!imageUrl) { res.status(400).json({ error: 'Image URL is required' }); return }
      if (!audioUrl) { res.status(400).json({ error: 'Audio URL is required' }); return }

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

      if (!imagePath) { res.status(400).json({ error: 'Invalid image path — must be a local avatar or output' }); return }
      if (!audioPath) { res.status(400).json({ error: 'Invalid audio path — must be a local output' }); return }

      try { await fs.access(imagePath) } catch {
        res.status(400).json({ error: `Image file not found: ${path.basename(imagePath)}` })
        return
      }
      try { await fs.access(audioPath) } catch {
        res.status(400).json({ error: `Audio file not found: ${path.basename(audioPath)}` })
        return
      }

      console.log('[Lipsync] Creating video with Hedra Character-3...')
      const result = await createHedraVideo({ imagePath, audioPath, aspectRatio: '9:16' })

      await fs.mkdir(outputsDir, { recursive: true })
      const outputFilename = `lipsync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
      await downloadHedraVideo(result.videoUrl, path.join(outputsDir, outputFilename))

      if (req.user?.id) notify(req.user.id, 'lipsync_complete', 'Lipsync Video Ready', 'Your talking avatar video is ready to download')

      res.json({
        success: true,
        videoUrl: result.videoUrl,
        localPath: `/outputs/${outputFilename}`,
        generationId: result.generationId,
      })
    } catch (error) {
      console.error('[Lipsync] Generation failed:', error)
      res.status(500).json({
        error: 'Failed to create lipsync video',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  router.post('/i2v', generationLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(300_000)
    res.setTimeout(300_000)

    try {
      const { imageUrl, prompt, duration, aspectRatio } = req.body
      if (!imageUrl || typeof imageUrl !== 'string') { res.status(400).json({ error: 'Image URL is required' }); return }
      if (!prompt || typeof prompt !== 'string') { res.status(400).json({ error: 'Prompt is required' }); return }
      if (prompt.length > MAX_PROMPT_LENGTH) { res.status(400).json({ error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)` }); return }
      if (duration && !['5', '10'].includes(String(duration))) { res.status(400).json({ error: 'Duration must be 5 or 10' }); return }
      if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) { res.status(400).json({ error: 'Invalid aspect ratio' }); return }

      let imagePath: string | null = null
      if (imageUrl.startsWith('/avatars/')) {
        imagePath = sanitizePath(avatarsDir, path.basename(decodeURIComponent(imageUrl)))
      } else if (imageUrl.startsWith('/outputs/')) {
        imagePath = sanitizePath(outputsDir, path.basename(decodeURIComponent(imageUrl)))
      }
      if (!imagePath) { res.status(400).json({ error: 'Invalid image path — must be a local avatar or output' }); return }

      try { await fs.access(imagePath) } catch {
        res.status(400).json({ error: `Image file not found: ${path.basename(imagePath)}` })
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

      res.json({
        success: true,
        videoUrl: result.videoUrl,
        localPath: `/outputs/${outputFilename}`,
        requestId: result.requestId,
      })
    } catch (error) {
      console.error('[I2V] Generation failed:', error)
      res.status(500).json({
        error: 'Failed to generate video',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  return router
}
