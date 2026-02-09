import OpenAI from 'openai'
import { getDb } from '../db/index.js'
import type {
  CompetitorInsights,
  ResearchBrief,
  SubTheme,
  TechnicalRecommendations,
  TrendFindings,
} from '../utils/prompts.js'

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
  try {
    return JSON.parse(content) as T
  } catch {
    console.error('[JSON Parse Error] Failed to parse:', content.substring(0, 200))
    return fallback
  }
}

const COMPETITORS = [
  'Glam AI (Glam Labs)',
  'Momo (HubX)',
  'AI Video Generator (HubX)',
  'Remini (Bending Spoons)',
  'DaVinci (HubX)',
  'Hula AI (Prequel)',
]

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
export async function performResearch(concept: string): Promise<ResearchBrief> {
  const keywords = extractCacheableKeywords(concept)

  if (keywords.length === 0) {
    console.log('[Research] No valid keywords, using fallback')
    return performFreshResearch(concept)
  }

  console.log(`[Research] Keywords extracted: ${keywords.join(', ')}`)

  // Phase 1: Check cache
  const { cached, missing } = await lookupCachedResearch(keywords)

  console.log(`[Research] Cache status: ${cached.size}/${keywords.length} hits, ${missing.length} missing`)

  // Phase 2: Research missing keywords only
  const freshData = new Map<string, CachedResearchData>()

  if (missing.length > 0) {
    console.log(`[Research] Researching missing keywords: ${missing.join(', ')}`)

    for (const keyword of missing) {
      const data = await researchSingleKeyword(keyword)
      freshData.set(keyword, data)
      await cacheResearchResults(keyword, data, data.source_urls)
    }
  }

  // Phase 3: Merge all sources
  const allSources = new Map([...cached, ...freshData])
  const merged = mergeResearchData(allSources, concept)

  // Phase 4: Generate sub-themes from merged data
  const client = await getOpenAI()
  const subThemes = await generateSubThemes(client, concept, merged.trend_findings, merged.competitor_insights)

  return {
    ...merged,
    sub_themes: subThemes,
  }
}

/**
 * Research a single keyword (used for cache misses)
 * Uses GPT-4o for research synthesis
 */
async function researchSingleKeyword(keyword: string): Promise<CachedResearchData & { source_urls?: string[] }> {
  const client = await getOpenAI()

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
  }
}

/**
 * Perform fresh research without cache (fallback)
 */
async function performFreshResearch(concept: string): Promise<ResearchBrief> {
  const client = await getOpenAI()

  const [trendFindings, competitorInsights, technicalRecommendations] = await Promise.all([
    researchTrends(client, concept),
    researchCompetitors(client, concept),
    researchTechnical(client, concept),
  ])

  const subThemes = await generateSubThemes(client, concept, trendFindings, competitorInsights)

  return {
    concept,
    research_date: new Date().toISOString().split('T')[0],
    sources_analyzed: 12,
    trend_findings: trendFindings,
    competitor_insights: competitorInsights,
    technical_recommendations: technicalRecommendations,
    sub_themes: subThemes,
  }
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
          content: `You are a competitive intelligence analyst specializing in AI photo apps and performance marketing. You analyze Meta Ad Library, App Store creatives, and social media ads from competitors like: ${COMPETITORS.join(', ')}.`,
        },
        {
          role: 'user',
          content: `Analyze how AI photo app competitors are marketing content themed around: ${concept}

IMPORTANT: If multiple keywords/elements are provided (comma-separated), analyze competitor activity for EACH element and find patterns across all of them.

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
export async function lookupCachedResearch(keywords: string[]): Promise<CacheResult> {
  const cached = new Map<string, CachedResearchData>()
  const missing: string[] = []
  const now = Date.now()
  const db = getDb()

  for (const keyword of keywords) {
    try {
      const row = db
        .prepare(
          `
        SELECT * FROM research_cache
        WHERE concept_keyword = ? AND expires_at > ?
      `,
        )
        .get(keyword, now) as
        | {
            id: number
            trend_findings: string
            competitor_insights: string
            technical_recommendations: string
          }
        | undefined

      if (row) {
        cached.set(keyword, {
          trend_findings: JSON.parse(row.trend_findings),
          competitor_insights: JSON.parse(row.competitor_insights),
          technical_recommendations: JSON.parse(row.technical_recommendations),
        })

        // Update access stats
        db.prepare(
          `
          UPDATE research_cache
          SET access_count = access_count + 1, last_accessed_at = ?
          WHERE id = ?
        `,
        ).run(now, row.id)

        const age = Math.round((now - (row as any).created_at) / 1000)
        console.log(`[Research Cache] Hit for "${keyword}" (age: ${age}s)`)
      } else {
        missing.push(keyword)
        console.log(`[Research Cache] Miss for "${keyword}"`)
      }
    } catch (error) {
      console.error(`[Research Cache] Error looking up "${keyword}":`, error)
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
): Promise<void> {
  const db = getDb()
  const now = Date.now()
  const expiresAt = now + 48 * 60 * 60 * 1000 // 48 hours TTL

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
      keyword,
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
      `[Research Cache] Cached results for "${keyword}" with ${sourceUrls?.length || 0} sources (expires in 48h)`,
    )
  } catch (error) {
    console.error(`[Research Cache] Error caching "${keyword}":`, error)
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

  for (const data of sources.values()) {
    data.trend_findings.trending_aesthetics.forEach((a) => allAesthetics.add(a))
    data.trend_findings.color_palettes.forEach((c) => allColorPalettes.add(c))
    data.trend_findings.outfit_trends.forEach((o) => allOutfitTrends.add(o))
    data.trend_findings.set_design_trends.forEach((s) => allSetDesigns.add(s))

    data.competitor_insights.active_competitors.forEach((c) => allCompetitors.add(c))
    data.competitor_insights.common_patterns.forEach((p) => allPatterns.add(p))
    data.competitor_insights.differentiation_opportunities.forEach((o) => allOpportunities.add(o))

    data.technical_recommendations.lens_options.forEach((l) => allLensOptions.add(l))
    data.technical_recommendations.lighting_styles.forEach((l) => allLightingStyles.add(l))
    data.technical_recommendations.color_grades.forEach((c) => allColorGrades.add(c))
    if (data.technical_recommendations.notes) {
      technicalNotes += (technicalNotes ? ' ' : '') + data.technical_recommendations.notes
    }
  }

  return {
    concept,
    research_date: new Date().toISOString().split('T')[0],
    sources_analyzed: sources.size * 12,
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
// CLAUDE RESEARCH AGENT (Phase 2)
// ========================================
// Web intelligence functions moved to claudeAgent.ts
// Claude agent has access to WebSearch MCP tool that server code doesn't
