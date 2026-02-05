import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import { performResearch, analyzeResearchResults } from './services/research.js'
import { generatePrompts, validateAllPrompts, textToPrompt } from './services/promptGenerator.js'
import { addToHistory } from './services/history.js'
import generateRouter from './routes/generate.js'
import historyRouter from './routes/history.js'
import avatarsRouter from './routes/avatars.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const app = express()
const PORT = process.env.PORT || 3001

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

const PROJECT_ROOT = path.resolve(__dirname, '../../..')

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(path.join(PROJECT_ROOT, 'uploads')))
app.use('/outputs', express.static(path.join(PROJECT_ROOT, 'outputs')))
app.use('/avatars', express.static(path.join(PROJECT_ROOT, 'avatars')))

function sanitizeConcept(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (trimmed.length === 0 || trimmed.length > 100) return null
  return trimmed.replace(/[<>{}]/g, '')
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const AVATARS_DIR = path.join(PROJECT_ROOT, 'avatars')
const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

app.get('/api/avatars', apiLimiter, async (_req, res) => {
  try {
    await fs.mkdir(AVATARS_DIR, { recursive: true })
    const files = await fs.readdir(AVATARS_DIR)
    const avatars = files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase()
        return VALID_IMAGE_EXTENSIONS.includes(ext)
      })
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

app.post('/api/prompts/generate', apiLimiter, async (req, res) => {
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

    // Save to history
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

app.get('/api/prompts/research/:concept', apiLimiter, async (req, res) => {
  const concept = sanitizeConcept(req.params.concept)

  if (!concept) {
    res.status(400).json({ error: 'Invalid concept (1-100 characters)' })
    return
  }

  try {
    console.log(`[Research] Performing research only for "${concept}"...`)
    const researchBrief = await performResearch(concept)
    const analysis = analyzeResearchResults(researchBrief)

    res.json({
      research: researchBrief,
      analysis,
    })
  } catch (error) {
    console.error('[Error]', error)
    res.status(500).json({
      error: 'Failed to perform research',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/prompts/text-to-json', apiLimiter, async (req, res) => {
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

app.use('/api/generate', generateRouter)
app.use('/api/history', historyRouter)
app.use('/api/avatars', avatarsRouter)

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
  console.log(`Generate prompts: POST http://localhost:${PORT}/api/prompts/generate`)
  console.log(`Batch generate: POST http://localhost:${PORT}/api/generate/batch`)
  console.log(`History: GET http://localhost:${PORT}/api/history`)
})
