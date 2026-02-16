import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { GREENBOX_REFERENCE_PROMPT } from '../../constants/referencePrompts.js'
import type { AuthRequest } from '../middleware/auth.js'
import { generateAvatar, generateAvatarFromReference } from '../services/avatar.js'
import { createHedraVideo, downloadHedraVideo } from '../services/hedra.js'
import { downloadKlingVideo, generateKlingTransitionVideo, generateKlingVideo } from '../services/kling.js'
import { notify } from '../services/notifications.js'
import { isMockProvidersEnabled } from '../services/providerRuntime.js'
import { createPipelineSpan } from '../services/telemetry.js'
import { getAvailableModels, listVoices, textToSpeech } from '../services/tts.js'
import {
  detectScriptLanguage,
  generateVoiceoverScript,
  refineScript,
  translateVoiceoverScript,
} from '../services/voiceover.js'
import { sendError, sendSuccess } from '../utils/http.js'

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

const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many TTS requests, please wait before trying again', 'RATE_LIMITED')
  },
})

const lipsyncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many lipsync requests, please wait before trying again', 'RATE_LIMITED')
  },
})

const MAX_PROMPT_LENGTH = 2000
const MAX_TEXT_LENGTH = 5000
const VALID_ASPECT_RATIOS = ['1:1', '9:16', '16:9']
const VALID_AVATAR_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const MIN_AVATAR_BYTES = 10 * 1024
const VALID_TONES = ['casual', 'professional', 'energetic', 'friendly', 'dramatic']
const VALID_REACTIONS = [
  'sad',
  'upset',
  'angry',
  'disappointed',
  'sob',
  'excited',
  'surprised',
  'confused',
  'worried',
  'happy',
]
const GREENBOX_PROMPT = GREENBOX_REFERENCE_PROMPT
const GREENBOX_PROMPT_HASH = createHash('sha1').update(GREENBOX_PROMPT).digest('hex').slice(0, 8)
const LIPSYNC_GREENBOX_MODE = (process.env.PIXFLOW_LIPSYNC_GREENBOX_MODE || 'disabled').toLowerCase()

function mimeTypeFromImagePath(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'image/png'
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function sanitizePath(basePath: string, userPath: string): string | null {
  const normalizedBase = path.resolve(basePath)
  const resolved = path.resolve(basePath, userPath)
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    return null
  }
  return resolved
}

function shouldNormalizeAvatarForLipsync(imageUrl: string): boolean {
  // Identity fidelity is prioritized by default; normalization is opt-in.
  if (LIPSYNC_GREENBOX_MODE === 'force') {
    return !imageUrl.startsWith('/avatars_generated/')
  }

  // In auto mode, normalize only transient output images.
  if (LIPSYNC_GREENBOX_MODE === 'auto') {
    return imageUrl.startsWith('/outputs/')
  }

  return false
}

export function createAvatarsRouter(config: AvatarsRouterConfig): express.Router {
  const { projectRoot } = config
  const outputsDir = path.join(projectRoot, 'outputs')
  const avatarsDir = path.join(projectRoot, 'avatars')
  const generatedAvatarsDir = path.join(projectRoot, 'avatars_generated')
  const uploadedAvatarsDir = path.join(projectRoot, 'avatars_uploads')
  const uploadsDir = path.join(projectRoot, 'uploads')
  const mockProvidersEnabled = isMockProvidersEnabled()

  const router = express.Router()

  void (async () => {
    try {
      await fs.mkdir(uploadedAvatarsDir, { recursive: true })
      const files = await fs.readdir(uploadedAvatarsDir)
      await Promise.all(files.map((file) => fs.unlink(path.join(uploadedAvatarsDir, file))))
    } catch (err) {
      console.warn('[Avatar] Failed to clear uploaded avatars:', err)
    }
  })()

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
      await fs.mkdir(uploadedAvatarsDir, { recursive: true })
      cb(null, uploadedAvatarsDir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `upload_avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`)
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

  router.get('/', avatarLimiter, async (_req, res) => {
    try {
      await fs.mkdir(avatarsDir, { recursive: true })
      await fs.mkdir(generatedAvatarsDir, { recursive: true })
      await fs.mkdir(uploadedAvatarsDir, { recursive: true })
      const curatedFiles = await fs.readdir(avatarsDir)
      const generatedFiles = await fs.readdir(generatedAvatarsDir)
      const uploadedFiles = await fs.readdir(uploadedAvatarsDir)

      const curated = curatedFiles
        .filter((file) => VALID_AVATAR_EXTENSIONS.includes(path.extname(file).toLowerCase()))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((file) => ({
          name: file,
          filename: file,
          url: `/avatars/${encodeURIComponent(file)}`,
          source: 'curated' as const,
        }))

      const generatedCandidates = generatedFiles
        .filter((file) => VALID_AVATAR_EXTENSIONS.includes(path.extname(file).toLowerCase()))
        .filter((file) => file.startsWith('avatar_') || file.startsWith('generated_avatar_'))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

      const generated = (
        await Promise.all(
          generatedCandidates.map(async (file) => {
            try {
              const stats = await fs.stat(path.join(generatedAvatarsDir, file))
              if (!mockProvidersEnabled && stats.size < MIN_AVATAR_BYTES) {
                await fs.unlink(path.join(generatedAvatarsDir, file)).catch(() => {})
                return null
              }
              return {
                name: file,
                filename: file,
                url: `/avatars_generated/${encodeURIComponent(file)}`,
                source: 'generated' as const,
              }
            } catch {
              return null
            }
          }),
        )
      ).filter(Boolean) as Array<{ name: string; filename: string; url: string; source: 'generated' }>

      const uploaded = uploadedFiles
        .filter((file) => VALID_AVATAR_EXTENSIONS.includes(path.extname(file).toLowerCase()))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .map((file) => ({
          name: file,
          filename: file,
          url: `/avatars_uploads/${encodeURIComponent(file)}`,
          source: 'uploaded' as const,
        }))

      const avatars = [...curated, ...generated, ...uploaded]

      sendSuccess(res, { avatars })
    } catch (error) {
      console.error('[Avatar] Failed to list avatars:', error)
      sendError(res, 500, 'Failed to list avatars', 'AVATAR_LIST_FAILED')
    }
  })

  router.post('/upload', avatarLimiter, avatarUpload.array('files', 10), (req, res) => {
    const files = req.files as Express.Multer.File[]
    if (!files || files.length === 0) {
      sendError(res, 400, 'No files uploaded', 'NO_FILES_UPLOADED')
      return
    }
    const uploaded = files.map((f) => ({
      name: f.filename,
      filename: f.filename,
      url: `/avatars_uploads/${encodeURIComponent(f.filename)}`,
      source: 'uploaded' as const,
    }))
    console.log(`[Avatar] Uploaded ${files.length} file(s) to gallery`)
    sendSuccess(res, { avatars: uploaded })
  })

  router.delete('/upload/:filename', avatarLimiter, async (req, res) => {
    const { filename } = req.params
    if (!filename || !VALID_AVATAR_EXTENSIONS.includes(path.extname(filename).toLowerCase())) {
      sendError(res, 400, 'Invalid avatar filename', 'INVALID_AVATAR_FILENAME')
      return
    }

    try {
      const uploadedPath = sanitizePath(uploadedAvatarsDir, filename)
      const generatedPath = sanitizePath(generatedAvatarsDir, filename)
      if (!uploadedPath || !generatedPath) {
        sendError(res, 400, 'Invalid avatar path', 'INVALID_AVATAR_PATH')
        return
      }

      try {
        await fs.unlink(uploadedPath)
        console.log(`[Avatar] Deleted uploaded avatar ${filename}`)
        sendSuccess(res, { deleted: filename })
        return
      } catch (err) {
        if (!(err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT')) {
          throw err
        }
      }

      await fs.unlink(generatedPath)
      console.log(`[Avatar] Deleted legacy avatar ${filename}`)
      sendSuccess(res, { deleted: filename })
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
        sendError(res, 404, 'Avatar not found', 'AVATAR_NOT_FOUND')
        return
      }
      console.error('[Avatar] Failed to delete uploaded avatar:', err)
      sendError(res, 500, 'Failed to delete avatar', 'AVATAR_DELETE_FAILED')
    }
  })

  router.post('/generate', generationLimiter, async (req, res) => {
    try {
      const { prompt, aspectRatio, seed } = req.body
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
      const result = await generateAvatar(prompt, { aspectRatio, seed })

      const fileName = `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
      const localPath = path.join(generatedAvatarsDir, fileName)
      const response = await fetch(result.imageUrl)
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`Failed to download generated avatar: ${response.status} ${detail.slice(0, 120)}`)
      }
      const contentType = response.headers.get('content-type') || ''
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!contentType.startsWith('image/')) {
        throw new Error(`Generated avatar content-type invalid: ${contentType || 'unknown'}`)
      }
      if (!mockProvidersEnabled && buffer.length < MIN_AVATAR_BYTES) {
        throw new Error(`Generated avatar too small: ${buffer.length} bytes`)
      }
      await fs.mkdir(generatedAvatarsDir, { recursive: true })
      await fs.writeFile(localPath, buffer)
      console.log(`[Avatar] Saved to ${localPath}`)

      sendSuccess(res, {
        imageUrl: result.imageUrl,
        localPath: `/avatars_generated/${fileName}`,
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
      if (!file) {
        sendError(res, 400, 'Reference image is required', 'MISSING_REFERENCE_IMAGE')
        return
      }
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

      const imageBuffer = await fs.readFile(file.path)
      const dataUrl = `data:${file.mimetype};base64,${imageBuffer.toString('base64')}`

      console.log('[Avatar] Generating avatar from reference...')
      const result = await generateAvatarFromReference(dataUrl, prompt, { aspectRatio })

      const fileName = `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
      const localPath = path.join(generatedAvatarsDir, fileName)
      const response = await fetch(result.imageUrl)
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`Failed to download generated avatar: ${response.status} ${detail.slice(0, 120)}`)
      }
      const contentType = response.headers.get('content-type') || ''
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!contentType.startsWith('image/')) {
        throw new Error(`Generated avatar content-type invalid: ${contentType || 'unknown'}`)
      }
      if (!mockProvidersEnabled && buffer.length < MIN_AVATAR_BYTES) {
        throw new Error(`Generated avatar too small: ${buffer.length} bytes`)
      }
      await fs.mkdir(generatedAvatarsDir, { recursive: true })
      await fs.writeFile(localPath, buffer)
      console.log(`[Avatar] Saved to ${localPath}`)

      sendSuccess(res, {
        imageUrl: result.imageUrl,
        localPath: `/avatars_generated/${fileName}`,
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
      const { concept, duration, examples, tone, appName } = req.body
      if (!concept || typeof concept !== 'string') {
        sendError(res, 400, 'Concept is required', 'INVALID_CONCEPT')
        return
      }
      if (concept.length > 500) {
        sendError(res, 400, 'Concept too long (max 500 characters)', 'CONCEPT_TOO_LONG')
        return
      }
      if (!duration || typeof duration !== 'number' || duration < 5 || duration > 120) {
        sendError(res, 400, 'Duration must be between 5 and 120 seconds', 'INVALID_DURATION')
        return
      }
      if (tone && !VALID_TONES.includes(tone)) {
        sendError(res, 400, 'Invalid tone', 'INVALID_TONE')
        return
      }
      if (examples && (!Array.isArray(examples) || examples.length > 5)) {
        sendError(res, 400, 'Examples must be an array with max 5 items', 'INVALID_EXAMPLES')
        return
      }
      if (appName != null && typeof appName !== 'string') {
        sendError(res, 400, 'Invalid app name', 'INVALID_APP_NAME')
        return
      }
      const normalizedAppName = appName?.trim()
      if (normalizedAppName && normalizedAppName.length > 80) {
        sendError(res, 400, 'App name too long (max 80 characters)', 'APP_NAME_TOO_LONG')
        return
      }
      span = createPipelineSpan({
        pipeline: 'avatars.script',
        metadata: {
          conceptLength: concept.length,
          duration,
          tone: tone || 'default',
          appName: normalizedAppName || 'generic',
        },
      })

      console.log(`[Script] Generating ${duration}s script for "${concept}" (${normalizedAppName || 'generic'})...`)
      const result = await generateVoiceoverScript({
        concept,
        duration,
        examples,
        tone,
        appName: normalizedAppName || undefined,
      })
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
      if (!script || typeof script !== 'string') {
        sendError(res, 400, 'Script is required', 'INVALID_SCRIPT')
        return
      }
      if (!feedback || typeof feedback !== 'string') {
        sendError(res, 400, 'Feedback is required', 'INVALID_FEEDBACK')
        return
      }
      if (script.length > MAX_TEXT_LENGTH || feedback.length > 1000) {
        sendError(res, 400, 'Input too long', 'INPUT_TOO_LONG')
        return
      }

      console.log('[Script] Refining script...')
      const result = await refineScript(script, feedback, duration || 30)
      sendSuccess(res, { ...result })
    } catch (error) {
      console.error('[Script] Refinement failed:', error)
      sendError(res, 500, 'Failed to refine script', 'SCRIPT_REFINEMENT_FAILED')
    }
  })

  router.post('/script/translate', avatarLimiter, async (req, res) => {
    try {
      const { script, languages } = req.body
      if (!script || typeof script !== 'string') {
        sendError(res, 400, 'Script is required', 'INVALID_SCRIPT')
        return
      }
      if (script.length > MAX_TEXT_LENGTH) {
        sendError(res, 400, 'Script too long', 'SCRIPT_TOO_LONG')
        return
      }
      if (!Array.isArray(languages) || languages.length === 0) {
        sendError(res, 400, 'Languages are required', 'INVALID_LANGUAGES')
        return
      }
      if (languages.length > 10) {
        sendError(res, 400, 'Too many languages (max 10)', 'LANGUAGE_LIMIT')
        return
      }
      if (!languages.every((lang) => typeof lang === 'string' && lang.trim().length > 0 && lang.length <= 40)) {
        sendError(res, 400, 'Invalid language list', 'INVALID_LANGUAGE')
        return
      }

      console.log(`[Script] Translating script into ${languages.length} languages...`)
      const result = await translateVoiceoverScript(script, languages)
      sendSuccess(res, result)
    } catch (error) {
      console.error('[Script] Translation failed:', error)
      sendError(res, 500, 'Failed to translate script', 'SCRIPT_TRANSLATION_FAILED')
    }
  })

  router.post('/script/detect', avatarLimiter, async (req, res) => {
    try {
      const { script } = req.body
      if (!script || typeof script !== 'string') {
        sendError(res, 400, 'Script is required', 'INVALID_SCRIPT')
        return
      }
      if (script.length > MAX_TEXT_LENGTH) {
        sendError(res, 400, 'Script too long', 'SCRIPT_TOO_LONG')
        return
      }
      const result = await detectScriptLanguage(script)
      sendSuccess(res, result)
    } catch (error) {
      console.error('[Script] Language detection failed:', error)
      sendError(res, 500, 'Failed to detect script language', 'SCRIPT_DETECT_FAILED')
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

  router.post('/tts', ttsLimiter, async (req, res) => {
    let span: ReturnType<typeof createPipelineSpan> | null = null
    try {
      const { text, voiceId, modelId } = req.body
      if (!text || typeof text !== 'string') {
        sendError(res, 400, 'Text is required', 'INVALID_TEXT')
        return
      }
      if (text.length > MAX_TEXT_LENGTH) {
        sendError(res, 400, `Text too long (max ${MAX_TEXT_LENGTH} characters)`, 'TEXT_TOO_LONG')
        return
      }
      if (!voiceId || typeof voiceId !== 'string') {
        sendError(res, 400, 'Voice ID is required', 'INVALID_VOICE_ID')
        return
      }
      if (voiceId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(voiceId)) {
        sendError(res, 400, 'Invalid voice ID format', 'INVALID_VOICE_ID')
        return
      }
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

  const audioUploadStorage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      await fs.mkdir(outputsDir, { recursive: true })
      cb(null, outputsDir)
    },
    filename: (_req, file, cb) => {
      const timestamp = Date.now()
      const random = Math.random().toString(36).slice(2, 8)
      const ext = path.extname(file.originalname) || '.mp3'
      cb(null, `audio_upload_${timestamp}_${random}${ext}`)
    },
  })

  const audioUpload = multer({
    storage: audioUploadStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('audio/') || file.mimetype === 'application/octet-stream') {
        cb(null, true)
      } else {
        cb(new Error('Only audio files are allowed'))
      }
    },
  })

  router.post('/upload-audio', avatarLimiter, audioUpload.single('audio'), (req, res) => {
    try {
      const file = req.file
      if (!file) {
        sendError(res, 400, 'No audio file uploaded', 'NO_AUDIO_FILE')
        return
      }

      console.log(`[Audio Upload] Saved to ${file.filename} (${(file.size / 1024).toFixed(1)}KB)`)

      sendSuccess(res, {
        audioPath: file.path,
        audioUrl: `/outputs/${file.filename}`,
      })
    } catch (error) {
      console.error('[Audio Upload] Failed:', error)
      sendError(res, 500, 'Failed to upload audio', 'AUDIO_UPLOAD_FAILED')
    }
  })

  const ensureGreenboxAvatarPath = async (imagePath: string, imageUrl: string): Promise<string> => {
    // Avatars in /avatars_generated are already created by green-background flows.
    if (imageUrl.startsWith('/avatars_generated/')) {
      return imagePath
    }

    const imageHash = createHash('sha1').update(imagePath).digest('hex').slice(0, 10)
    const cacheBase = path.parse(path.basename(imagePath)).name.replace(/[^a-zA-Z0-9_-]/g, '_')
    const cacheFilename = `greenbox_${cacheBase}_${imageHash}_${GREENBOX_PROMPT_HASH}.png`
    const cachedPath = path.join(generatedAvatarsDir, cacheFilename)
    if (await fileExists(cachedPath)) {
      return cachedPath
    }

    const imageBuffer = await fs.readFile(imagePath)
    const dataUrl = `data:${mimeTypeFromImagePath(imagePath)};base64,${imageBuffer.toString('base64')}`
    const result = await generateAvatarFromReference(dataUrl, GREENBOX_PROMPT, { aspectRatio: '9:16' })
    const response = await fetch(result.imageUrl)
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Failed to download greenbox avatar: ${response.status} ${detail.slice(0, 120)}`)
    }
    const contentType = response.headers.get('content-type') || ''
    const buffer = Buffer.from(await response.arrayBuffer())
    if (!contentType.startsWith('image/')) {
      throw new Error(`Greenbox avatar content-type invalid: ${contentType || 'unknown'}`)
    }
    if (!mockProvidersEnabled && buffer.length < MIN_AVATAR_BYTES) {
      throw new Error(`Greenbox avatar too small: ${buffer.length} bytes`)
    }

    await fs.mkdir(generatedAvatarsDir, { recursive: true })
    await fs.writeFile(cachedPath, buffer)
    return cachedPath
  }

  router.post('/lipsync', lipsyncLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(660_000)
    res.setTimeout(660_000)
    let span: ReturnType<typeof createPipelineSpan> | null = null

    try {
      const { imageUrl, audioUrl } = req.body
      if (!audioUrl) {
        sendError(res, 400, 'Audio URL is required', 'MISSING_AUDIO_URL')
        return
      }

      // If no imageUrl provided, just return the audio (voiceover only)
      if (!imageUrl) {
        sendSuccess(res, {
          localPath: audioUrl,
          message: 'Audio voiceover ready (no video generated)',
        })
        return
      }

      span = createPipelineSpan({
        pipeline: 'avatars.lipsync',
        userId: req.user?.id,
        metadata: { imageUrl, audioUrl },
      })

      let imagePath: string | null = null
      let audioPath: string | null = null

      if (imageUrl.startsWith('/avatars_generated/')) {
        imagePath = sanitizePath(generatedAvatarsDir, decodeURIComponent(imageUrl.slice('/avatars_generated/'.length)))
      } else if (imageUrl.startsWith('/avatars_uploads/')) {
        imagePath = sanitizePath(uploadedAvatarsDir, decodeURIComponent(imageUrl.slice('/avatars_uploads/'.length)))
      } else if (imageUrl.startsWith('/avatars/')) {
        imagePath = sanitizePath(avatarsDir, decodeURIComponent(imageUrl.slice('/avatars/'.length)))
      } else if (imageUrl.startsWith('/outputs/')) {
        imagePath = sanitizePath(outputsDir, decodeURIComponent(imageUrl.slice('/outputs/'.length)))
      }

      if (audioUrl.startsWith('/outputs/')) {
        audioPath = sanitizePath(outputsDir, path.basename(decodeURIComponent(audioUrl)))
      }

      if (!imagePath) {
        sendError(res, 400, 'Invalid image path — must be a local avatar or output', 'INVALID_IMAGE_PATH')
        return
      }
      if (!audioPath) {
        sendError(res, 400, 'Invalid audio path — must be a local output', 'INVALID_AUDIO_PATH')
        return
      }

      try {
        await fs.access(imagePath)
      } catch {
        sendError(res, 400, `Image file not found: ${path.basename(imagePath)}`, 'IMAGE_NOT_FOUND')
        return
      }
      try {
        await fs.access(audioPath)
      } catch {
        sendError(res, 400, `Audio file not found: ${path.basename(audioPath)}`, 'AUDIO_NOT_FOUND')
        return
      }

      let imagePathForLipsync = imagePath
      if (shouldNormalizeAvatarForLipsync(imageUrl)) {
        imagePathForLipsync = await ensureGreenboxAvatarPath(imagePath, imageUrl)
        if (imagePathForLipsync !== imagePath) {
          console.log(`[Lipsync] Avatar normalized to greenbox: ${path.basename(imagePathForLipsync)}`)
        }
      } else {
        console.log(
          `[Lipsync] Using selected avatar source directly (greenbox normalization disabled): ${path.basename(imagePath)}`,
        )
      }

      console.log('[Lipsync] Creating video with Hedra Character-3...')
      const result = await createHedraVideo({ imagePath: imagePathForLipsync, audioPath, aspectRatio: '9:16' })

      await fs.mkdir(outputsDir, { recursive: true })
      const outputFilename = `lipsync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
      await downloadHedraVideo(result.videoUrl, path.join(outputsDir, outputFilename))

      if (req.user?.id)
        notify(req.user.id, 'lipsync_complete', 'Lipsync Video Ready', 'Your talking avatar video is ready to download')
      span.success({ outputFile: outputFilename, generationId: result.generationId })

      sendSuccess(res, {
        videoUrl: result.videoUrl,
        localPath: `/outputs/${outputFilename}`,
        generationId: result.generationId,
      })
    } catch (error) {
      console.error('[Lipsync] Generation failed:', error)
      span?.error(error)
      sendError(
        res,
        500,
        'Failed to create lipsync video',
        'LIPSYNC_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  router.post('/i2v', generationLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(300_000)
    res.setTimeout(300_000)
    let span: ReturnType<typeof createPipelineSpan> | null = null

    try {
      const { imageUrl, prompt, duration, aspectRatio } = req.body
      if (!imageUrl || typeof imageUrl !== 'string') {
        sendError(res, 400, 'Image URL is required', 'MISSING_IMAGE_URL')
        return
      }
      if (!prompt || typeof prompt !== 'string') {
        sendError(res, 400, 'Prompt is required', 'INVALID_PROMPT')
        return
      }
      if (prompt.length > MAX_PROMPT_LENGTH) {
        sendError(res, 400, `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)`, 'PROMPT_TOO_LONG')
        return
      }
      if (duration && !['5', '10'].includes(String(duration))) {
        sendError(res, 400, 'Duration must be 5 or 10', 'INVALID_DURATION')
        return
      }
      if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
        sendError(res, 400, 'Invalid aspect ratio', 'INVALID_ASPECT_RATIO')
        return
      }
      span = createPipelineSpan({
        pipeline: 'avatars.i2v',
        userId: req.user?.id,
        metadata: { imageUrl, duration: String(duration || '5'), aspectRatio: aspectRatio || '9:16' },
      })

      let imagePath: string | null = null
      if (imageUrl.startsWith('/avatars_generated/')) {
        imagePath = sanitizePath(generatedAvatarsDir, decodeURIComponent(imageUrl.slice('/avatars_generated/'.length)))
      } else if (imageUrl.startsWith('/avatars_uploads/')) {
        imagePath = sanitizePath(uploadedAvatarsDir, decodeURIComponent(imageUrl.slice('/avatars_uploads/'.length)))
      } else if (imageUrl.startsWith('/avatars/')) {
        imagePath = sanitizePath(avatarsDir, decodeURIComponent(imageUrl.slice('/avatars/'.length)))
      } else if (imageUrl.startsWith('/outputs/')) {
        imagePath = sanitizePath(outputsDir, decodeURIComponent(imageUrl.slice('/outputs/'.length)))
      } else if (imageUrl.startsWith('/uploads/')) {
        imagePath = sanitizePath(uploadsDir, decodeURIComponent(imageUrl.slice('/uploads/'.length)))
      }
      if (!imagePath) {
        sendError(res, 400, 'Invalid image path — must be a local avatar, output, or upload', 'INVALID_IMAGE_PATH')
        return
      }

      try {
        await fs.access(imagePath)
      } catch {
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
      sendError(
        res,
        500,
        'Failed to generate video',
        'I2V_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  router.post('/i2v-startend', generationLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(300_000)
    res.setTimeout(300_000)
    let span: ReturnType<typeof createPipelineSpan> | null = null

    try {
      const { startImageUrl, endImageUrl, prompt, duration, aspectRatio } = req.body
      if (!startImageUrl || typeof startImageUrl !== 'string') {
        sendError(res, 400, 'Start image URL is required', 'MISSING_START_IMAGE_URL')
        return
      }
      if (!endImageUrl || typeof endImageUrl !== 'string') {
        sendError(res, 400, 'End image URL is required', 'MISSING_END_IMAGE_URL')
        return
      }
      if (!prompt || typeof prompt !== 'string') {
        sendError(res, 400, 'Prompt is required', 'INVALID_PROMPT')
        return
      }
      if (prompt.length > MAX_PROMPT_LENGTH) {
        sendError(res, 400, `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)`, 'PROMPT_TOO_LONG')
        return
      }
      if (duration && !['5', '10'].includes(String(duration))) {
        sendError(res, 400, 'Duration must be 5 or 10', 'INVALID_DURATION')
        return
      }
      if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
        sendError(res, 400, 'Invalid aspect ratio', 'INVALID_ASPECT_RATIO')
        return
      }

      span = createPipelineSpan({
        pipeline: 'avatars.i2v-startend',
        userId: req.user?.id,
        metadata: { duration: String(duration || '5'), aspectRatio: aspectRatio || '9:16' },
      })

      const resolveImagePath = (imageUrl: string): string | null => {
        if (imageUrl.startsWith('/avatars_generated/'))
          return sanitizePath(generatedAvatarsDir, decodeURIComponent(imageUrl.slice('/avatars_generated/'.length)))
        if (imageUrl.startsWith('/avatars_uploads/'))
          return sanitizePath(uploadedAvatarsDir, decodeURIComponent(imageUrl.slice('/avatars_uploads/'.length)))
        if (imageUrl.startsWith('/avatars/'))
          return sanitizePath(avatarsDir, decodeURIComponent(imageUrl.slice('/avatars/'.length)))
        if (imageUrl.startsWith('/outputs/'))
          return sanitizePath(outputsDir, decodeURIComponent(imageUrl.slice('/outputs/'.length)))
        if (imageUrl.startsWith('/uploads/'))
          return sanitizePath(uploadsDir, decodeURIComponent(imageUrl.slice('/uploads/'.length)))
        return null
      }

      const startImagePath = resolveImagePath(startImageUrl)
      const endImagePath = resolveImagePath(endImageUrl)

      if (!startImagePath) {
        sendError(res, 400, 'Invalid start image path', 'INVALID_START_IMAGE_PATH')
        return
      }
      if (!endImagePath) {
        sendError(res, 400, 'Invalid end image path', 'INVALID_END_IMAGE_PATH')
        return
      }

      try {
        await fs.access(startImagePath)
      } catch {
        sendError(res, 400, `Start image not found: ${path.basename(startImagePath)}`, 'START_IMAGE_NOT_FOUND')
        return
      }
      try {
        await fs.access(endImagePath)
      } catch {
        sendError(res, 400, `End image not found: ${path.basename(endImagePath)}`, 'END_IMAGE_NOT_FOUND')
        return
      }

      console.log(
        `[I2V-StartEnd] Generating transition video: ${path.basename(startImagePath)} → ${path.basename(endImagePath)}`,
      )
      const result = await generateKlingTransitionVideo({
        startImagePath,
        endImagePath,
        prompt,
        duration: String(duration || '5') as '5' | '10',
        aspectRatio: aspectRatio || '9:16',
      })

      await fs.mkdir(outputsDir, { recursive: true })
      const outputFilename = `i2v_startend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
      await downloadKlingVideo(result.videoUrl, path.join(outputsDir, outputFilename))

      if (req.user?.id)
        notify(req.user.id, 'i2v_complete', 'Video Ready', 'Your start/end frame video is ready to download')
      span.success({ outputFile: outputFilename, requestId: result.requestId })

      sendSuccess(res, {
        videoUrl: result.videoUrl,
        localPath: `/outputs/${outputFilename}`,
        requestId: result.requestId,
      })
    } catch (error) {
      console.error('[I2V-StartEnd] Generation failed:', error)
      span?.error(error)
      sendError(
        res,
        500,
        'Failed to generate start/end video',
        'I2V_STARTEND_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  router.post('/reaction', generationLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(300_000)
    res.setTimeout(300_000)
    let span: ReturnType<typeof createPipelineSpan> | null = null

    try {
      const { imageUrl, reaction, duration, aspectRatio } = req.body

      // Validation
      if (!imageUrl || typeof imageUrl !== 'string') {
        sendError(res, 400, 'Image URL is required', 'MISSING_IMAGE_URL')
        return
      }
      if (!reaction || !VALID_REACTIONS.includes(reaction)) {
        sendError(res, 400, 'Invalid reaction type', 'INVALID_REACTION')
        return
      }
      if (duration && !['5', '10'].includes(String(duration))) {
        sendError(res, 400, 'Duration must be 5 or 10', 'INVALID_DURATION')
        return
      }
      if (aspectRatio && !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
        sendError(res, 400, 'Invalid aspect ratio', 'INVALID_ASPECT_RATIO')
        return
      }

      span = createPipelineSpan({
        pipeline: 'avatars.reaction',
        userId: req.user?.id,
        metadata: { reaction, duration: String(duration || '5'), aspectRatio: aspectRatio || '9:16' },
      })

      // Resolve image path
      let imagePath: string | null = null
      if (imageUrl.startsWith('/avatars_generated/')) {
        imagePath = sanitizePath(generatedAvatarsDir, decodeURIComponent(imageUrl.slice('/avatars_generated/'.length)))
      } else if (imageUrl.startsWith('/avatars_uploads/')) {
        imagePath = sanitizePath(uploadedAvatarsDir, decodeURIComponent(imageUrl.slice('/avatars_uploads/'.length)))
      } else if (imageUrl.startsWith('/avatars/')) {
        imagePath = sanitizePath(avatarsDir, decodeURIComponent(imageUrl.slice('/avatars/'.length)))
      } else if (imageUrl.startsWith('/outputs/')) {
        imagePath = sanitizePath(outputsDir, decodeURIComponent(imageUrl.slice('/outputs/'.length)))
      }

      if (!imagePath) {
        sendError(res, 400, 'Invalid image path', 'INVALID_IMAGE_PATH')
        return
      }

      try {
        await fs.access(imagePath)
      } catch {
        sendError(res, 400, `Image file not found: ${path.basename(imagePath)}`, 'IMAGE_NOT_FOUND')
        return
      }

      // Reaction prompts - Optimized for Kling AI (Feb 2026)
      // Based on Kling AI best practices: descriptive micro-expressions, emotive language, cinematic details
      const reactionPrompts: Record<string, string> = {
        sad: 'person looks directly at camera with melancholy expression, eyes glistening with sadness, subtle frown, shoulders slightly slumped, slow deliberate blink, heavy and somber mood',
        upset:
          'person with tense frustrated expression, jaw tight, nostrils slightly flared, furrowed brows creating deep lines, eyes narrowed with irritation, slight head shake showing annoyance',
        angry:
          'person with fierce intense expression, eyes burning with rage, clenched jaw creating tension, flared nostrils, rigid posture, face flushed with anger, breathing heavy',
        disappointed:
          'person with deflated expression, gaze lowered with resignation, soft sigh visible, eyebrows slightly raised in disbelief, mouth corners turned down, subtle head shake of disappointment',
        sob: 'person with face contorted in deep sorrow, tears streaming down cheeks, eyes red and swollen, shoulders shaking with sobs, hand trembling as it covers face, raw emotional breakdown',
        excited:
          'person with radiant beaming smile, eyes sparkling with pure joy, eyebrows raised in delight, face lit up with enthusiasm, energetic head movements, infectious happiness and thrill',
        surprised:
          'person with jaw dropped in shock, eyes wide open in astonishment, eyebrows shot up high, slight gasp visible, frozen moment of disbelief, startled and amazed',
        confused:
          'person with perplexed bewildered look, head tilted to side in question, eyes squinting in thought, one eyebrow raised quizzically, lips pursed in puzzlement, searching for understanding',
        worried:
          'person with anxious tense expression, eyes darting nervously, brows knitted together with concern, lips pressed thin, slight tremor visible, uneasy and apprehensive mood',
        happy:
          'person with warm genuine smile reaching eyes, face glowing with contentment, relaxed joyful expression, soft laugh lines visible, peaceful and serene happiness radiating outward',
      }

      const reactionPrompt = reactionPrompts[reaction]
      if (!reactionPrompt) {
        sendError(res, 400, 'Reaction prompt not found', 'REACTION_PROMPT_NOT_FOUND')
        return
      }

      console.log(`[Reaction] Generating ${reaction} reaction video with Kling AI...`)
      const result = await generateKlingVideo({
        imagePath,
        prompt: reactionPrompt,
        duration: String(duration || '5') as '5' | '10',
        aspectRatio: aspectRatio || '9:16',
      })

      await fs.mkdir(outputsDir, { recursive: true })
      const outputFilename = `reaction_${reaction}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
      await downloadKlingVideo(result.videoUrl, path.join(outputsDir, outputFilename))

      if (req.user?.id) {
        notify(req.user.id, 'reaction_complete', 'Reaction Video Ready', `Your ${reaction} reaction video is ready`)
      }
      span.success({ outputFile: outputFilename, requestId: result.requestId })

      sendSuccess(res, {
        videoUrl: result.videoUrl,
        localPath: `/outputs/${outputFilename}`,
        requestId: result.requestId,
      })
    } catch (error) {
      console.error('[Reaction] Generation failed:', error)
      span?.error(error)
      sendError(
        res,
        500,
        'Failed to generate reaction video',
        'REACTION_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return

    if (error instanceof multer.MulterError) {
      const code = error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_FAILED'
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB)' : error.message || 'Upload failed'
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
