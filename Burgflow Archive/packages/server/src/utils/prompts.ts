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
}

const AESTHETIC_KEYWORDS: Record<string, string[]> = {
  'Editorial': ['editorial', 'magazine', 'professional', 'polished', 'high-fashion'],
  'Lifestyle editorial': ['lifestyle', 'candid', 'natural', 'everyday', 'authentic'],
  'Minimal studio': ['minimal', 'studio', 'clean', 'simple', 'sleek'],
  'Intimate portrait': ['intimate', 'close-up', 'personal', 'emotional', 'tender'],
  'Fashion-forward': ['fashion', 'bold', 'trendy', 'avant-garde', 'stylish', 'glamorous'],
}

const EMOTION_KEYWORDS: Record<string, string[]> = {
  'Romantic': ['romantic', 'love', 'tender', 'soft', 'dreamy', 'warm'],
  'Playful': ['playful', 'fun', 'joyful', 'cheerful', 'lively', 'spirited'],
  'Confident': ['confident', 'bold', 'strong', 'powerful', 'fierce', 'empowered'],
  'Intimate': ['intimate', 'cozy', 'personal', 'close', 'private', 'quiet'],
  'Mysterious': ['mysterious', 'enigmatic', 'dark', 'moody', 'dramatic', 'shadowy'],
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
  if (!prompt.outfit?.main || prompt.outfit.main.length < 30) {
    errors.push('outfit.main needs more detail (min 30 chars)')
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
  const lockedTerms = ['blonde', 'brunette', 'redhead', 'asian', 'caucasian', 'african', 'hispanic', 'young', 'old', 'beautiful', 'pretty', 'gorgeous', 'handsome', 'blue eyes', 'brown eyes', 'green eyes', 'tan skin', 'fair skin', 'dark skin', 'pale skin']
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
    const searchText = [
      prompt.style,
      prompt.lighting?.mood,
      prompt.set_design?.atmosphere,
      prompt.outfit?.styling,
    ].filter(Boolean).join(' ').toLowerCase()

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
  const passed = aesthetics.size >= minRequired && emotions.size >= minRequired && lightingSetups.size >= minRequired && !hasDuplicates

  return {
    aesthetics_used: Array.from(aesthetics),
    emotions_used: Array.from(emotions),
    lighting_setups_used: Array.from(lightingSetups),
    has_duplicates: hasDuplicates,
    passed,
  }
}
