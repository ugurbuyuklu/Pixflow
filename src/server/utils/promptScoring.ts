import type { PromptOutput, VarietyScore } from './prompts.js'
import { calculateVarietyScore } from './prompts.js'

export interface PromptQualityMetrics {
  overall_score: number // 0-100
  variety_score: VarietyScore
  specificity_score: number // 0-100
  completeness_score: number // 0-100
  detail_scores: {
    outfit_detail: number // 0-100
    lighting_detail: number // 0-100
    pose_detail: number // 0-100
    set_design_detail: number // 0-100
  }
  issues: string[]
  strengths: string[]
  model_used?: string
  timestamp: string
}

export interface ScoredPrompt extends PromptOutput {
  quality_score: number // 0-100
  issues: string[]
}

const REQUIRED_OUTFIT_KEYWORDS = ['fabric', 'color', 'style', 'cut', 'fit', 'length']
const REQUIRED_LIGHTING_KEYWORDS = ['key', 'fill', 'shadow', 'direction', 'temperature', 'mood']
const REQUIRED_POSE_KEYWORDS = ['weight', 'position', 'angle', 'limb', 'arm', 'leg']
const REQUIRED_SET_KEYWORDS = ['backdrop', 'surface', 'prop', 'atmosphere', 'depth']

function calculateDetailScore(text: string | undefined, keywords: string[]): number {
  if (!text) return 0

  const lowerText = text.toLowerCase()
  const matchedKeywords = keywords.filter((kw) => lowerText.includes(kw))

  // Base score from keyword coverage
  const keywordScore = (matchedKeywords.length / keywords.length) * 70

  // Bonus for length/detail (up to 30 points)
  const lengthBonus = Math.min(30, (text.length / 200) * 30)

  return Math.min(100, keywordScore + lengthBonus)
}

function scoreIndividualPrompt(prompt: PromptOutput): { score: number; issues: string[] } {
  const issues: string[] = []
  let totalScore = 100

  // Check outfit specificity
  const outfitText = [prompt.outfit?.main, prompt.outfit?.accessories, prompt.outfit?.styling].filter(Boolean).join(' ')

  if (outfitText.includes('Elevated, concept-appropriate') || outfitText.length < 30) {
    issues.push('Generic outfit description')
    totalScore -= 20
  }

  // Check lighting specificity
  const lightingText = [
    prompt.lighting?.setup,
    prompt.lighting?.key_light,
    prompt.lighting?.fill_light,
    prompt.lighting?.shadows,
  ]
    .filter(Boolean)
    .join(' ')

  if (lightingText.length < 50) {
    issues.push('Insufficient lighting detail')
    totalScore -= 15
  }

  // Check pose specificity
  const poseText = [prompt.pose?.body_position, prompt.pose?.arms, prompt.pose?.posture].filter(Boolean).join(' ')

  if (poseText.length < 40) {
    issues.push('Vague pose description')
    totalScore -= 10
  }

  // Check for CRITICAL marker
  if (!prompt.style?.includes('CRITICAL:')) {
    issues.push('Missing CRITICAL: marker in style')
    totalScore -= 5
  }

  // Check for natural skin texture mention
  if (!prompt.makeup?.skin?.toLowerCase().includes('natural') && !prompt.makeup?.skin?.toLowerCase().includes('pore')) {
    issues.push('Missing natural skin texture mention')
    totalScore -= 5
  }

  // Check style length
  if (prompt.style && prompt.style.length < 50) {
    issues.push('Style description too brief')
    totalScore -= 10
  }

  return { score: Math.max(0, totalScore), issues }
}

export function calculatePromptQualityMetrics(prompts: PromptOutput[], modelUsed?: string): PromptQualityMetrics {
  const varietyScore = calculateVarietyScore(prompts)
  const issues: string[] = []
  const strengths: string[] = []

  // Score each prompt individually
  const scoredPrompts = prompts.map((p) => scoreIndividualPrompt(p))
  const avgIndividualScore = scoredPrompts.reduce((sum, s) => sum + s.score, 0) / prompts.length

  // Calculate detail scores
  const outfitScores = prompts.map((p) =>
    calculateDetailScore([p.outfit?.main, p.outfit?.accessories].join(' '), REQUIRED_OUTFIT_KEYWORDS),
  )
  const lightingScores = prompts.map((p) =>
    calculateDetailScore(
      [p.lighting?.setup, p.lighting?.key_light, p.lighting?.fill_light].join(' '),
      REQUIRED_LIGHTING_KEYWORDS,
    ),
  )
  const poseScores = prompts.map((p) =>
    calculateDetailScore([p.pose?.body_position, p.pose?.arms, p.pose?.posture].join(' '), REQUIRED_POSE_KEYWORDS),
  )
  const setScores = prompts.map((p) =>
    calculateDetailScore(
      [p.set_design?.backdrop, p.set_design?.surface, p.set_design?.atmosphere].join(' '),
      REQUIRED_SET_KEYWORDS,
    ),
  )

  const outfitDetail = outfitScores.reduce((sum, s) => sum + s, 0) / prompts.length
  const lightingDetail = lightingScores.reduce((sum, s) => sum + s, 0) / prompts.length
  const poseDetail = poseScores.reduce((sum, s) => sum + s, 0) / prompts.length
  const setDesignDetail = setScores.reduce((sum, s) => sum + s, 0) / prompts.length

  // Calculate specificity score (how non-generic are the prompts)
  const uniqueOutfits = new Set(prompts.map((p) => p.outfit?.main?.substring(0, 50)))
  const uniqueLighting = new Set(prompts.map((p) => p.lighting?.setup?.substring(0, 50)))
  const specificityScore = Math.min(
    100,
    ((uniqueOutfits.size / prompts.length) * 50 + (uniqueLighting.size / prompts.length) * 50) * 100,
  )

  // Calculate completeness score (are all fields filled)
  const completeFields = prompts.map((p) => {
    const fields = [
      p.style,
      p.pose?.framing,
      p.pose?.body_position,
      p.lighting?.setup,
      p.outfit?.main,
      p.set_design?.backdrop,
      p.camera?.lens,
      p.makeup?.skin,
    ]
    return fields.filter(Boolean).length / fields.length
  })
  const completenessScore = (completeFields.reduce((sum, c) => sum + c, 0) / prompts.length) * 100

  // Variety score contribution
  const varietyContribution = varietyScore.passed ? 100 : 60

  // Calculate overall score
  const overallScore = Math.round(
    avgIndividualScore * 0.3 +
      specificityScore * 0.25 +
      completenessScore * 0.15 +
      varietyContribution * 0.15 +
      ((outfitDetail + lightingDetail + poseDetail + setDesignDetail) / 4) * 0.15,
  )

  // Collect issues
  if (varietyScore.has_duplicates) {
    issues.push('Duplicate prompts detected')
  }
  if (!varietyScore.passed) {
    issues.push('Variety requirements not met')
  }
  if (specificityScore < 50) {
    issues.push('Generic/template-based prompts detected')
  }
  if (outfitDetail < 50) {
    issues.push('Outfit descriptions lack detail')
  }
  if (lightingDetail < 50) {
    issues.push('Lighting descriptions lack detail')
  }

  // All prompt-specific issues
  const allIssues = scoredPrompts.flatMap((s) => s.issues)
  const issueFrequency = allIssues.reduce(
    (acc, issue) => {
      acc[issue] = (acc[issue] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  // Only include issues that appear in more than 30% of prompts
  for (const [issue, count] of Object.entries(issueFrequency)) {
    if (count > prompts.length * 0.3) {
      issues.push(`${issue} (${count}/${prompts.length} prompts)`)
    }
  }

  // Collect strengths
  if (varietyScore.aesthetics_used.length >= 5) {
    strengths.push(`Strong aesthetic variety (${varietyScore.aesthetics_used.length} types)`)
  }
  if (varietyScore.emotions_used.length >= 4) {
    strengths.push(`Good emotional range (${varietyScore.emotions_used.length} types)`)
  }
  if (varietyScore.lighting_setups_used.length >= prompts.length * 0.8) {
    strengths.push(`Excellent lighting variety (${varietyScore.lighting_setups_used.length} unique setups)`)
  }
  if (outfitDetail > 70) {
    strengths.push('Highly detailed outfit descriptions')
  }
  if (setDesignDetail > 70) {
    strengths.push('Richly described set designs')
  }
  if (!varietyScore.has_duplicates) {
    strengths.push('No duplicate prompts')
  }

  return {
    overall_score: overallScore,
    variety_score: varietyScore,
    specificity_score: Math.round(specificityScore),
    completeness_score: Math.round(completenessScore),
    detail_scores: {
      outfit_detail: Math.round(outfitDetail),
      lighting_detail: Math.round(lightingDetail),
      pose_detail: Math.round(poseDetail),
      set_design_detail: Math.round(setDesignDetail),
    },
    individual_scores: scoredPrompts.map((s) => s.score),
    issues,
    strengths,
    model_used: modelUsed,
    timestamp: new Date().toISOString(),
  }
}

export function scorePrompts(prompts: PromptOutput[]): ScoredPrompt[] {
  return prompts.map((prompt) => {
    const { score, issues } = scoreIndividualPrompt(prompt)
    return {
      ...prompt,
      quality_score: score,
      issues,
    }
  })
}

export function getQualityRating(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'fair'
  return 'poor'
}
