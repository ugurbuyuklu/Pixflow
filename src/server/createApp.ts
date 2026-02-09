import fs from 'node:fs/promises'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { PROMPT_GENERATE_DEFAULT, PROMPT_GENERATE_MAX, PROMPT_GENERATE_MIN } from '../constants/limits.js'
import { validateServerEnv } from './config/validation.js'
import { getDb, initDatabase } from './db/index.js'
import { migrateJsonToSqlite } from './db/migrations.js'
import type { AuthRequest } from './middleware/auth.js'
import { requireAuth } from './middleware/auth.js'
import { createAuthRouter } from './routes/auth.js'
import { createAvatarsRouter } from './routes/avatars.js'
import { createFeedbackRouter } from './routes/feedback.js'
import { createGenerateRouter } from './routes/generate.js'
import { createHistoryRouter } from './routes/history.js'
import { createImageRatingsRouter } from './routes/imageRatings.js'
import { createNotificationsRouter } from './routes/notifications.js'
import { createPresetsRouter } from './routes/presets.js'
import { createProductsRouter } from './routes/products.js'
import { ensureBootstrapAdminIfConfigured } from './services/auth.js'
import { addToHistory } from './services/history.js'
import {
  generatePrompts,
  generateSinglePrompt,
  textToPrompt,
  validateAllPrompts,
  validateVariety,
} from './services/promptGenerator.js'
import { analyzeResearchResults, DEFAULT_RESEARCH_BRIEF, performResearch } from './services/research.js'
import { createPipelineSpan } from './services/telemetry.js'
import { analyzeImage } from './services/vision.js'
import { sendError, sendSuccess } from './utils/http.js'
import { calculatePromptQualityMetrics } from './utils/promptScoring.js'
import type { PromptOutput } from './utils/prompts.js'
import { calculateVarietyScore } from './utils/prompts.js'

export interface ServerConfig {
  projectRoot: string
  dataDir: string
  openFolder?: (folderPath: string) => Promise<void>
}

const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

function sanitizeConcept(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (trimmed.length === 0 || trimmed.length > 300) return null
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
  app.use('/avatars_generated', express.static(path.join(projectRoot, 'avatars_generated')))

  const promptUpload = multer({
    dest: path.join(projectRoot, 'uploads'),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, VALID_IMAGE_EXTENSIONS.includes(ext))
    },
  })

  app.get('/health', (_req, res) => {
    sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString() })
  })

  const avatarsDir = path.join(projectRoot, 'avatars')
  const generatedAvatarsDir = path.join(projectRoot, 'avatars_generated')

  app.get('/api/avatars', requireAuth, apiLimiter, async (_req, res) => {
    try {
      await fs.mkdir(avatarsDir, { recursive: true })
      await fs.mkdir(generatedAvatarsDir, { recursive: true })

      const [curatedFiles, generatedFiles] = await Promise.all([
        fs.readdir(avatarsDir),
        fs.readdir(generatedAvatarsDir),
      ])

      const filterAndSort = (files: string[]) =>
        files
          .filter((file) => VALID_IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

      const curated = filterAndSort(curatedFiles).map((file) => ({
        name: file,
        filename: file,
        url: `/avatars/${encodeURIComponent(file)}`,
        source: 'curated' as const,
      }))

      const generated = filterAndSort(generatedFiles).map((file) => ({
        name: file,
        filename: file,
        url: `/avatars_generated/${encodeURIComponent(file)}`,
        source: 'generated' as const,
      }))

      sendSuccess(res, { avatars: [...curated, ...generated] })
    } catch (error) {
      console.error('[Error] Failed to list avatars:', error)
      sendError(res, 500, 'Failed to list avatars', 'AVATAR_LIST_FAILED')
    }
  })

  app.post(
    '/api/prompts/generate',
    requireAuth,
    apiLimiter,
    promptUpload.single('referenceImage'),
    async (req: AuthRequest, res) => {
      req.setTimeout(300_000)
      res.setTimeout(300_000)

      const concept = sanitizeConcept(req.body.concept)
      const rawCount = req.body.count ?? PROMPT_GENERATE_DEFAULT
      const count = typeof rawCount === 'string' ? Number.parseInt(rawCount, 10) : rawCount
      const useStream = req.body.stream === true || req.body.stream === 'true'

      if (!concept) {
        sendError(res, 400, 'Concept is required (1-300 characters)', 'INVALID_CONCEPT')
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

      const sendSSE = (event: string, data: unknown) => {
        if (!useStream) return
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }

      if (useStream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
      }

      try {
        let imageInsights: Awaited<ReturnType<typeof analyzeImage>> | undefined
        if (req.file) {
          console.log(`[Vision] Analyzing reference image: ${req.file.originalname}`)
          sendSSE('status', { step: 'analyzing_image', message: 'Analyzing reference image...' })
          imageInsights = await analyzeImage(req.file.path)
          console.log(`[Vision] Image analysis complete: ${imageInsights.style?.slice(0, 80)}`)
        }

        // PHASE 1: Quick first prompt (streaming only)
        let quickPrompt: PromptOutput | undefined
        if (useStream && clampedCount > 0) {
          console.log('[Streaming Phase 1] Generating quick first prompt...')
          sendSSE('status', { step: 'quick_prompt', message: 'Generating preview...' })

          quickPrompt = await generateSinglePrompt(concept, { ...DEFAULT_RESEARCH_BRIEF, concept }, imageInsights)

          sendSSE('prompt', {
            prompt: quickPrompt,
            index: 0,
            total: clampedCount,
            quick: true, // Flag for UI indicator
          })

          console.log('[Streaming Phase 1] Quick prompt sent')
        }

        // PHASE 2: Background research
        console.log('[Streaming Phase 2] Starting research...')
        sendSSE('status', { step: 'research', message: `Researching "${concept}"...` })

        const researchBrief = await performResearch(concept)
        const analysis = analyzeResearchResults(researchBrief)
        console.log(`[Research] ${analysis.summary}`)

        if (analysis.warnings.length > 0) {
          console.log(`[Research] Warnings: ${analysis.warnings.join(', ')}`)
        }

        const research = {
          summary: analysis.summary,
          insights: analysis.keyInsights,
          warnings: analysis.warnings,
          subThemes: researchBrief.sub_themes.map((s) => s.name),
        }

        sendSSE('research', research)
        console.log('[Streaming Phase 2] Research complete')

        // PHASE 3: Generate remaining prompts with research
        const remainingCount = useStream && quickPrompt ? clampedCount - 1 : clampedCount
        console.log(`[Streaming Phase 3] Generating ${remainingCount} enriched prompts...`)

        const { prompts: enrichedPrompts, varietyScore: enrichedVariety } = await generatePrompts(
          concept,
          remainingCount,
          researchBrief,
          (completed, total) => sendSSE('progress', { completed, total }),
          imageInsights,
        )

        // Send enriched prompts individually for streaming
        if (useStream) {
          enrichedPrompts.forEach((prompt, idx) => {
            sendSSE('prompt', {
              prompt,
              index: idx + 1, // Offset by 1 since index 0 is quick prompt
              total: clampedCount,
              enriched: true, // Flag for UI indicator
            })
          })
          console.log(`[Streaming Phase 3] Sent ${enrichedPrompts.length} enriched prompts`)
        }

        // Combine quick + enriched prompts for streaming, or use all enriched for non-streaming
        const prompts = useStream && quickPrompt ? [quickPrompt, ...enrichedPrompts] : enrichedPrompts
        const varietyScore = useStream && quickPrompt ? calculateVarietyScore(prompts) : enrichedVariety

        const validation = validateAllPrompts(prompts)
        if (!validation.allValid) {
          const invalidCount = validation.results.filter((r) => !r.valid).length
          console.log(`[Validation] ${invalidCount} prompts have issues`)
        }

        // Calculate comprehensive quality metrics
        const qualityMetrics = calculatePromptQualityMetrics(prompts as PromptOutput[], 'gpt-4o')

        // Add individual quality scores to each prompt
        prompts.forEach((prompt, i) => {
          prompt.quality_score = qualityMetrics.individual_scores?.[i] ?? qualityMetrics.overall_score
        })

        console.log(
          `[Complete] Generated ${prompts.length} prompts, variety: ${varietyScore.score}/100, quality: ${qualityMetrics.overall_score}/100`,
        )
        console.log(`[Scores] Individual prompt scores: ${prompts.map((p) => p.quality_score).join(', ')}`)

        if (qualityMetrics.issues.length > 0) {
          console.log(`[Quality Issues] ${qualityMetrics.issues.join(', ')}`)
        }
        if (qualityMetrics.strengths.length > 0) {
          console.log(`[Quality Strengths] ${qualityMetrics.strengths.join(', ')}`)
        }

        await addToHistory(req.user!.id, {
          concept,
          prompts,
          promptCount: prompts.length,
          source: 'generated',
          modelUsed: 'gpt-4o',
          varietyScore,
          qualityMetrics,
        })

        span.success({
          generatedCount: prompts.length,
          varietyPassed: varietyScore.passed,
          warningCount: analysis.warnings.length,
        })

        const result = {
          prompts,
          concept,
          count: prompts.length,
          research,
          varietyScore,
          validation: {
            allValid: validation.allValid,
            issues: validation.results.filter((r) => !r.valid),
          },
        }

        if (useStream) {
          sendSSE('done', result)
          res.end()
        } else {
          sendSuccess(res, result)
        }
      } catch (error) {
        console.error('[Error]', error)
        span.error(error)
        if (useStream) {
          sendSSE('error', { message: error instanceof Error ? error.message : 'Unknown error' })
          res.end()
        } else {
          sendError(
            res,
            500,
            'Failed to generate prompts',
            'PROMPT_GENERATION_FAILED',
            error instanceof Error ? error.message : 'Unknown error',
          )
        }
      }
    },
  )

  // GET endpoint for EventSource streaming (Phase 3)
  app.get('/api/prompts/generate', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(300_000)
    res.setTimeout(300_000)

    const concept = sanitizeConcept(req.query.concept as string)
    const rawCount = req.query.count ?? PROMPT_GENERATE_DEFAULT
    const count = typeof rawCount === 'string' ? Number.parseInt(rawCount, 10) : Number(rawCount)
    const useStream = true // GET endpoint is always streaming

    if (!concept) {
      sendError(res, 400, 'Concept is required (1-300 characters)', 'INVALID_CONCEPT')
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
      metadata: { count: clampedCount, conceptLength: concept.length, streaming: true },
    })

    const sendSSE = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    try {
      // PHASE 1: Quick first prompt
      console.log('[Streaming Phase 1] Generating quick first prompt...')
      sendSSE('status', { step: 'quick_prompt', message: 'Generating preview...' })

      const quickPrompt = await generateSinglePrompt(
        concept,
        { ...DEFAULT_RESEARCH_BRIEF, concept },
        undefined, // no image insights for GET
      )

      sendSSE('prompt', {
        prompt: quickPrompt,
        index: 0,
        total: clampedCount,
        quick: true,
      })

      console.log('[Streaming Phase 1] Quick prompt sent')

      // PHASE 2: Background research
      console.log('[Streaming Phase 2] Starting research...')
      sendSSE('status', { step: 'research', message: `Researching "${concept}"...` })

      const researchBrief = await performResearch(concept)
      const analysis = analyzeResearchResults(researchBrief)
      console.log(`[Research] ${analysis.summary}`)

      const research = {
        summary: analysis.summary,
        insights: analysis.keyInsights,
        warnings: analysis.warnings,
        subThemes: researchBrief.sub_themes.map((s) => s.name),
      }

      sendSSE('research', research)
      console.log('[Streaming Phase 2] Research complete')

      // PHASE 3: Generate remaining prompts
      const remainingCount = clampedCount - 1
      console.log(`[Streaming Phase 3] Generating ${remainingCount} enriched prompts...`)

      const { prompts: enrichedPrompts, varietyScore: enrichedVariety } = await generatePrompts(
        concept,
        remainingCount,
        researchBrief,
        (completed, total) => sendSSE('progress', { completed, total }),
        undefined, // no image insights
      )

      // Send enriched prompts
      enrichedPrompts.forEach((prompt, idx) => {
        sendSSE('prompt', {
          prompt,
          index: idx + 1,
          total: clampedCount,
          enriched: true,
        })
      })

      const allPrompts = [quickPrompt, ...enrichedPrompts]
      const varietyScore = calculateVarietyScore(allPrompts)
      const validation = validateAllPrompts(allPrompts)
      const qualityMetrics = calculatePromptQualityMetrics(allPrompts as PromptOutput[], 'gpt-4o')

      // Add quality scores
      allPrompts.forEach((prompt, i) => {
        prompt.quality_score = qualityMetrics.individual_scores?.[i] ?? qualityMetrics.overall_score
      })

      await addToHistory(req.user!.id, {
        concept,
        prompts: allPrompts,
        promptCount: allPrompts.length,
        source: 'generated',
        modelUsed: 'gpt-4o',
        varietyScore,
        qualityMetrics,
      })

      span.success({
        generatedCount: allPrompts.length,
        varietyPassed: varietyScore.passed,
        streaming: true,
      })

      sendSSE('done', {
        varietyScore,
        validation: {
          allValid: validation.allValid,
          issues: validation.results.filter((r) => !r.valid),
        },
      })

      res.end()
    } catch (error) {
      console.error('[Streaming Error]', error)
      span.error(error)
      sendSSE('error', {
        error: 'Failed to generate prompts',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      res.end()
    }
  })

  // New batch endpoint for parallel multi-concept generation
  app.post('/api/prompts/generate-batch', requireAuth, apiLimiter, async (req, res) => {
    const { concepts: rawConcepts } = req.body

    console.log('[Batch] Received request:', {
      conceptsType: typeof rawConcepts,
      isArray: Array.isArray(rawConcepts),
      length: rawConcepts?.length,
    })

    // Validate concepts array
    if (!Array.isArray(rawConcepts) || rawConcepts.length === 0) {
      console.error('[Batch] Invalid concepts array:', rawConcepts)
      sendError(res, 400, 'Concepts must be a non-empty array', 'INVALID_CONCEPTS')
      return
    }

    if (rawConcepts.length > 10) {
      sendError(res, 400, 'Maximum 10 concepts per batch', 'TOO_MANY_CONCEPTS')
      return
    }

    // Validate each concept entry
    const conceptEntries: Array<{ concept: string; count: number }> = []
    let totalPrompts = 0
    for (const entry of rawConcepts) {
      if (!entry || typeof entry !== 'object' || !entry.concept) {
        sendError(res, 400, 'Each concept must have a concept and count field', 'INVALID_CONCEPT_ENTRY')
        return
      }

      const concept = sanitizeConcept(entry.concept)
      if (!concept) continue

      const count = Number.parseInt(entry.count, 10)
      if (!Number.isInteger(count) || count < 1) {
        sendError(res, 400, `Count must be a positive integer for concept: ${concept}`, 'INVALID_COUNT')
        return
      }

      const clampedCount = Math.max(PROMPT_GENERATE_MIN, Math.min(PROMPT_GENERATE_MAX, count))
      conceptEntries.push({ concept, count: clampedCount })
      totalPrompts += clampedCount
    }

    if (conceptEntries.length === 0) {
      sendError(res, 400, 'No valid concepts provided', 'NO_VALID_CONCEPTS')
      return
    }

    const span = createPipelineSpan({
      pipeline: 'prompts.generate_batch',
      userId: req.user?.id,
      metadata: { conceptCount: conceptEntries.length, totalPrompts },
    })

    try {
      // Process each concept independently: research + generate
      console.log(`[Batch] Processing ${conceptEntries.length} concepts sequentially (total ${totalPrompts} prompts)`)

      const prompts: PromptOutput[] = []
      const allResearch: Array<{ concept: string; analysis: any; brief: any }> = []

      for (let i = 0; i < conceptEntries.length; i++) {
        const { concept, count } = conceptEntries[i]
        console.log(`\n[Concept ${i + 1}/${conceptEntries.length}] "${concept}" (${count} prompts)`)

        try {
          // Research for this concept
          console.log(`[Concept ${i + 1}] Research starting...`)
          const researchBrief = await performResearch(concept)
          const analysis = analyzeResearchResults(researchBrief)
          console.log(`[Concept ${i + 1}] Research complete: ${analysis.summary}`)

          if (analysis.warnings.length > 0) {
            console.log(`[Concept ${i + 1}] Warnings: ${analysis.warnings.join(', ')}`)
          }

          // Store research data
          allResearch.push({ concept, analysis, brief: researchBrief })

          // Generate prompts for this concept
          console.log(`[Concept ${i + 1}] Generating ${count} prompts...`)
          const result = await generatePrompts(concept, count, researchBrief)
          console.log(`[Concept ${i + 1}] ✓ Done - Generated ${result.prompts.length} prompts`)
          prompts.push(...result.prompts)
        } catch (error) {
          console.error(`[Concept ${i + 1}] ✗ Failed:`, error)
        }
      }

      console.log(`\n[Batch] Complete: ${prompts.length} total prompts generated`)

      const validation = validateAllPrompts(prompts)
      if (!validation.allValid) {
        const invalidCount = validation.results.filter((r) => !r.valid).length
        console.log(`[Validation] ${invalidCount} prompts have issues`)
      }

      const varietyScore = validateVariety(prompts)

      // Calculate comprehensive quality metrics
      const qualityMetrics = calculatePromptQualityMetrics(prompts as PromptOutput[], 'gpt-4o')

      console.log(
        `[Complete] Generated ${prompts.length} prompts for ${conceptEntries.length} concepts, variety: ${varietyScore.passed ? 'PASS' : 'FAIL'}, quality: ${qualityMetrics.overall_score}/100`,
      )

      if (qualityMetrics.issues.length > 0) {
        console.log(`[Quality Issues] ${qualityMetrics.issues.join(', ')}`)
      }
      if (qualityMetrics.strengths.length > 0) {
        console.log(`[Quality Strengths] ${qualityMetrics.strengths.join(', ')}`)
      }

      await addToHistory(req.user!.id, {
        concept: conceptEntries.map((e) => e.concept).join(', '),
        prompts,
        promptCount: prompts.length,
        source: 'generated',
        modelUsed: 'gpt-4o',
        varietyScore,
        qualityMetrics,
      })

      // Aggregate research data from all concepts
      const research = {
        concepts: allResearch.map((r) => ({
          concept: r.concept,
          summary: r.analysis.summary,
          subThemes: r.brief.sub_themes.map((s: any) => s.name),
        })),
        totalWarnings: allResearch.reduce((sum, r) => sum + r.analysis.warnings.length, 0),
      }

      span.success({
        generatedCount: prompts.length,
        varietyPassed: varietyScore.passed,
        conceptCount: conceptEntries.length,
      })

      sendSuccess(res, {
        prompts,
        concepts: conceptEntries.map((e) => e.concept),
        count: prompts.length,
        research,
        varietyScore,
        qualityMetrics: {
          overall_score: qualityMetrics.overall_score,
          detail_scores: qualityMetrics.detail_scores,
        },
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
        error instanceof Error ? error.message : 'Unknown error',
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
        error instanceof Error ? error.message : 'Unknown error',
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
        error instanceof Error ? error.message : 'Unknown error',
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
  app.use('/api/images', requireAuth, createImageRatingsRouter())

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
