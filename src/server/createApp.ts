import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import path from 'path'
import fs from 'fs/promises'
import { performResearch, analyzeResearchResults } from './services/research.js'
import { generatePrompts, validateAllPrompts, textToPrompt } from './services/promptGenerator.js'
import { initHistory, addToHistory } from './services/history.js'
import { createGenerateRouter } from './routes/generate.js'
import { createHistoryRouter } from './routes/history.js'
import { createAvatarsRouter } from './routes/avatars.js'
import { initDatabase, getDb } from './db/index.js'
import { migrateJsonToSqlite } from './db/migrations.js'
import { ensureAdminExists } from './services/auth.js'
import { requireAuth } from './middleware/auth.js'
import { createAuthRouter } from './routes/auth.js'
import { createProductsRouter } from './routes/products.js'

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

  initDatabase(dataDir)
  migrateJsonToSqlite(getDb(), dataDir)
  ensureAdminExists()
  initHistory(dataDir)

  const app = express()

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  })

  app.use(cors())
  app.use(express.json({ limit: '10mb' }))
  app.use('/uploads', express.static(path.join(projectRoot, 'uploads')))
  app.use('/outputs', express.static(path.join(projectRoot, 'outputs')))
  app.use('/avatars', express.static(path.join(projectRoot, 'avatars')))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  const avatarsDir = path.join(projectRoot, 'avatars')

  app.get('/api/avatars', apiLimiter, async (_req, res) => {
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
      res.json({ avatars })
    } catch (error) {
      console.error('[Error] Failed to list avatars:', error)
      res.status(500).json({ error: 'Failed to list avatars' })
    }
  })

  app.post('/api/prompts/generate', requireAuth, apiLimiter, async (req, res) => {
    req.setTimeout(300_000)
    res.setTimeout(300_000)

    const concept = sanitizeConcept(req.body.concept)
    const count = req.body.count ?? 8

    if (!concept) {
      res.status(400).json({ error: 'Concept is required (1-100 characters)' })
      return
    }

    if (typeof count !== 'number' || !Number.isInteger(count)) {
      res.status(400).json({ error: 'Count must be an integer' })
      return
    }

    const clampedCount = Math.max(1, Math.min(10, count))

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

      await addToHistory({
        concept,
        prompts,
        promptCount: prompts.length,
        source: 'generated',
      })

      res.json({
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
      res.status(500).json({
        error: 'Failed to generate prompts',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  app.get('/api/prompts/research/:concept', requireAuth, apiLimiter, async (req, res) => {
    const concept = sanitizeConcept(req.params.concept)

    if (!concept) {
      res.status(400).json({ error: 'Invalid concept (1-100 characters)' })
      return
    }

    try {
      console.log(`[Research] Performing research only for "${concept}"...`)
      const researchBrief = await performResearch(concept)
      const analysis = analyzeResearchResults(researchBrief)
      res.json({ research: researchBrief, analysis })
    } catch (error) {
      console.error('[Error]', error)
      res.status(500).json({
        error: 'Failed to perform research',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  app.post('/api/prompts/text-to-json', requireAuth, apiLimiter, async (req, res) => {
    const text = req.body.text

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ error: 'Text description is required' })
      return
    }

    if (text.length > 1000) {
      res.status(400).json({ error: 'Text too long (max 1000 characters)' })
      return
    }

    try {
      console.log(`[TextToPrompt] Converting text prompt...`)
      const prompt = await textToPrompt(text.trim())
      res.json({ prompt })
    } catch (error) {
      console.error('[Error] Text to prompt conversion failed:', error)
      res.status(500).json({
        error: 'Failed to convert text to prompt',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Public routes
  app.use('/api/auth', createAuthRouter())
  app.use('/api/products', createProductsRouter())

  // Protected routes
  app.use('/api/generate', requireAuth, createGenerateRouter({ projectRoot, openFolder: config.openFolder }))
  app.use('/api/history', requireAuth, createHistoryRouter())
  app.use('/api/avatars', requireAuth, createAvatarsRouter({ projectRoot }))

  return app
}
