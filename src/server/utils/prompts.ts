export interface Expression {
  facial: string
  eyes: string
  mouth: string
}

export interface PoseConfig {
  framing: string
  body_position: string
  arms: string
  posture: string
  expression: Expression
}

export interface LightingConfig {
  setup: string
  key_light: string
  fill_light: string
  shadows: string
  mood: string
}

export interface SetDesignConfig {
  backdrop: string
  surface: string
  props: string[]
  atmosphere: string
}

export interface OutfitConfig {
  main: string
  underneath?: string
  accessories: string
  styling: string
}

export interface CameraConfig {
  lens: string
  aperture: string
  angle: string
  focus: string
  distortion?: string
}

export interface HairstyleConfig {
  style: string
  parting: string
  details: string
  finish: string
}

export interface MakeupConfig {
  style: string
  skin: string
  eyes: string
  lips: string
}

export interface EffectsConfig {
  vignette?: string
  color_grade: string
  lens_flare?: string
  atmosphere?: string
  grain: string
}

export interface PromptOutput {
  style: string
  pose: PoseConfig
  lighting: LightingConfig
  set_design: SetDesignConfig
  outfit: OutfitConfig
  camera: CameraConfig
  hairstyle: HairstyleConfig
  makeup: MakeupConfig
  effects: EffectsConfig
}

export interface SubTheme {
  name: string
  aesthetic: string
  mood: string
  key_elements: string[]
}

export interface TrendFindings {
  trending_aesthetics: string[]
  color_palettes: string[]
  outfit_trends: string[]
  set_design_trends: string[]
}

export interface CompetitorInsights {
  active_competitors: string[]
  common_patterns: string[]
  differentiation_opportunities: string[]
}

export interface TechnicalRecommendations {
  lens_options: string[]
  lighting_styles: string[]
  color_grades: string[]
  notes: string
}

export interface ResearchBrief {
  concept: string
  research_date: string
  sources_analyzed: number
  trend_findings: TrendFindings
  competitor_insights: CompetitorInsights
  technical_recommendations: TechnicalRecommendations
  sub_themes: SubTheme[]
}

export interface VarietyScore {
  aesthetics_used: string[]
  emotions_used: string[]
  lighting_setups_used: string[]
  has_duplicates: boolean
  passed: boolean
  score: number
}

const AESTHETIC_KEYWORDS: Record<string, string[]> = {
  Editorial: ['editorial', 'magazine', 'professional', 'polished', 'high-fashion'],
  'Lifestyle editorial': ['lifestyle', 'candid', 'natural', 'everyday', 'authentic'],
  'Minimal studio': ['minimal', 'studio', 'clean', 'simple', 'sleek'],
  'Intimate portrait': ['intimate', 'close-up', 'personal', 'emotional', 'tender'],
  'Fashion-forward': ['fashion', 'bold', 'trendy', 'avant-garde', 'stylish', 'glamorous'],
}

const EMOTION_KEYWORDS: Record<string, string[]> = {
  Romantic: ['romantic', 'love', 'tender', 'soft', 'dreamy', 'warm'],
  Playful: ['playful', 'fun', 'joyful', 'cheerful', 'lively', 'spirited'],
  Confident: ['confident', 'bold', 'strong', 'powerful', 'fierce', 'empowered'],
  Intimate: ['intimate', 'cozy', 'personal', 'close', 'private', 'quiet'],
  Mysterious: ['mysterious', 'enigmatic', 'dark', 'moody', 'dramatic', 'shadowy'],
}

// Vagueness detection patterns
const VAGUE_PATTERNS = [
  /\b(elevated|appropriate|stylish|nice|beautiful|gorgeous)\b/i,
  /concept-appropriate/i,
  /^[^,]{10,30}attire[^,]*$/i, // Short phrases ending in "attire"
  /\boutfit\b(?!\s+(in|with|of|features))/i, // "outfit" without specifics
  /\bwear\b(?!\s+with)/i,
  /casual\s+wear/i,
]

// Required outfit keyword patterns (fabric, color, cut/style)
const REQUIRED_OUTFIT_PATTERNS = {
  fabric: /(silk|linen|cotton|leather|velvet|satin|cashmere|denim|wool|chiffon|charmeuse|crepe|jersey|knit)/i,
  color:
    /(ivory|terracotta|navy|burgundy|sage|cream|charcoal|olive|rust|blush|black|white|beige|camel|taupe|grey|gray|blue|red|green|pink|purple|yellow|orange|brown)/i,
  cut: /(bias-cut|oversized|slim|fitted|tailored|wrap|a-line|sheath|shift|bodycon|relaxed|loose|cropped|midi|maxi|mini|knee-length|ankle-length)/i,
}

export function isVagueOutfit(outfit: string): boolean {
  // Check for vague patterns
  if (VAGUE_PATTERNS.some((pattern) => pattern.test(outfit))) {
    return true
  }

  // Check for required keywords (at least 2 of 3 categories)
  const hasKeywords = Object.values(REQUIRED_OUTFIT_PATTERNS).filter((pattern) => pattern.test(outfit))
  return hasKeywords.length < 2
}

export function validateOutfitSpecificity(outfit: string): { valid: boolean; reason?: string } {
  if (outfit.length < 40) {
    return { valid: false, reason: 'Outfit description too short (min 40 chars)' }
  }

  if (isVagueOutfit(outfit)) {
    return { valid: false, reason: 'Outfit contains vague or generic language' }
  }

  // Check for fabric
  if (!REQUIRED_OUTFIT_PATTERNS.fabric.test(outfit)) {
    return { valid: false, reason: 'Must specify fabric type (silk, linen, leather, etc.)' }
  }

  return { valid: true }
}

export function validatePrompt(prompt: PromptOutput): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Style should be rich and detailed (30-50 words = ~150-300 chars)
  if (!prompt.style || prompt.style.length < 100) {
    errors.push('Style field must be at least 100 characters (aim for 30-50 words)')
  }

  // Core required fields with minimum detail
  if (!prompt.pose?.framing || prompt.pose.framing.length < 30) {
    errors.push('pose.framing needs more detail (min 30 chars)')
  }
  if (!prompt.lighting?.setup || prompt.lighting.setup.length < 40) {
    errors.push('lighting.setup needs more detail (min 40 chars)')
  }
  if (!prompt.set_design?.backdrop || prompt.set_design.backdrop.length < 50) {
    errors.push('set_design.backdrop needs more detail (min 50 chars)')
  }

  // Replace simple length check with specificity validation
  const outfitCheck = validateOutfitSpecificity(prompt.outfit?.main || '')
  if (!outfitCheck.valid) {
    errors.push(`outfit.main: ${outfitCheck.reason}`)
  }
  if (!prompt.camera?.lens || prompt.camera.lens.length < 20) {
    errors.push('camera.lens needs more detail (min 20 chars)')
  }

  // Check for CRITICAL tag (should have at least one hero element)
  const promptStr = JSON.stringify(prompt)
  if (!promptStr.includes('CRITICAL:')) {
    errors.push('Missing CRITICAL: tag for hero element')
  }

  // Locked terms - identity descriptors that must never appear
  const lockedTerms = [
    'blonde',
    'brunette',
    'redhead',
    'asian',
    'caucasian',
    'african',
    'hispanic',
    'young',
    'old',
    'beautiful',
    'pretty',
    'gorgeous',
    'handsome',
    'blue eyes',
    'brown eyes',
    'green eyes',
    'tan skin',
    'fair skin',
    'dark skin',
    'pale skin',
  ]
  const promptStrLower = promptStr.toLowerCase()
  for (const term of lockedTerms) {
    if (promptStrLower.includes(term)) {
      errors.push(`Contains locked parameter: "${term}"`)
    }
  }

  return { valid: errors.length === 0, errors }
}

export function calculateVarietyScore(prompts: PromptOutput[]): VarietyScore {
  const aesthetics = new Set<string>()
  const emotions = new Set<string>()
  const lightingSetups = new Set<string>()
  const combinations = new Set<string>()

  for (const prompt of prompts) {
    const searchText = [prompt.style, prompt.lighting?.mood, prompt.set_design?.atmosphere, prompt.outfit?.styling]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    for (const [aesthetic, keywords] of Object.entries(AESTHETIC_KEYWORDS)) {
      if (keywords.some((kw) => searchText.includes(kw))) {
        aesthetics.add(aesthetic)
      }
    }

    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      if (keywords.some((kw) => searchText.includes(kw))) {
        emotions.add(emotion)
      }
    }

    if (prompt.lighting?.setup) {
      lightingSetups.add(prompt.lighting.setup.substring(0, 40))
    }

    const combo = `${prompt.pose?.framing}|${prompt.outfit?.main?.substring(0, 30)}|${prompt.lighting?.setup?.substring(0, 25)}`
    combinations.add(combo)
  }

  const hasDuplicates = combinations.size < prompts.length
  const minRequired = Math.min(3, prompts.length)
  const passed =
    aesthetics.size >= minRequired &&
    emotions.size >= minRequired &&
    lightingSetups.size >= minRequired &&
    !hasDuplicates

  // Calculate numeric score (0-100)
  const maxExpected = Math.max(5, prompts.length)
  const aestheticScore = Math.min(100, (aesthetics.size / maxExpected) * 100)
  const emotionScore = Math.min(100, (emotions.size / maxExpected) * 100)
  const lightingScore = Math.min(100, (lightingSetups.size / maxExpected) * 100)
  const duplicatePenalty = hasDuplicates ? 20 : 0
  const score = Math.round((aestheticScore + emotionScore + lightingScore) / 3 - duplicatePenalty)

  return {
    aesthetics_used: Array.from(aesthetics),
    emotions_used: Array.from(emotions),
    lighting_setups_used: Array.from(lightingSetups),
    has_duplicates: hasDuplicates,
    passed,
    score,
  }
}
