import OpenAI from 'openai'
import { getDb } from '../db/index.js'
import type {
  CompetitorInsights,
  ResearchBrief,
  SubTheme,
  TechnicalRecommendations,
  TrendFindings,
} from '../utils/prompts.js'

export type ResearchMode = 'web' | 'model'

export interface PerformResearchOptions {
  mode?: ResearchMode
  forceRefresh?: boolean
}

export interface ResearchGroundingMeta {
  requested_mode: ResearchMode
  effective_mode: ResearchMode
  keyword_count: number
  cache_hits: number
  cache_misses: number
  cache_hit_rate: number
  source_count: number
  source_domains: string[]
  source_urls: string[]
  grounding_score: number
  used_web_search: boolean
}

export interface PerformResearchWithMetaResult {
  brief: ResearchBrief
  meta: ResearchGroundingMeta
}

let openaiClient: OpenAI | null = null
let clientInitializing = false

async function getOpenAI(): Promise<OpenAI> {
  if (openaiClient) return openaiClient
  if (clientInitializing) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    return getOpenAI()
  }
  clientInitializing = true
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000,
    maxRetries: 2,
  })
  clientInitializing = false
  return openaiClient
}

function safeJsonParse<T>(content: string, fallback: T): T {
  const trimmed = content.trim()
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
          // keep fallback path
        }
      }
    }
    console.error('[JSON Parse Error] Failed to parse:', trimmed.substring(0, 200))
    return fallback
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
        if (annotation.type === 'url_citation' && annotation.url) {
          urls.add(annotation.url)
        }
      }
    }
  }

  return Array.from(urls)
}

const COMPETITOR_SOURCES: Array<{ name: string; adLibraryUrl: string }> = [
  {
    name: 'Hula AI',
    adLibraryUrl:
      'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc&view_all_page_id=556261627563366',
  },
  {
    name: 'Momo AI',
    adLibraryUrl:
      'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc&view_all_page_id=181173318409135',
  },
  {
    name: 'Glam AI',
    adLibraryUrl:
      'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc&view_all_page_id=157857514084118',
  },
  {
    name: 'AI Video Generator',
    adLibraryUrl:
      'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc&view_all_page_id=268157579716660',
  },
  {
    name: 'Remini',
    adLibraryUrl:
      'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=TR&is_targeted_country=false&media_type=all&q=remini&search_type=keyword_unordered&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc',
  },
  {
    name: 'Creati',
    adLibraryUrl:
      'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc&view_all_page_id=642373455636175',
  },
  {
    name: 'Pose',
    adLibraryUrl:
      'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc&view_all_page_id=656268574243687',
  },
]

const COMPETITOR_NAMES = COMPETITOR_SOURCES.map((entry) => entry.name)
const COMPETITOR_SOURCE_LINES = COMPETITOR_SOURCES.map((entry) => `- ${entry.name}: ${entry.adLibraryUrl}`).join('\n')

const DEFAULT_TRENDS: TrendFindings = {
  trending_aesthetics: ['Editorial', 'Lifestyle', 'Minimal', 'Fashion-forward'],
  color_palettes: ['Warm tones', 'Neutral palette', 'Bold colors'],
  outfit_trends: ['Modern casual', 'Elegant formal', 'Trendy streetwear'],
  set_design_trends: ['Studio backdrop', 'Natural environment', 'Urban setting'],
}

const DEFAULT_COMPETITORS: CompetitorInsights = {
  active_competitors: ['Glam AI', 'Momo', 'Remini'],
  common_patterns: ['Portrait focus', 'Bright lighting', 'Clean backgrounds'],
  differentiation_opportunities: ['Unique aesthetics', 'Novel compositions', 'Creative lighting'],
}

const DEFAULT_TECHNICAL: TechnicalRecommendations = {
  lens_options: ['85mm for portraits', '50mm for environmental', '35mm for context'],
  lighting_styles: ['Natural window light', 'Soft studio lighting', 'Dramatic shadows'],
  color_grades: ['Warm and inviting', 'Cool and modern', 'Film-like tones'],
  notes: 'Choose based on concept mood',
}

const RESEARCH_WEB_ENABLED = process.env.RESEARCH_WEB_ENABLED !== 'false'
const RESEARCH_WEB_MODEL = process.env.RESEARCH_WEB_MODEL || 'gpt-4o-mini'

function resolveResearchMode(mode?: ResearchMode): ResearchMode {
  if (mode === 'model') return 'model'
  if (mode === 'web') return 'web'
  return RESEARCH_WEB_ENABLED ? 'web' : 'model'
}

function cacheKeyFor(keyword: string, mode: ResearchMode): string {
  return `${mode}::${keyword}`
}

function uniqueStrings(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).filter(Boolean)))
}

function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function calculateGroundingScore(sourceCount: number, domainCount: number): number {
  const sourceComponent = Math.min(70, sourceCount * 5)
  const domainComponent = Math.min(30, domainCount * 6)
  return Math.max(0, Math.min(100, Math.round(sourceComponent + domainComponent)))
}

/**
 * Default research brief for quick prompt generation (Phase 3: Streaming UX)
 * Used to generate first prompt immediately without waiting for research
 */
export const DEFAULT_RESEARCH_BRIEF: ResearchBrief = {
  concept: '',
  research_date: new Date().toISOString().split('T')[0],
  sources_analyzed: 0,
  trend_findings: DEFAULT_TRENDS,
  competitor_insights: DEFAULT_COMPETITORS,
  technical_recommendations: DEFAULT_TECHNICAL,
  sub_themes: [
    {
      name: 'Classic Portrait',
      aesthetic: 'Editorial',
      mood: 'Professional and polished',
      key_elements: ['Clean background', 'Soft lighting', 'Natural pose'],
    },
    {
      name: 'Lifestyle Moment',
      aesthetic: 'Lifestyle',
      mood: 'Authentic and relatable',
      key_elements: ['Natural environment', 'Candid expression', 'Warm tones'],
    },
  ],
}

/**
 * Perform research with cache-first strategy (Phase 1)
 * - Checks cache for each keyword
 * - Only researches missing keywords
 * - Merges cached + fresh results
 */
export async function performResearch(concept: string, options?: PerformResearchOptions): Promise<ResearchBrief> {
  const result = await performResearchWithMeta(concept, options)
  return result.brief
}

export async function performResearchWithMeta(
  concept: string,
  options?: PerformResearchOptions,
): Promise<PerformResearchWithMetaResult> {
  const mode = resolveResearchMode(options?.mode)
  const keywords = extractCacheableKeywords(concept)
  const sourceUrlSet = new Set<string>()

  if (options?.forceRefresh) {
    const { brief, sourceUrls, effectiveMode } = await performFreshResearch(concept, mode)
    const sourceDomains = uniqueStrings(sourceUrls.map(domainFromUrl).filter((domain): domain is string => !!domain))
    return {
      brief,
      meta: {
        requested_mode: mode,
        effective_mode: effectiveMode,
        keyword_count: keywords.length || 1,
        cache_hits: 0,
        cache_misses: keywords.length || 1,
        cache_hit_rate: 0,
        source_count: sourceUrls.length,
        source_domains: sourceDomains,
        source_urls: sourceUrls,
        grounding_score: calculateGroundingScore(sourceUrls.length, sourceDomains.length),
        used_web_search: effectiveMode === 'web',
      },
    }
  }

  if (keywords.length === 0) {
    console.log('[Research] No valid keywords, using fallback')
    const { brief, sourceUrls, effectiveMode } = await performFreshResearch(concept, mode)
    const sourceDomains = uniqueStrings(sourceUrls.map(domainFromUrl).filter((domain): domain is string => !!domain))
    return {
      brief,
      meta: {
        requested_mode: mode,
        effective_mode: effectiveMode,
        keyword_count: 1,
        cache_hits: 0,
        cache_misses: 1,
        cache_hit_rate: 0,
        source_count: sourceUrls.length,
        source_domains: sourceDomains,
        source_urls: sourceUrls,
        grounding_score: calculateGroundingScore(sourceUrls.length, sourceDomains.length),
        used_web_search: effectiveMode === 'web',
      },
    }
  }

  console.log(`[Research] Keywords extracted (${mode}): ${keywords.join(', ')}`)

  // Phase 1: Check cache
  const { cached, missing } = await lookupCachedResearch(keywords, mode)

  console.log(`[Research] Cache status: ${cached.size}/${keywords.length} hits, ${missing.length} missing`)
  for (const entry of cached.values()) {
    for (const url of entry.source_urls || []) {
      sourceUrlSet.add(url)
    }
  }

  // Phase 2: Research missing keywords only
  const freshData = new Map<string, CachedResearchData>()
  const effectiveModes = new Set<ResearchMode>()

  if (missing.length > 0) {
    console.log(`[Research] Researching missing keywords: ${missing.join(', ')}`)

    for (const keyword of missing) {
      const data = await researchSingleKeyword(keyword, mode)
      freshData.set(keyword, data)
      for (const url of data.source_urls || []) {
        sourceUrlSet.add(url)
      }
      effectiveModes.add(data.actual_mode)

      if (data.actual_mode === mode) {
        await cacheResearchResults(keyword, data, data.source_urls, mode)
      } else {
        console.warn(
          `[Research] Skipping cache write for "${keyword}" in ${mode} mode because provider fell back to ${data.actual_mode}`,
        )
      }
    }
  }

  // Phase 3: Merge all sources
  const allSources = new Map([...cached, ...freshData])
  const merged = mergeResearchData(allSources, concept)

  // Phase 4: Generate sub-themes from merged data
  const client = await getOpenAI()
  const subThemes = await generateSubThemes(client, concept, merged.trend_findings, merged.competitor_insights)

  const sourceUrls = uniqueStrings(sourceUrlSet)
  const sourceDomains = uniqueStrings(sourceUrls.map(domainFromUrl).filter((domain): domain is string => !!domain))
  const effectiveMode: ResearchMode =
    mode === 'web' && (effectiveModes.has('web') || sourceUrls.length > 0) ? 'web' : 'model'

  return {
    brief: {
      ...merged,
      sub_themes: subThemes,
    },
    meta: {
      requested_mode: mode,
      effective_mode: effectiveMode,
      keyword_count: keywords.length,
      cache_hits: cached.size,
      cache_misses: missing.length,
      cache_hit_rate: keywords.length > 0 ? cached.size / keywords.length : 0,
      source_count: sourceUrls.length,
      source_domains: sourceDomains,
      source_urls: sourceUrls,
      grounding_score: calculateGroundingScore(sourceUrls.length, sourceDomains.length),
      used_web_search: effectiveMode === 'web',
    },
  }
}

/**
 * Research a single keyword (used for cache misses)
 * Uses web-grounded synthesis in web mode, model-only synthesis in model mode
 */
async function researchSingleKeyword(
  keyword: string,
  mode: ResearchMode,
): Promise<CachedResearchData & { source_urls?: string[]; actual_mode: ResearchMode }> {
  const client = await getOpenAI()

  if (mode === 'web') {
    const [trendFindings, competitorInsights, technicalRecommendations] = await Promise.all([
      researchTrendsWeb(client, keyword),
      researchCompetitorsWeb(client, keyword),
      researchTechnicalWeb(client, keyword),
    ])

    const sourceUrls = uniqueStrings([
      ...trendFindings.sourceUrls,
      ...competitorInsights.sourceUrls,
      ...technicalRecommendations.sourceUrls,
    ])
    const actualMode: ResearchMode =
      trendFindings.fromWeb || competitorInsights.fromWeb || technicalRecommendations.fromWeb ? 'web' : 'model'

    return {
      trend_findings: trendFindings.data,
      competitor_insights: competitorInsights.data,
      technical_recommendations: technicalRecommendations.data,
      source_urls: sourceUrls,
      actual_mode: actualMode,
    }
  }

  const [trendFindings, competitorInsights, technicalRecommendations] = await Promise.all([
    researchTrends(client, keyword),
    researchCompetitors(client, keyword),
    researchTechnical(client, keyword),
  ])

  return {
    trend_findings: trendFindings,
    competitor_insights: competitorInsights,
    technical_recommendations: technicalRecommendations,
    source_urls: [],
    actual_mode: 'model',
  }
}

/**
 * Perform fresh research without cache (fallback)
 */
async function performFreshResearch(
  concept: string,
  mode: ResearchMode,
): Promise<{ brief: ResearchBrief; sourceUrls: string[]; effectiveMode: ResearchMode }> {
  const client = await getOpenAI()
  const single = await researchSingleKeyword(concept, mode)
  const subThemes = await generateSubThemes(client, concept, single.trend_findings, single.competitor_insights)
  const sourceUrls = uniqueStrings(single.source_urls || [])
  const sourceCount = sourceUrls.length > 0 ? sourceUrls.length : 12

  return {
    brief: {
      concept,
      research_date: new Date().toISOString().split('T')[0],
      sources_analyzed: sourceCount,
      trend_findings: single.trend_findings,
      competitor_insights: single.competitor_insights,
      technical_recommendations: single.technical_recommendations,
      sub_themes: subThemes,
    },
    sourceUrls,
    effectiveMode: single.actual_mode,
  }
}

interface GroundedResearchResult<T> {
  data: T
  sourceUrls: string[]
  fromWeb: boolean
}

async function runWebGroundedResearch<T>(
  client: OpenAI,
  options: {
    label: string
    instructions: string
    input: string
    fallback: T
  },
): Promise<GroundedResearchResult<T>> {
  if (!RESEARCH_WEB_ENABLED) {
    return { data: options.fallback, sourceUrls: [], fromWeb: false }
  }

  try {
    const response = await client.responses.create({
      model: RESEARCH_WEB_MODEL,
      instructions: options.instructions,
      input: options.input,
      include: ['web_search_call.action.sources'],
      tools: [
        {
          type: 'web_search_preview',
          search_context_size: 'high',
          user_location: {
            type: 'approximate',
            country: 'US',
          },
        },
      ],
      temperature: 0.2,
    })

    const content = response.output_text?.trim()
    if (!content) throw new Error('Empty web-grounded response')

    const parsed = safeJsonParse(content, options.fallback)
    const sourceUrls = collectSourceUrlsFromResponse(response)
    console.log(
      `[Research][Web] ${options.label} completed with ${sourceUrls.length} source(s) using model ${RESEARCH_WEB_MODEL}`,
    )
    return { data: parsed, sourceUrls, fromWeb: true }
  } catch (error) {
    console.warn(
      `[Research][Web] ${options.label} failed; falling back to model-only synthesis:`,
      error instanceof Error ? error.message : error,
    )
    return { data: options.fallback, sourceUrls: [], fromWeb: false }
  }
}

async function researchTrendsWeb(client: OpenAI, concept: string): Promise<GroundedResearchResult<TrendFindings>> {
  const fallback = await researchTrends(client, concept)
  return runWebGroundedResearch(client, {
    label: 'trends',
    instructions:
      'You are a trend research analyst specializing in photography and visual marketing. Use live web search results and return JSON only.',
    input: `Research current visual trends for a photoshoot combining these elements: ${concept}

IMPORTANT: If multiple keywords/elements are provided (comma-separated), ensure EACH element is represented in your research.

Consider:
- Pinterest aesthetic trends
- Editorial photography styles
- Fashion and outfit trends
- Color palette trends
- Set design and backdrop trends

Return strict JSON:
{
  "trending_aesthetics": ["aesthetic1", "aesthetic2"],
  "color_palettes": ["palette1", "palette2"],
  "outfit_trends": ["outfit1", "outfit2"],
  "set_design_trends": ["trend1", "trend2"]
}

Be specific and current. No generic answers.`,
    fallback,
  })
}

async function researchCompetitorsWeb(
  client: OpenAI,
  concept: string,
): Promise<GroundedResearchResult<CompetitorInsights>> {
  const fallback = await researchCompetitors(client, concept)
  return runWebGroundedResearch(client, {
    label: 'competitors',
    instructions: `You are a competitive intelligence analyst specializing in AI photo apps and performance marketing. You analyze live market signals from sources like Meta Ad Library, App Store creatives, and social media ads from competitors such as: ${COMPETITOR_NAMES.join(', ')}. Use live web search and return JSON only.`,
    input: `Analyze how AI photo app competitors are marketing content themed around: ${concept}

IMPORTANT: If multiple keywords/elements are provided (comma-separated), analyze competitor activity for EACH element and find patterns across all of them.

Use these competitor seed sources as priority:
${COMPETITOR_SOURCE_LINES}

Return strict JSON:
{
  "active_competitors": ["competitor1", "competitor2"],
  "common_patterns": ["pattern1", "pattern2"],
  "differentiation_opportunities": ["opportunity1", "opportunity2"]
}

Be specific about visual elements and hooks, not vague marketing speak.`,
    fallback,
  })
}

async function researchTechnicalWeb(
  client: OpenAI,
  concept: string,
): Promise<GroundedResearchResult<TechnicalRecommendations>> {
  const fallback = await researchTechnical(client, concept)
  return runWebGroundedResearch(client, {
    label: 'technical',
    instructions:
      'You are a professional photographer and cinematographer. Use live web search results to recommend practical technical choices and return JSON only.',
    input: `Recommend technical photography choices for photoshoots themed around: ${concept}

IMPORTANT: If multiple keywords/elements are provided (comma-separated), recommend techniques that work across all elements or specify which technique suits which element.

Return strict JSON:
{
  "lens_options": ["lens option with reason", "lens option with reason"],
  "lighting_styles": ["style1", "style2"],
  "color_grades": ["grade1", "grade2"],
  "notes": "Practical technical notes"
}

Be specific and justify choices based on the concept mood and market usage.`,
    fallback,
  })
}

async function researchTrends(client: OpenAI, concept: string): Promise<TrendFindings> {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'developer',
          content: `You are a trend research analyst specializing in photography and visual marketing. Your knowledge covers current trends in fashion, aesthetics, and social media visual content for 2024-2025.`,
        },
        {
          role: 'user',
          content: `Research current visual trends for a photoshoot combining these elements: ${concept}

IMPORTANT: If multiple keywords/elements are provided (comma-separated), ensure EACH element is represented in your research. Cover trends specific to each keyword.

Consider:
- Pinterest aesthetic trends
- Editorial photography styles
- Fashion and outfit trends
- Color palette trends
- Set design and backdrop trends

Return a JSON object with this exact structure:
{
  "trending_aesthetics": ["aesthetic1", "aesthetic2", ...] (4-6 items),
  "color_palettes": ["palette1", "palette2", ...] (3-5 items),
  "outfit_trends": ["outfit1", "outfit2", ...] (4-6 items),
  "set_design_trends": ["trend1", "trend2", ...] (4-6 items)
}

Be specific and current. No generic answers.`,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) return DEFAULT_TRENDS

    return safeJsonParse(content, DEFAULT_TRENDS)
  } catch (error) {
    console.error('[Research] Trend research failed:', error)
    return DEFAULT_TRENDS
  }
}

async function researchCompetitors(client: OpenAI, concept: string): Promise<CompetitorInsights> {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'developer',
          content: `You are a competitive intelligence analyst specializing in AI photo apps and performance marketing. You analyze Meta Ad Library, App Store creatives, and social media ads from competitors like: ${COMPETITOR_NAMES.join(', ')}.`,
        },
        {
          role: 'user',
          content: `Analyze how AI photo app competitors are marketing content themed around: ${concept}

IMPORTANT: If multiple keywords/elements are provided (comma-separated), analyze competitor activity for EACH element and find patterns across all of them.

Use these competitor seed sources as priority:
${COMPETITOR_SOURCE_LINES}

Consider:
- Which competitors are actively promoting this concept
- Common visual patterns in their ads
- What hooks/elements grab attention
- Gaps or differentiation opportunities

Return a JSON object with this exact structure:
{
  "active_competitors": ["competitor1", "competitor2", ...] (2-4 most active),
  "common_patterns": ["pattern1", "pattern2", ...] (4-6 patterns),
  "differentiation_opportunities": ["opportunity1", "opportunity2", ...] (3-5 opportunities)
}

Be specific about visual elements, not vague marketing speak.`,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) return DEFAULT_COMPETITORS

    return safeJsonParse(content, DEFAULT_COMPETITORS)
  } catch (error) {
    console.error('[Research] Competitor research failed:', error)
    return DEFAULT_COMPETITORS
  }
}

async function researchTechnical(client: OpenAI, concept: string): Promise<TechnicalRecommendations> {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'developer',
          content: `You are a professional photographer and cinematographer with expertise in portrait photography, lighting setups, and post-processing. You understand what technical choices work best for different concepts and moods.`,
        },
        {
          role: 'user',
          content: `Recommend technical photography choices for photoshoots themed around: ${concept}

IMPORTANT: If multiple keywords/elements are provided (comma-separated), recommend techniques that work across all elements or specify which technique suits which element.

Consider:
- Lens choices and WHY (not just "85mm for portraits")
- Lighting setups that enhance the concept's mood
- Color grading styles that work
- Any special techniques or effects

Return a JSON object with this exact structure:
{
  "lens_options": ["lens1 with reasoning", "lens2 with reasoning", ...] (3-4 options),
  "lighting_styles": ["style1", "style2", ...] (3-5 styles),
  "color_grades": ["grade1", "grade2", ...] (3-4 grades),
  "notes": "Important technical considerations for this concept"
}

Be specific and justify choices based on the concept's mood and requirements.`,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) return DEFAULT_TECHNICAL

    return safeJsonParse(content, DEFAULT_TECHNICAL)
  } catch (error) {
    console.error('[Research] Technical research failed:', error)
    return DEFAULT_TECHNICAL
  }
}

async function generateSubThemes(
  client: OpenAI,
  concept: string,
  trends: TrendFindings,
  competitors: CompetitorInsights,
): Promise<SubTheme[]> {
  const defaultSubThemes: SubTheme[] = [
    {
      name: 'Classic Portrait',
      aesthetic: 'Editorial',
      mood: 'Confident',
      key_elements: ['Clean backdrop', 'Professional lighting'],
    },
    {
      name: 'Lifestyle Moment',
      aesthetic: 'Lifestyle editorial',
      mood: 'Playful',
      key_elements: ['Natural setting', 'Candid pose'],
    },
    {
      name: 'Intimate Close-up',
      aesthetic: 'Intimate portrait',
      mood: 'Romantic',
      key_elements: ['Soft lighting', 'Emotional expression'],
    },
    {
      name: 'Fashion Editorial',
      aesthetic: 'Fashion-forward',
      mood: 'Confident',
      key_elements: ['Bold styling', 'Dynamic pose'],
    },
    {
      name: 'Minimal Studio',
      aesthetic: 'Minimal studio',
      mood: 'Mysterious',
      key_elements: ['Simple backdrop', 'Dramatic shadows'],
    },
    {
      name: 'Environmental Portrait',
      aesthetic: 'Lifestyle editorial',
      mood: 'Intimate',
      key_elements: ['Location context', 'Natural light'],
    },
  ]

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'developer',
          content: `You are a creative director for AI photo apps. You create distinct sub-themes for photoshoot concepts that are visually diverse and marketable.`,
        },
        {
          role: 'user',
          content: `Based on research for: ${concept}

TRENDING AESTHETICS: ${trends.trending_aesthetics.join(', ')}
OUTFIT TRENDS: ${trends.outfit_trends.join(', ')}
SET DESIGN TRENDS: ${trends.set_design_trends.join(', ')}
COMPETITOR PATTERNS: ${competitors.common_patterns.join(', ')}
DIFFERENTIATION OPPORTUNITIES: ${competitors.differentiation_opportunities.join(', ')}

Generate 6-8 distinct sub-themes for this concept. Each should be visually unique and cover different aesthetics/moods.

CRITICAL: If multiple keywords/elements are provided (e.g., "summer, beach, cocktails"), EVERY keyword must be represented in at least 1-2 sub-themes. Distribute coverage across all keywords evenly.

Return a JSON object with this exact structure:
{
  "sub_themes": [
    {
      "name": "Sub-theme Name",
      "aesthetic": "one of: Editorial, Lifestyle editorial, Minimal studio, Intimate portrait, Fashion-forward",
      "mood": "one of: Romantic, Playful, Confident, Intimate, Mysterious",
      "key_elements": ["element1", "element2", "element3"] (3-5 specific visual elements)
    }
  ]
}

Ensure variety - don't repeat the same aesthetic or mood more than twice.`,
        },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) return defaultSubThemes

    const parsed = safeJsonParse<{ sub_themes?: SubTheme[] }>(content, { sub_themes: defaultSubThemes })
    return parsed.sub_themes ?? defaultSubThemes
  } catch (error) {
    console.error('[Research] Sub-theme generation failed:', error)
    return defaultSubThemes
  }
}

export function analyzeResearchResults(brief: ResearchBrief): {
  summary: string
  keyInsights: string[]
  warnings: string[]
} {
  const keyInsights: string[] = []
  const warnings: string[] = []

  if (brief.trend_findings.trending_aesthetics.length > 0) {
    keyInsights.push(`Top aesthetic: ${brief.trend_findings.trending_aesthetics[0]}`)
  }

  if (brief.competitor_insights.active_competitors.length > 0) {
    keyInsights.push(`Active competitors: ${brief.competitor_insights.active_competitors.join(', ')}`)
  }

  if (brief.competitor_insights.differentiation_opportunities.length > 0) {
    keyInsights.push(`Differentiation: ${brief.competitor_insights.differentiation_opportunities[0]}`)
  }

  if (brief.sub_themes.length < 4) {
    warnings.push('Less than 4 sub-themes generated - may limit variety')
  }

  const aestheticSet = new Set(brief.sub_themes.map((s) => s.aesthetic))
  if (aestheticSet.size < 3) {
    warnings.push('Sub-themes lack aesthetic variety')
  }

  // Check keyword coverage in sub-themes
  const keywords = brief.concept
    .split(/[,،;]+/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
  if (keywords.length > 1) {
    const subThemeText = brief.sub_themes
      .map((s) => `${s.name} ${s.key_elements.join(' ')}`)
      .join(' ')
      .toLowerCase()

    const missingKeywords = keywords.filter((kw) => !subThemeText.includes(kw))
    if (missingKeywords.length > 0) {
      warnings.push(`Keywords not well represented in sub-themes: ${missingKeywords.join(', ')}`)
    } else {
      keyInsights.push(`All ${keywords.length} keywords represented in sub-themes`)
    }
  }

  return {
    summary: `Research complete for "${brief.concept}" with ${brief.sub_themes.length} sub-themes identified.`,
    keyInsights,
    warnings,
  }
}

// ========================================
// CACHE LAYER (Phase 1)
// ========================================

interface CachedResearchData {
  trend_findings: TrendFindings
  competitor_insights: CompetitorInsights
  technical_recommendations: TechnicalRecommendations
  source_urls?: string[]
}

interface CacheResult {
  cached: Map<string, CachedResearchData>
  missing: string[]
}

/**
 * Extract cacheable keywords from concept string
 * Example: "halloween photography, witch costume, werewolf" → ["halloween photography", "witch costume", "werewolf"]
 */
export function extractCacheableKeywords(concept: string): string[] {
  return concept
    .toLowerCase()
    .split(/[,;،]+/) // Split by comma, semicolon, Arabic comma
    .map((kw) => kw.trim())
    .filter((kw) => kw.length >= 3) // Min 3 chars
    .slice(0, 5) // Max 5 keywords
}

/**
 * Lookup cached research data for given keywords
 * Returns both cached results and missing keywords that need fresh research
 */
export async function lookupCachedResearch(keywords: string[], mode: ResearchMode): Promise<CacheResult> {
  const cached = new Map<string, CachedResearchData>()
  const missing: string[] = []
  const now = Date.now()
  const db = getDb()

  for (const keyword of keywords) {
    const lookupKey = cacheKeyFor(keyword, mode)
    try {
      const row = db
        .prepare(
          `
        SELECT * FROM research_cache
        WHERE concept_keyword = ? AND expires_at > ?
      `,
        )
        .get(lookupKey, now) as
        | {
            id: number
            created_at: number
            trend_findings: string
            competitor_insights: string
            technical_recommendations: string
            source_urls: string | null
          }
        | undefined

      if (row) {
        cached.set(keyword, {
          trend_findings: JSON.parse(row.trend_findings),
          competitor_insights: JSON.parse(row.competitor_insights),
          technical_recommendations: JSON.parse(row.technical_recommendations),
          source_urls: safeJsonParse<string[]>(row.source_urls || '[]', []),
        })

        // Update access stats
        db.prepare(
          `
          UPDATE research_cache
          SET access_count = access_count + 1, last_accessed_at = ?
          WHERE id = ?
        `,
        ).run(now, row.id)

        const age = Math.round((now - row.created_at) / 1000)
        console.log(`[Research Cache] Hit for "${lookupKey}" (age: ${age}s)`)
      } else {
        missing.push(keyword)
        console.log(`[Research Cache] Miss for "${lookupKey}"`)
      }
    } catch (error) {
      console.error(`[Research Cache] Error looking up "${lookupKey}":`, error)
      missing.push(keyword)
    }
  }

  return { cached, missing }
}

/**
 * Cache research results for a single keyword
 */
export async function cacheResearchResults(
  keyword: string,
  data: CachedResearchData,
  sourceUrls?: string[],
  mode: ResearchMode = 'model',
): Promise<void> {
  const db = getDb()
  const now = Date.now()
  const expiresAt = now + 48 * 60 * 60 * 1000 // 48 hours TTL
  const cacheKey = cacheKeyFor(keyword, mode)

  try {
    db.prepare(
      `
      INSERT OR REPLACE INTO research_cache (
        concept_keyword,
        trend_findings,
        competitor_insights,
        technical_recommendations,
        sources_analyzed,
        source_urls,
        last_web_search,
        created_at,
        expires_at,
        access_count,
        last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `,
    ).run(
      cacheKey,
      JSON.stringify(data.trend_findings),
      JSON.stringify(data.competitor_insights),
      JSON.stringify(data.technical_recommendations),
      sourceUrls?.length || 12, // sources_analyzed
      JSON.stringify(sourceUrls || []),
      now, // last_web_search
      now,
      expiresAt,
      now,
    )

    console.log(
      `[Research Cache] Cached results for "${cacheKey}" with ${sourceUrls?.length || 0} sources (expires in 48h)`,
    )
  } catch (error) {
    console.error(`[Research Cache] Error caching "${cacheKey}":`, error)
  }
}

/**
 * Merge multiple research data sources (cached + fresh) into single ResearchBrief
 */
export function mergeResearchData(
  sources: Map<string, CachedResearchData>,
  concept: string,
): Omit<ResearchBrief, 'sub_themes'> {
  const allAesthetics = new Set<string>()
  const allColorPalettes = new Set<string>()
  const allOutfitTrends = new Set<string>()
  const allSetDesigns = new Set<string>()
  const allCompetitors = new Set<string>()
  const allPatterns = new Set<string>()
  const allOpportunities = new Set<string>()
  const allLensOptions = new Set<string>()
  const allLightingStyles = new Set<string>()
  const allColorGrades = new Set<string>()
  let technicalNotes = ''
  let sourcesAnalyzed = 0

  for (const data of sources.values()) {
    data.trend_findings.trending_aesthetics.forEach((a) => {
      allAesthetics.add(a)
    })
    data.trend_findings.color_palettes.forEach((c) => {
      allColorPalettes.add(c)
    })
    data.trend_findings.outfit_trends.forEach((o) => {
      allOutfitTrends.add(o)
    })
    data.trend_findings.set_design_trends.forEach((s) => {
      allSetDesigns.add(s)
    })

    data.competitor_insights.active_competitors.forEach((c) => {
      allCompetitors.add(c)
    })
    data.competitor_insights.common_patterns.forEach((p) => {
      allPatterns.add(p)
    })
    data.competitor_insights.differentiation_opportunities.forEach((o) => {
      allOpportunities.add(o)
    })

    data.technical_recommendations.lens_options.forEach((l) => {
      allLensOptions.add(l)
    })
    data.technical_recommendations.lighting_styles.forEach((l) => {
      allLightingStyles.add(l)
    })
    data.technical_recommendations.color_grades.forEach((c) => {
      allColorGrades.add(c)
    })
    if (data.technical_recommendations.notes) {
      technicalNotes += (technicalNotes ? ' ' : '') + data.technical_recommendations.notes
    }
    sourcesAnalyzed += data.source_urls?.length || 12
  }

  return {
    concept,
    research_date: new Date().toISOString().split('T')[0],
    sources_analyzed: sourcesAnalyzed,
    trend_findings: {
      trending_aesthetics: Array.from(allAesthetics).slice(0, 6),
      color_palettes: Array.from(allColorPalettes).slice(0, 5),
      outfit_trends: Array.from(allOutfitTrends).slice(0, 6),
      set_design_trends: Array.from(allSetDesigns).slice(0, 6),
    },
    competitor_insights: {
      active_competitors: Array.from(allCompetitors).slice(0, 4),
      common_patterns: Array.from(allPatterns).slice(0, 6),
      differentiation_opportunities: Array.from(allOpportunities).slice(0, 5),
    },
    technical_recommendations: {
      lens_options: Array.from(allLensOptions).slice(0, 4),
      lighting_styles: Array.from(allLightingStyles).slice(0, 5),
      color_grades: Array.from(allColorGrades).slice(0, 4),
      notes: technicalNotes || 'Choose based on concept mood and requirements',
    },
  }
}

// ========================================
// Research grounding mode
// ========================================
// Web-backed research is handled via OpenAI Responses API `web_search_preview` tool.
// Model-only synthesis remains as fallback and can be forced with mode='model'.
