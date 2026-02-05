import OpenAI from 'openai'

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiClient
}

export interface ScriptGenerationOptions {
  concept: string
  duration: number
  examples?: string[]
  tone?: 'casual' | 'professional' | 'energetic' | 'friendly' | 'dramatic'
}

export interface ScriptGenerationResult {
  script: string
  wordCount: number
  estimatedDuration: number
}

const WORDS_PER_SECOND = 2.5

/**
 * Generate a voiceover script for a mobile app ad using GPT-4o.
 * The script is optimized for the specified duration and tone.
 */
export async function generateVoiceoverScript(
  options: ScriptGenerationOptions
): Promise<ScriptGenerationResult> {
  const targetWords = Math.floor(options.duration * WORDS_PER_SECOND)
  const tolerance = Math.floor(targetWords * 0.1)

  const toneDescriptions: Record<string, string> = {
    casual: 'casual and conversational, like talking to a friend',
    professional: 'professional and authoritative, building trust',
    energetic: 'energetic and exciting, creating urgency',
    friendly: 'warm and friendly, approachable and relatable',
    dramatic: 'dramatic and impactful, building anticipation',
  }

  const toneDescription = toneDescriptions[options.tone || 'energetic'] || toneDescriptions.energetic

  const systemPrompt = `You are a creative copywriter specializing in performance marketing for mobile apps.
Your task is to write a voiceover script for a video ad.

CRITICAL REQUIREMENTS:
- The script MUST be exactly ${targetWords} words (±${tolerance} words)
- Tone: ${toneDescription}
- Do NOT include any stage directions, [brackets], (parentheses), or formatting
- Do NOT include speaker labels or timestamps
- Output ONLY the spoken text that will be read aloud
- Make it engaging and hook the viewer in the first 3 seconds
- Include a clear call-to-action at the end

The script is for an AI photo app that transforms selfies into amazing photos.`

  const userPrompt = `Write a voiceover script for the following concept:

Concept: ${options.concept}
Target duration: ${options.duration} seconds
Target word count: ${targetWords} words

${options.examples && options.examples.length > 0 ? `\nReference examples for style (but create original content):\n${options.examples.join('\n\n')}` : ''}`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 500,
  })

  const script = response.choices[0]?.message?.content?.trim()
  if (!script) {
    throw new Error('OpenAI returned empty script content')
  }
  const wordCount = script.split(/\s+/).filter(Boolean).length
  const estimatedDuration = Math.round(wordCount / WORDS_PER_SECOND)

  return {
    script,
    wordCount,
    estimatedDuration,
  }
}

/**
 * Refine an existing script based on feedback.
 */
export async function refineScript(
  originalScript: string,
  feedback: string,
  targetDuration: number
): Promise<ScriptGenerationResult> {
  const targetWords = Math.floor(targetDuration * WORDS_PER_SECOND)

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a creative copywriter. Refine the voiceover script based on feedback.
Output ONLY the refined spoken text, no formatting or directions.
Target word count: ${targetWords} words.`,
      },
      {
        role: 'user',
        content: `Original script:\n${originalScript}\n\nFeedback:\n${feedback}`,
      },
    ],
    temperature: 0.7,
    max_tokens: 500,
  })

  const script = response.choices[0]?.message?.content?.trim()
  if (!script) {
    throw new Error('OpenAI returned empty script content')
  }
  const wordCount = script.split(/\s+/).filter(Boolean).length
  const estimatedDuration = Math.round(wordCount / WORDS_PER_SECOND)

  return {
    script,
    wordCount,
    estimatedDuration,
  }
}
