import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import OpenAI from 'openai'
import { sendError, sendSuccess } from '../utils/http.js'

const COMPETITOR_REPORT_MODEL = process.env.COMPETITOR_REPORT_MODEL || 'gpt-4o-mini'
const CLONE_AI_ADS_LIBRARY_URL =
  'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc&view_all_page_id=116040404815178'

interface CompetitorApp {
  id: string
  name: string
  adsLibraryUrl: string
}

const SUPPORTED_APPS: CompetitorApp[] = [
  {
    id: 'clone_ai',
    name: 'Clone AI',
    adsLibraryUrl: CLONE_AI_ADS_LIBRARY_URL,
  },
]

interface WeeklyCreativeRow {
  title: string
  hook: string
  creative_angle: string
  format: string
  platform: string
  detected_date: string
  why_it_works: string
  source_url: string
}

interface WeeklyReportPayload {
  app: string
  window: {
    label: string
    start_date: string
    end_date: string
  }
  executive_summary: string
  trend_signals: string[]
  creative_patterns: string[]
  top_creatives: WeeklyCreativeRow[]
  opportunities_next_week: string[]
  data_gaps: string[]
}

function toISODate(input: Date): string {
  return input.toISOString().split('T')[0]
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as UnknownRecord
}

function toStringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || fallback
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => toStringValue(entry)).filter(Boolean)
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseIsoDateOnly(value: string): Date | null {
  if (!ISO_DATE_PATTERN.test(value)) return null
  const [y, m, d] = value.split('-').map((item) => Number.parseInt(item, 10))
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}

export function isSafeHttpUrl(value: string): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function sanitizeHttpUrl(value: string): string {
  return isSafeHttpUrl(value) ? value : ''
}

function normalizeCreativeRow(value: unknown): WeeklyCreativeRow | null {
  const row = asRecord(value)
  if (!row) return null
  return {
    title: toStringValue(row.title, 'Untitled Creative'),
    hook: toStringValue(row.hook),
    creative_angle: toStringValue(row.creative_angle),
    format: toStringValue(row.format),
    platform: toStringValue(row.platform),
    detected_date: toStringValue(row.detected_date, 'unknown'),
    why_it_works: toStringValue(row.why_it_works),
    source_url: sanitizeHttpUrl(toStringValue(row.source_url)),
  }
}

export function normalizeWeeklyReportPayload(raw: unknown, fallback: WeeklyReportPayload): WeeklyReportPayload {
  const parsed = asRecord(raw)
  const startDate = parseIsoDateOnly(fallback.window.start_date)
  const endDate = parseIsoDateOnly(fallback.window.end_date)

  const rawRows = parsed ? parsed.top_creatives : null
  const candidateRows = Array.isArray(rawRows) ? rawRows : []
  let skippedMissingDate = 0
  let skippedOutOfRange = 0

  const filteredRows: WeeklyCreativeRow[] = []
  for (const item of candidateRows) {
    const normalizedRow = normalizeCreativeRow(item)
    if (!normalizedRow) continue
    const detectedDate = parseIsoDateOnly(normalizedRow.detected_date)
    if (!detectedDate || !startDate || !endDate) {
      skippedMissingDate += 1
      continue
    }
    if (detectedDate < startDate || detectedDate > endDate) {
      skippedOutOfRange += 1
      continue
    }
    filteredRows.push(normalizedRow)
  }

  const dataGaps = toStringArray(parsed?.data_gaps)
  if (skippedMissingDate > 0) {
    dataGaps.push(`${skippedMissingDate} creatives skipped due to missing or invalid detected_date.`)
  }
  if (skippedOutOfRange > 0) {
    dataGaps.push(`${skippedOutOfRange} creatives skipped because they were outside the last 7-day window.`)
  }

  return {
    app: toStringValue(parsed?.app, fallback.app),
    window: {
      // Keep backend-authoritative window values.
      label: fallback.window.label,
      start_date: fallback.window.start_date,
      end_date: fallback.window.end_date,
    },
    executive_summary: toStringValue(parsed?.executive_summary, fallback.executive_summary),
    trend_signals: toStringArray(parsed?.trend_signals),
    creative_patterns: toStringArray(parsed?.creative_patterns),
    top_creatives: filteredRows,
    opportunities_next_week: toStringArray(parsed?.opportunities_next_week),
    data_gaps: uniqueStrings(dataGaps),
  }
}

function collectSourceUrlsFromResponse(response: OpenAI.Responses.Response): string[] {
  const urls = new Set<string>()

  for (const item of response.output ?? []) {
    if (item.type === 'web_search_call') {
      const sources = (item.action as { sources?: Array<{ url?: string }> } | undefined)?.sources ?? []
      for (const source of sources) {
        if (source?.url) urls.add(source.url)
      }
      continue
    }

    if (item.type !== 'message') continue
    for (const content of item.content ?? []) {
      if (content.type !== 'output_text') continue
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === 'url_citation' && annotation.url) urls.add(annotation.url)
      }
    }
  }

  return Array.from(urls).filter(isSafeHttpUrl)
}

function safeJsonParse<T>(input: string, fallback: T): T {
  const trimmed = input.trim()
  if (!trimmed) return fallback

  if (trimmed.startsWith('```')) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]) as T
      } catch {
        // fall through
      }
    }
  }

  try {
    return JSON.parse(trimmed) as T
  } catch {
    // Recover from non-JSON wrappers (markdown, prose before/after object).
    const firstBrace = trimmed.indexOf('{')
    if (firstBrace >= 0) {
      let depth = 0
      let end = -1
      for (let i = firstBrace; i < trimmed.length; i += 1) {
        const ch = trimmed[i]
        if (ch === '{') depth += 1
        if (ch === '}') {
          depth -= 1
          if (depth === 0) {
            end = i
            break
          }
        }
      }
      if (end > firstBrace) {
        const candidate = trimmed.slice(firstBrace, end + 1)
        try {
          return JSON.parse(candidate) as T
        } catch {
          return fallback
        }
      }
    }
    return fallback
  }
}

function fallbackReport(appName: string, startDate: string, endDate: string): WeeklyReportPayload {
  return {
    app: appName,
    window: {
      label: 'Last 7 days',
      start_date: startDate,
      end_date: endDate,
    },
    executive_summary:
      'No grounded competitor report could be generated right now. Try again in a minute to refresh live sources.',
    trend_signals: [],
    creative_patterns: [],
    top_creatives: [],
    opportunities_next_week: [],
    data_gaps: ['Live source retrieval failed or returned insufficient public data.'],
  }
}

export function createCompetitorReportRouter(): Router {
  const router = Router()
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(res, 429, 'Too many requests, please try again later', 'RATE_LIMITED')
    },
  })

  router.get('/apps', (_req, res) => {
    sendSuccess(res, { apps: SUPPORTED_APPS })
  })

  router.post('/weekly', limiter, async (req, res) => {
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      sendError(res, 500, 'OPENAI_API_KEY is missing', 'OPENAI_KEY_MISSING')
      return
    }

    const requestedAppId = typeof req.body?.appId === 'string' ? req.body.appId.trim() : 'clone_ai'
    const app = SUPPORTED_APPS.find((entry) => entry.id === requestedAppId) ?? SUPPORTED_APPS[0]
    const now = new Date()
    const weekAgo = new Date(now)
    weekAgo.setUTCDate(now.getUTCDate() - 7)

    const startDate = toISODate(weekAgo)
    const endDate = toISODate(now)

    const client = new OpenAI({
      apiKey: openaiApiKey,
      timeout: 120000,
      maxRetries: 2,
    })

    const fallback = fallbackReport(app.name, startDate, endDate)

    try {
      const response = await client.responses.create({
        model: COMPETITOR_REPORT_MODEL,
        instructions:
          'You are a senior creative strategist producing competitor ad intelligence for growth teams. Use live web search and return strict JSON.',
        input: `Create a competitor report for ${app.name} focused on creatives from the last 7 days.

Target window:
- Start date: ${startDate}
- End date: ${endDate}

Primary source (must be prioritized):
- ${app.adsLibraryUrl}

Output requirements:
- Keep claims grounded to publicly available sources.
- Prefer ad creatives with concrete hooks and visual patterns.
- If an item date is unclear, mark detected_date as "unknown".
- Use concise, actionable language for creative teams.

Return JSON using this exact schema:
{
  "app": "${app.name}",
  "window": {
    "label": "Last 7 days",
    "start_date": "${startDate}",
    "end_date": "${endDate}"
  },
  "executive_summary": "string",
  "trend_signals": ["string", "string"],
  "creative_patterns": ["string", "string"],
  "top_creatives": [
    {
      "title": "string",
      "hook": "string",
      "creative_angle": "string",
      "format": "string",
      "platform": "string",
      "detected_date": "YYYY-MM-DD or unknown",
      "why_it_works": "string",
      "source_url": "https://..."
    }
  ],
  "opportunities_next_week": ["string", "string"],
  "data_gaps": ["string"]
}`,
        include: ['web_search_call.action.sources'],
        tools: [
          {
            type: 'web_search_preview',
            search_context_size: 'high',
            user_location: { type: 'approximate', country: 'US' },
          },
        ],
        temperature: 0.1,
      })

      const parsed = safeJsonParse<WeeklyReportPayload>(response.output_text?.trim() || '', fallback)
      const normalizedReport = normalizeWeeklyReportPayload(parsed, fallback)
      const sourceUrls = uniqueStrings(collectSourceUrlsFromResponse(response))

      sendSuccess(res, {
        app,
        report: normalizedReport,
        grounding: {
          sourceCount: sourceUrls.length,
          sourceUrls,
          model: COMPETITOR_REPORT_MODEL,
        },
        generatedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error('[CompetitorReport] weekly generation failed:', error)
      sendError(
        res,
        500,
        'Failed to generate competitor report',
        'COMPETITOR_REPORT_FAILED',
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  })

  return router
}
