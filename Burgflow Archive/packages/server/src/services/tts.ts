import { fal } from '@fal-ai/client'
import fs from 'fs/promises'
import path from 'path'

let falConfigured = false

function ensureFalConfig() {
  if (!falConfigured) {
    fal.config({ credentials: process.env.FAL_API_KEY })
    falConfigured = true
  }
}

const TTS_MODEL = 'fal-ai/elevenlabs/tts/eleven-v3'

export interface Voice {
  id: string
  name: string
  category?: string
  previewUrl?: string
  labels?: Record<string, string>
}

export interface TTSOptions {
  voiceId: string
  text: string
  outputPath: string
  modelId?: string
  stability?: number
  similarityBoost?: number
  speed?: number
}

export interface TTSResult {
  audioPath: string
  durationMs?: number
}

/**
 * Convert text to speech using fal.ai ElevenLabs API.
 * Returns the path to the generated audio file.
 */
export async function textToSpeech(options: TTSOptions): Promise<TTSResult> {
  ensureFalConfig()

  console.log(`[TTS] Converting text to speech with voice: ${options.voiceId}`)

  const result = await fal.subscribe(TTS_MODEL, {
    input: {
      text: options.text,
      voice: options.voiceId,
      stability: options.stability ?? 0.5,
      similarity_boost: options.similarityBoost ?? 0.75,
      speed: options.speed ?? 1,
      apply_text_normalization: 'auto',
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS' && update.logs) {
        update.logs.forEach((log) => console.log(`[fal.ai TTS] ${log.message}`))
      }
    },
  })

  const audioUrl = result.data?.audio?.url
  if (!audioUrl) {
    throw new Error('No audio generated')
  }

  await fs.mkdir(path.dirname(options.outputPath), { recursive: true })

  const response = await fetch(audioUrl)
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(options.outputPath, buffer)

  console.log(`[TTS] Audio saved to ${options.outputPath}`)

  return {
    audioPath: options.outputPath,
  }
}

/**
 * List all available voices from ElevenLabs via fal.ai.
 * Returns a curated list of high-quality voices.
 */
export async function listVoices(): Promise<Voice[]> {
  return [
    { id: 'Aria', name: 'Aria', category: 'female', labels: { accent: 'American', age: 'young' } },
    { id: 'Roger', name: 'Roger', category: 'male', labels: { accent: 'American', age: 'middle-aged' } },
    { id: 'Sarah', name: 'Sarah', category: 'female', labels: { accent: 'American', age: 'young' } },
    { id: 'Laura', name: 'Laura', category: 'female', labels: { accent: 'American', age: 'young' } },
    { id: 'Charlie', name: 'Charlie', category: 'male', labels: { accent: 'Australian', age: 'middle-aged' } },
    { id: 'George', name: 'George', category: 'male', labels: { accent: 'British', age: 'middle-aged' } },
    { id: 'Callum', name: 'Callum', category: 'male', labels: { accent: 'Transatlantic', age: 'middle-aged' } },
    { id: 'River', name: 'River', category: 'non-binary', labels: { accent: 'American', age: 'young' } },
    { id: 'Lily', name: 'Lily', category: 'female', labels: { accent: 'British', age: 'middle-aged' } },
    { id: 'Bill', name: 'Bill', category: 'male', labels: { accent: 'American', age: 'old' } },
  ]
}

/**
 * Get a specific voice by ID.
 */
export async function getVoice(voiceId: string): Promise<Voice | null> {
  const voices = await listVoices()
  return voices.find((v) => v.id === voiceId) || null
}

/**
 * Get available TTS models.
 */
export function getAvailableModels() {
  return [
    { id: 'eleven_v3', name: 'ElevenLabs v3', description: 'Latest ElevenLabs model via fal.ai' },
  ]
}
