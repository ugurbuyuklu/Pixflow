import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import path from 'path'
import fs from 'fs/promises'
import { performResearch, analyzeResearchResults } from './services/research.js'
import { generatePrompts, validateAllPrompts, textToPrompt } from './services/promptGenerator.js'
import { addToHistory } from './services/history.js'
import { createGenerateRouter } from './routes/generate.js'
import { createHistoryRouter } from './routes/history.js'
import { createAvatarsRouter } from './routes/avatars.js'
import { initDatabase, getDb } from './db/index.js'
import { migrateJsonToSqlite } from './db/migrations.js'
import { ensureBootstrapAdminIfConfigured } from './services/auth.js'
import { requireAuth } from './middleware/auth.js'
import { createAuthRouter } from './routes/auth.js'
import { createProductsRouter } from './routes/products.js'
import { createPresetsRouter } from './routes/presets.js'
import { createFeedbackRouter } from './routes/feedback.js'
import { createNotificationsRouter } from './routes/notifications.js'
import { validateServerEnv } from './config/validation.js'
import type { AuthRequest } from './middleware/auth.js'
import { sendError, sendSuccess } from './utils/http.js'
import { PROMPT_GENERATE_DEFAULT, PROMPT_GENERATE_MAX, PROMPT_GENERATE_MIN } from '../constants/limits.js'
import { createPipelineSpan } from './services/telemetry.js'

export interface ServerConfig {
  projectRoot: string
  dataDir: string
  openFolder?: (folderPath: string) => Promise<void>
}

const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

function sanitizeConcept(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (trimmed.length === 0 || trimmed.length > 100) return null
  return trimmed.replace(/[<>{}]/g, '')
}

export function createApp(config: ServerConfig): express.Express {
  const { projectRoot, dataDir } = config

  validateServerEnv()
  initDatabase(dataDir)
  migrateJsonToSqlite(getDb(), dataDir)
  ensureBootstrapAdminIfConfigured()

  const app = express()

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(res, 429, 'Too many requests, please try again later', 'RATE_LIMITED')
    },
  })

  app.use(cors())
  app.use(express.json({ limit: '10mb' }))
  app.use('/uploads', express.static(path.join(projectRoot, 'uploads')))
  app.use('/outputs', express.static(path.join(projectRoot, 'outputs')))
  app.use('/avatars', express.static(path.join(projectRoot, 'avatars')))

  app.get('/health', (_req, res) => {
    sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString() })
  })

  const avatarsDir = path.join(projectRoot, 'avatars')

  app.get('/api/avatars', requireAuth, apiLimiter, async (_req, res) => {
    try {
      await fs.mkdir(avatarsDir, { recursive: true })
      const files = await fs.readdir(avatarsDir)
      const avatars = files
        .filter((file) => VALID_IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((file) => ({
          name: file,
          filename: file,
          url: `/avatars/${encodeURIComponent(file)}`,
        }))
      sendSuccess(res, { avatars })
    } catch (error) {
      console.error('[Error] Failed to list avatars:', error)
      sendError(res, 500, 'Failed to list avatars', 'AVATAR_LIST_FAILED')
    }
  })

  app.post('/api/prompts/generate', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(300_000)
    res.setTimeout(300_000)

    const concept = sanitizeConcept(req.body.concept)
    const count = req.body.count ?? PROMPT_GENERATE_DEFAULT

    if (!concept) {
      sendError(res, 400, 'Concept is required (1-100 characters)', 'INVALID_CONCEPT')
      return
    }

    if (typeof count !== 'number' || !Number.isInteger(count)) {
      sendError(res, 400, 'Count must be an integer', 'INVALID_COUNT')
      return
    }

    const clampedCount = Math.max(PROMPT_GENERATE_MIN, Math.min(PROMPT_GENERATE_MAX, count))
    const span = createPipelineSpan({
      pipeline: 'prompts.generate',
      userId: req.user?.id,
      metadata: { count: clampedCount, conceptLength: concept.length },
    })

    try {
      console.log(`[Research] Starting research for "${concept}"...`)
      const researchBrief = await performResearch(concept)
      const analysis = analyzeResearchResults(researchBrief)
      console.log(`[Research] ${analysis.summary}`)

      if (analysis.warnings.length > 0) {
        console.log(`[Research] Warnings: ${analysis.warnings.join(', ')}`)
      }

      console.log(`[Prompts] Generating ${clampedCount} prompts...`)
      const { prompts, varietyScore } = await generatePrompts(concept, clampedCount, researchBrief)

      const validation = validateAllPrompts(prompts)
      if (!validation.allValid) {
        const invalidCount = validation.results.filter((r) => !r.valid).length
        console.log(`[Validation] ${invalidCount} prompts have issues`)
      }

      console.log(`[Complete] Generated ${prompts.length} prompts, variety score: ${varietyScore.passed ? 'PASS' : 'FAIL'}`)

      await addToHistory(req.user!.id, {
        concept,
        prompts,
        promptCount: prompts.length,
        source: 'generated',
      })

      span.success({
        generatedCount: prompts.length,
        varietyPassed: varietyScore.passed,
        warningCount: analysis.warnings.length,
      })

      sendSuccess(res, {
        prompts,
        concept,
        count: prompts.length,
        research: {
          summary: analysis.summary,
          insights: analysis.keyInsights,
          warnings: analysis.warnings,
          subThemes: researchBrief.sub_themes.map((s) => s.name),
        },
        varietyScore,
        validation: {
          allValid: validation.allValid,
          issues: validation.results.filter((r) => !r.valid),
        },
      })
    } catch (error) {
      console.error('[Error]', error)
      span.error(error)
      sendError(
        res,
        500,
        'Failed to generate prompts',
        'PROMPT_GENERATION_FAILED',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  })

  app.get('/api/prompts/research/:concept', requireAuth, apiLimiter, async (req, res) => {
    const concept = sanitizeConcept(req.params.concept)

    if (!concept) {
      sendError(res, 400, 'Invalid concept (1-100 characters)', 'INVALID_CONCEPT')
      return
    }

    try {
      console.log(`[Research] Performing research only for "${concept}"...`)
      const researchBrief = await performResearch(concept)
      const analysis = analyzeResearchResults(researchBrief)
      sendSuccess(res, { research: researchBrief, analysis })
    } catch (error) {
      console.error('[Error]', error)
      sendError(
        res,
        500,
        'Failed to perform research',
        'RESEARCH_FAILED',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  })

  app.post('/api/prompts/text-to-json', requireAuth, apiLimiter, async (req, res) => {
    const text = req.body.text

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      sendError(res, 400, 'Text description is required', 'INVALID_TEXT')
      return
    }

    if (text.length > 1000) {
      sendError(res, 400, 'Text too long (max 1000 characters)', 'INVALID_TEXT')
      return
    }

    try {
      console.log(`[TextToPrompt] Converting text prompt...`)
      const prompt = await textToPrompt(text.trim())
      sendSuccess(res, { prompt })
    } catch (error) {
      console.error('[Error] Text to prompt conversion failed:', error)
      sendError(
        res,
        500,
        'Failed to convert text to prompt',
        'TEXT_TO_PROMPT_FAILED',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  })

  // Public routes
  app.use('/api/auth', createAuthRouter())
  app.use('/api/products', createProductsRouter())

  // Protected routes
  app.use('/api/generate', requireAuth, createGenerateRouter({ projectRoot, openFolder: config.openFolder }))
  app.use('/api/history', requireAuth, createHistoryRouter())
  app.use('/api/avatars', requireAuth, createAvatarsRouter({ projectRoot }))
  app.use('/api/presets', requireAuth, createPresetsRouter())
  app.use('/api/feedback', requireAuth, createFeedbackRouter())
  app.use('/api/notifications', requireAuth, createNotificationsRouter())

  app.get('/api/settings/status', requireAuth, (_req, res) => {
    sendSuccess(res, {
      apiKeys: {
        openai: !!process.env.OPENAI_API_KEY,
        fal: !!process.env.FAL_API_KEY,
        elevenlabs: !!process.env.ELEVENLABS_API_KEY,
        hedra: !!process.env.HEDRA_API_KEY,
      },
      version: '0.2.0',
    })
  })

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return
    const message = error instanceof Error ? error.message : 'Unexpected server error'
    sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR', message)
  })

  return app
}
