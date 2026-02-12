import path from 'node:path'
import express from 'express'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { PROMPT_GENERATE_DEFAULT, PROMPT_GENERATE_MAX, PROMPT_GENERATE_MIN } from '../../constants/limits.js'
import type { AuthRequest } from '../middleware/auth.js'
import { addToHistory } from '../services/history.js'
import {
  generatePrompts,
  generateSinglePrompt,
  textToPrompt,
  validateAllPrompts,
  validateVariety,
} from '../services/promptGenerator.js'
import { analyzeResearchResults, DEFAULT_RESEARCH_BRIEF, performResearch } from '../services/research.js'
import { createPipelineSpan } from '../services/telemetry.js'
import { analyzeImage } from '../services/vision.js'
import { sendError, sendSuccess } from '../utils/http.js'
import { calculatePromptQualityMetrics } from '../utils/promptScoring.js'
import type { PromptOutput } from '../utils/prompts.js'
import { calculateVarietyScore } from '../utils/prompts.js'

interface PromptsRouterConfig {
  projectRoot: string
}

const VALID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

type StreamEmitter = (event: string, data: unknown) => void

function sanitizeConcept(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (trimmed.length === 0 || trimmed.length > 300) return null
  return trimmed.replace(/[<>{}]/g, '')
}

async function runPromptGenerationPipeline({
  concept,
  count,
  userId,
  imagePath,
  imageName,
  emit,
}: {
  concept: string
  count: number
  userId: number | undefined
  imagePath?: string
  imageName?: string
  emit?: StreamEmitter
}) {
  if (!userId) {
    throw new Error('Authenticated user is required')
  }

  let imageInsights: Awaited<ReturnType<typeof analyzeImage>> | undefined
  if (imagePath) {
    console.log(`[Vision] Analyzing reference image: ${imageName || imagePath}`)
    emit?.('status', { step: 'analyzing_image', message: 'Analyzing reference image...' })
    imageInsights = await analyzeImage(imagePath)
    console.log(`[Vision] Image analysis complete: ${imageInsights.style?.slice(0, 80)}`)
  }

  let quickPrompt: PromptOutput | undefined
  if (emit && count > 0) {
    console.log('[Streaming Phase 1] Generating quick first prompt...')
    emit('status', { step: 'quick_prompt', message: 'Generating preview...' })

    quickPrompt = await generateSinglePrompt(concept, { ...DEFAULT_RESEARCH_BRIEF, concept }, imageInsights)

    emit('prompt', {
      prompt: quickPrompt,
      index: 0,
      total: count,
      quick: true,
    })

    console.log('[Streaming Phase 1] Quick prompt sent')
  }

  console.log('[Streaming Phase 2] Starting research...')
  emit?.('status', { step: 'research', message: `Researching "${concept}"...` })

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

  emit?.('research', research)
  console.log('[Streaming Phase 2] Research complete')

  const remainingCount = emit && quickPrompt ? count - 1 : count
  console.log(`[Streaming Phase 3] Generating ${remainingCount} enriched prompts...`)

  const { prompts: enrichedPrompts, varietyScore: enrichedVariety } = await generatePrompts(
    concept,
    remainingCount,
    researchBrief,
    emit ? (completed, total) => emit('progress', { completed, total }) : undefined,
    imageInsights,
  )

  if (emit) {
    enrichedPrompts.forEach((prompt, idx) => {
      emit('prompt', {
        prompt,
        index: idx + 1,
        total: count,
        enriched: true,
      })
    })
    console.log(`[Streaming Phase 3] Sent ${enrichedPrompts.length} enriched prompts`)
  }

  const prompts = emit && quickPrompt ? [quickPrompt, ...enrichedPrompts] : enrichedPrompts
  const varietyScore = emit && quickPrompt ? calculateVarietyScore(prompts) : enrichedVariety

  const validation = validateAllPrompts(prompts)
  if (!validation.allValid) {
    const invalidCount = validation.results.filter((r) => !r.valid).length
    console.log(`[Validation] ${invalidCount} prompts have issues`)
  }

  const qualityMetrics = calculatePromptQualityMetrics(prompts as PromptOutput[], 'gpt-4o')

  prompts.forEach((prompt, i) => {
    prompt.quality_score = qualityMetrics.individual_scores?.[i] ?? qualityMetrics.overall_score
  })

  console.log(
    `[Complete] Generated ${prompts.length} prompts, variety: ${varietyScore.score}/100, quality: ${qualityMetrics.overall_score}/100`,
  )

  await addToHistory(userId, {
    concept,
    prompts,
    promptCount: prompts.length,
    source: 'generated',
    modelUsed: 'gpt-4o',
    varietyScore,
    qualityMetrics,
  })

  return {
    prompts,
    research,
    varietyScore,
    validation,
    qualityMetrics,
    warningCount: analysis.warnings.length,
  }
}

export function createPromptsRouter(config: PromptsRouterConfig): express.Router {
  const router = express.Router()

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(res, 429, 'Too many requests, please try again later', 'RATE_LIMITED')
    },
  })

  const promptUpload = multer({
    dest: path.join(config.projectRoot, 'uploads'),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, VALID_IMAGE_EXTENSIONS.includes(ext))
    },
  })

  router.post('/generate', apiLimiter, promptUpload.single('referenceImage'), async (req: AuthRequest, res) => {
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
      metadata: {
        count: clampedCount,
        conceptLength: concept.length,
        stream: useStream,
        hasReferenceImage: !!req.file,
      },
    })

    const emit: StreamEmitter | undefined = useStream
      ? (event, data) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        }
      : undefined

    if (useStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
    }

    try {
      const result = await runPromptGenerationPipeline({
        concept,
        count: clampedCount,
        userId: req.user?.id,
        imagePath: req.file?.path,
        imageName: req.file?.originalname,
        emit,
      })

      span.success({
        generatedCount: result.prompts.length,
        varietyPassed: result.varietyScore.passed,
        warningCount: result.warningCount,
      })

      const payload = {
        prompts: result.prompts,
        concept,
        count: result.prompts.length,
        research: result.research,
        varietyScore: result.varietyScore,
        validation: {
          allValid: result.validation.allValid,
          issues: result.validation.results.filter((r) => !r.valid),
        },
      }

      if (useStream) {
        emit?.('done', payload)
        res.end()
      } else {
        sendSuccess(res, payload)
      }
    } catch (error) {
      console.error('[Prompts] Generation failed:', error)
      span.error(error)
      if (useStream) {
        emit?.('error', { message: error instanceof Error ? error.message : 'Unknown error' })
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
  })

  router.get('/generate', apiLimiter, async (req: AuthRequest, res) => {
    req.setTimeout(300_000)
    res.setTimeout(300_000)

    const concept = sanitizeConcept(req.query.concept as string)
    const rawCount = req.query.count ?? PROMPT_GENERATE_DEFAULT
    const count = typeof rawCount === 'string' ? Number.parseInt(rawCount, 10) : Number(rawCount)

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
      metadata: { count: clampedCount, conceptLength: concept.length, stream: true },
    })

    const emit: StreamEmitter = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    try {
      const result = await runPromptGenerationPipeline({
        concept,
        count: clampedCount,
        userId: req.user?.id,
        emit,
      })

      span.success({
        generatedCount: result.prompts.length,
        varietyPassed: result.varietyScore.passed,
        warningCount: result.warningCount,
        stream: true,
      })

      emit('done', {
        varietyScore: result.varietyScore,
        qualityMetrics: result.qualityMetrics,
        individualScores: result.qualityMetrics.individual_scores || [],
        validation: {
          allValid: result.validation.allValid,
          issues: result.validation.results.filter((r) => !r.valid),
        },
      })

      res.end()
    } catch (error) {
      console.error('[Prompts] Streaming generation failed:', error)
      span.error(error)
      emit('error', {
        error: 'Failed to generate prompts',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      res.end()
    }
  })

  router.post('/generate-batch', apiLimiter, async (req: AuthRequest, res) => {
    const { concepts: rawConcepts } = req.body

    if (!Array.isArray(rawConcepts) || rawConcepts.length === 0) {
      sendError(res, 400, 'Concepts must be a non-empty array', 'INVALID_CONCEPTS')
      return
    }

    if (rawConcepts.length > 10) {
      sendError(res, 400, 'Maximum 10 concepts per batch', 'TOO_MANY_CONCEPTS')
      return
    }

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
      const prompts: PromptOutput[] = []
      const allResearch: Array<{
        concept: string
        analysis: ReturnType<typeof analyzeResearchResults>
        brief: Awaited<ReturnType<typeof performResearch>>
      }> = []

      for (let i = 0; i < conceptEntries.length; i++) {
        const { concept, count } = conceptEntries[i]
        console.log(`[Batch][${i + 1}/${conceptEntries.length}] ${concept} (${count} prompts)`)

        try {
          const researchBrief = await performResearch(concept)
          const analysis = analyzeResearchResults(researchBrief)
          allResearch.push({ concept, analysis, brief: researchBrief })

          const result = await generatePrompts(concept, count, researchBrief)
          prompts.push(...result.prompts)
        } catch (error) {
          console.error(`[Batch][${i + 1}] Failed for concept "${concept}":`, error)
        }
      }

      const validation = validateAllPrompts(prompts)
      const varietyScore = validateVariety(prompts)
      const qualityMetrics = calculatePromptQualityMetrics(prompts as PromptOutput[], 'gpt-4o')

      await addToHistory(req.user!.id, {
        concept: conceptEntries.map((e) => e.concept).join(', '),
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
        conceptCount: conceptEntries.length,
      })

      sendSuccess(res, {
        prompts,
        concepts: conceptEntries.map((e) => e.concept),
        count: prompts.length,
        research: {
          concepts: allResearch.map((r) => ({
            concept: r.concept,
            summary: r.analysis.summary,
            subThemes: r.brief.sub_themes.map((s) => s.name),
          })),
          totalWarnings: allResearch.reduce((sum, r) => sum + r.analysis.warnings.length, 0),
        },
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
      console.error('[Prompts] Batch generation failed:', error)
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

  router.get('/research/:concept', apiLimiter, async (req, res) => {
    const concept = sanitizeConcept(req.params.concept)

    if (!concept) {
      sendError(res, 400, 'Invalid concept (1-100 characters)', 'INVALID_CONCEPT')
      return
    }

    try {
      const researchBrief = await performResearch(concept)
      const analysis = analyzeResearchResults(researchBrief)
      sendSuccess(res, { research: researchBrief, analysis })
    } catch (error) {
      console.error('[Prompts] Research failed:', error)
      sendError(
        res,
        500,
        'Failed to perform research',
        'RESEARCH_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  router.post('/text-to-json', apiLimiter, async (req, res) => {
    const text = req.body.text
    const preserveOriginal = req.body.preserveOriginal === true

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      sendError(res, 400, 'Text description is required', 'INVALID_TEXT')
      return
    }

    if (text.length > 2000) {
      sendError(res, 400, 'Text too long (max 2000 characters)', 'INVALID_TEXT')
      return
    }

    try {
      const prompt = await textToPrompt(text.trim(), preserveOriginal)
      sendSuccess(res, { prompt })
    } catch (error) {
      console.error('[Prompts] Text-to-json failed:', error)
      sendError(
        res,
        500,
        'Failed to convert text to prompt',
        'TEXT_TO_PROMPT_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  return router
}
