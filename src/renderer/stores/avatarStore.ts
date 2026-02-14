import { create } from 'zustand'
import { apiUrl, assetUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type {
  Avatar,
  AvatarStudioMode,
  ErrorInfo,
  LipsyncJob,
  ReactionAspectRatio,
  ReactionDuration,
  ReactionType,
  Voice,
} from '../types'
import { parseError } from '../types'

type AvatarGender = 'female' | 'male'
type AvatarAgeGroup = 'young-adult' | 'adult' | 'middle-aged'
type AvatarEthnicity = 'caucasian' | 'black' | 'asian' | 'hispanic' | 'middle-eastern' | 'south-asian'
type AvatarOutfit = 'casual' | 'business' | 'sporty' | 'elegant' | 'streetwear'
type ScriptTone = 'casual' | 'professional' | 'energetic' | 'friendly' | 'dramatic'
type TranslationAudioStatus = 'queued' | 'generating' | 'completed' | 'failed'

export const TALKING_AVATAR_LANGUAGE_CARDS = [
  { code: 'EN', label: 'English' },
  { code: 'TR', label: 'Turkish' },
  { code: 'ES', label: 'Spanish' },
  { code: 'FR', label: 'French' },
  { code: 'DE', label: 'German' },
  { code: 'IT', label: 'Italian' },
  { code: 'PT', label: 'Portuguese (Brazil)' },
  { code: 'AR', label: 'Arabic' },
  { code: 'RU', label: 'Russian' },
  { code: 'JA', label: 'Japanese' },
] as const

const LANGUAGE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  TALKING_AVATAR_LANGUAGE_CARDS.map((item) => [item.code, item.label]),
)
const MAX_TRANSLATION_LANGUAGES = 10
const TTS_BATCH_CONCURRENCY = 4
const LIPSYNC_BATCH_CONCURRENCY = 4
const RATE_LIMIT_MAX_RETRIES = 4
const RATE_LIMIT_BASE_DELAY_MS = 2500

interface TranslatedAudio {
  language: string
  script: string
  audioUrl: string | null
  status: TranslationAudioStatus
  error?: string
}

interface TranslatedVideo {
  language: string
  videoUrl: string | null
  status: TranslationAudioStatus
  error?: string
}

const AGE_DESCRIPTIONS: Record<AvatarAgeGroup, string> = {
  'young-adult': 'young adult in their 20s',
  adult: 'adult in their 30s',
  'middle-aged': 'middle-aged person in their 40s-50s',
}

const ETHNICITY_DESCRIPTIONS: Record<AvatarEthnicity, string> = {
  caucasian: 'caucasian',
  black: 'black/african',
  asian: 'east asian',
  hispanic: 'hispanic/latino',
  'middle-eastern': 'middle eastern',
  'south-asian': 'south asian',
}

const OUTFIT_VARIATIONS: Record<AvatarOutfit, string[]> = {
  casual: [
    'casual everyday t-shirt and jeans',
    'relaxed casual sweater and pants',
    'comfortable casual button-up shirt',
    'casual hoodie and casual pants',
    'simple casual polo shirt',
  ],
  business: [
    'professional business suit and tie',
    'formal business blazer and dress shirt',
    'executive business attire with vest',
    'crisp business shirt and slacks',
    'corporate business jacket and trousers',
  ],
  sporty: [
    'athletic track jacket and pants',
    'sporty gym t-shirt and shorts',
    'active sportswear hoodie',
    'performance athletic wear',
    'modern sports jersey and joggers',
  ],
  elegant: [
    'elegant formal suit',
    'sophisticated evening wear',
    'refined formal blazer and dress pants',
    'classy formal attire',
    'stylish formal outfit',
  ],
  streetwear: [
    'trendy oversized hoodie and joggers',
    'urban streetwear jacket and jeans',
    'modern street style outfit',
    'hip streetwear bomber jacket',
    'contemporary street fashion',
  ],
}

const EXPRESSION_VARIATIONS = [
  'friendly warm smile, direct eye contact with camera',
  'gentle smile, looking straight at viewer',
  'natural relaxed expression, eyes on camera',
  'soft smile, confident gaze at camera',
  'welcoming expression, direct eye contact',
]

const GREENBOX_PROMPT =
  'Using the provided reference image, preserve the face, identity, age, and pose exactly. Isolate the subject cleanly and place them on a solid chroma green (#00FF00) background. No extra objects or text. Keep clothing and proportions unchanged. High-quality cutout.'
const GREEN_THRESHOLD = {
  minGreen: 120,
  minDominance: 35,
  ratio: 0.6,
}

function normalizeLanguageCode(value: string): string {
  return value.trim().toUpperCase()
}

async function detectGreenScreen(file: File): Promise<boolean> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = url
    })

    const maxDim = 200
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return false

    ctx.drawImage(img, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    const margin = Math.max(2, Math.round(Math.min(width, height) * 0.12))
    let total = 0
    let green = 0

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (x > margin && x < width - margin && y > margin && y < height - margin) continue
        const idx = (y * width + x) * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        total += 1
        if (
          g >= GREEN_THRESHOLD.minGreen &&
          g - r >= GREEN_THRESHOLD.minDominance &&
          g - b >= GREEN_THRESHOLD.minDominance
        ) {
          green += 1
        }
      }
    }

    if (!total) return false
    return green / total >= GREEN_THRESHOLD.ratio
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function uploadSingleAvatar(file: File): Promise<Avatar> {
  const alreadyGreen = await detectGreenScreen(file)

  if (alreadyGreen) {
    const uploadFormData = new FormData()
    uploadFormData.append('files', file)
    const uploadRes = await authFetch(apiUrl('/api/avatars/upload'), {
      method: 'POST',
      body: uploadFormData,
    })
    if (!uploadRes.ok) {
      const raw = await uploadRes.json().catch(() => ({}))
      throw new Error(getApiError(raw, 'Upload failed'))
    }
    const raw = await uploadRes.json().catch(() => ({}))
    const data = unwrapApiData<{ avatars?: Avatar[] }>(raw)
    const uploadedAvatar = data.avatars?.[0]
    if (!uploadedAvatar) {
      throw new Error('Upload failed: avatar response missing')
    }
    return uploadedAvatar
  }

  const generateFormData = new FormData()
  generateFormData.append('referenceImage', file)
  generateFormData.append('prompt', GREENBOX_PROMPT)
  generateFormData.append('aspectRatio', '9:16')

  const generatedRes = await authFetchWithRateLimitRetry(apiUrl('/api/avatars/generate-from-reference'), {
    method: 'POST',
    body: generateFormData,
  })
  if (!generatedRes.ok) {
    const raw = await generatedRes.json().catch(() => ({}))
    throw new Error(getApiError(raw, 'Failed to process avatar'))
  }
  const generatedRaw = await generatedRes.json().catch(() => ({}))
  const generatedData = unwrapApiData<{ localPath: string }>(generatedRaw)
  const localPath = generatedData.localPath
  const filename = decodeURIComponent(localPath.split('/').pop() || `avatar_${Date.now()}.png`)
  return {
    name: filename,
    filename,
    url: localPath,
    source: 'generated',
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let index = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (index < items.length) {
        const current = index++
        await worker(items[current], current)
      }
    }),
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRateLimitDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.floor(seconds * 1000)
    }
    const dateMs = Date.parse(retryAfter)
    if (Number.isFinite(dateMs)) {
      const delta = dateMs - Date.now()
      if (delta > 0) return delta
    }
  }

  const resetHeader = response.headers.get('ratelimit-reset')
  if (resetHeader) {
    const resetSeconds = Number(resetHeader)
    if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
      const nowSeconds = Math.floor(Date.now() / 1000)
      const deltaSeconds = resetSeconds > nowSeconds ? resetSeconds - nowSeconds : resetSeconds
      if (deltaSeconds > 0 && deltaSeconds < 3600) {
        return deltaSeconds * 1000
      }
    }
  }

  return RATE_LIMIT_BASE_DELAY_MS * (attempt + 1)
}

async function authFetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
  maxRetries = RATE_LIMIT_MAX_RETRIES,
): Promise<Response> {
  let attempt = 0
  while (true) {
    const response = await authFetch(url, init)
    if (response.status !== 429 || attempt >= maxRetries) {
      return response
    }
    const waitMs = getRateLimitDelayMs(response, attempt)
    const jitterMs = Math.floor(Math.random() * 350)
    await sleep(waitMs + jitterMs)
    attempt += 1
  }
}

export const REACTION_DEFINITIONS: Record<ReactionType, { label: string; emoji: string; prompt: string }> = {
  sad: {
    label: 'Sad',
    emoji: '😢',
    prompt:
      'person looking down with sad expression, slight frown, eyes looking downward, subtle head movement showing disappointment',
  },
  upset: {
    label: 'Upset',
    emoji: '😠',
    prompt:
      'person showing frustration, furrowed brows, tight lips, slight head shake, showing annoyance and displeasure',
  },
  angry: {
    label: 'Angry',
    emoji: '😡',
    prompt: 'person with angry expression, intense eyes, clenched jaw, aggressive posture, showing strong anger',
  },
  disappointed: {
    label: 'Disappointed',
    emoji: '😞',
    prompt: 'person with disappointed look, lowered gaze, slight head shake, showing letdown and dissatisfaction',
  },
  sob: {
    label: 'Sobbing',
    emoji: '😭',
    prompt:
      'person crying, tears, face contorted in sorrow, shoulders shaking, hand covering face, deep emotional distress',
  },
  excited: {
    label: 'Excited',
    emoji: '🤩',
    prompt: 'person with wide smile, eyes bright, energetic movement, showing enthusiasm and joy',
  },
  surprised: {
    label: 'Surprised',
    emoji: '😲',
    prompt: 'person with shocked expression, eyes wide, mouth open, eyebrows raised, showing astonishment',
  },
  confused: {
    label: 'Confused',
    emoji: '😕',
    prompt: 'person with puzzled look, tilted head, squinted eyes, furrowed brow, showing bewilderment',
  },
  worried: {
    label: 'Worried',
    emoji: '😟',
    prompt: 'person with concerned expression, tense face, anxious eyes, showing nervousness and unease',
  },
  happy: {
    label: 'Happy',
    emoji: '😊',
    prompt: 'person with genuine smile, bright eyes, relaxed posture, showing contentment and joy',
  },
}

interface AvatarState {
  mode: 'gallery' | 'generate'
  avatars: Avatar[]
  avatarsLoading: boolean
  selectedAvatar: Avatar | null
  fullSizeAvatarUrl: string | null
  error: ErrorInfo | null

  gender: AvatarGender
  ageGroup: AvatarAgeGroup
  ethnicity: AvatarEthnicity
  outfit: AvatarOutfit
  avatarCount: number
  generating: boolean
  generatedUrls: string[]
  selectedGeneratedIndex: number
  generationProgress: number

  scriptConcept: string
  scriptDuration: number
  scriptTone: ScriptTone
  scriptGenerating: boolean
  generatedScript: string
  scriptWordCount: number
  scriptEstimatedDuration: number
  scriptHistory: string[]
  scriptHistoryIndex: number
  transcriptionRequestId: number
  autoDetectLanguage: boolean
  detectedLanguage: string | null
  translationLanguages: string[]
  translatedScripts: Array<{ language: string; script: string }>
  translatedAudios: TranslatedAudio[]
  translatedVideos: TranslatedVideo[]
  translationGenerating: boolean
  translationError: ErrorInfo | null

  voices: Voice[]
  voicesLoading: boolean
  selectedVoice: string | null
  audioMode: 'tts' | 'upload'
  ttsGenerating: boolean
  audioUploading: boolean
  generatedAudioUrl: string | null

  lipsyncGenerating: boolean
  lipsyncJob: LipsyncJob | null
  generatedVideoUrl: string | null

  scriptMode: 'existing' | 'audio' | 'fetch' | 'generate'
  transcribingVideo: boolean
  transcriptionError: ErrorInfo | null
  selectedVideoForTranscription: string | null

  studioMode: AvatarStudioMode
  selectedReaction: ReactionType | null
  reactionDuration: ReactionDuration
  reactionAspectRatio: ReactionAspectRatio
  reactionGenerating: boolean
  reactionVideoUrl: string | null
  reactionError: ErrorInfo | null

  setMode: (mode: 'gallery' | 'generate') => void
  setSelectedAvatar: (avatar: Avatar | null) => void
  setFullSizeAvatarUrl: (url: string | null) => void
  setGender: (gender: AvatarGender) => void
  setAgeGroup: (ageGroup: AvatarAgeGroup) => void
  setEthnicity: (ethnicity: AvatarEthnicity) => void
  setOutfit: (outfit: AvatarOutfit) => void
  setAvatarCount: (count: number) => void
  setSelectedGeneratedIndex: (index: number) => void
  setScriptConcept: (concept: string) => void
  setScriptDuration: (duration: number) => void
  setScriptTone: (tone: ScriptTone) => void
  setGeneratedScript: (script: string) => void
  undoScript: () => void
  redoScript: () => void
  setAutoDetectLanguage: (enabled: boolean) => void
  setTranslationLanguages: (languages: string[]) => void
  toggleTranslationLanguage: (language: string) => void
  clearTranslations: () => void
  setSelectedVoice: (voiceId: string | null) => void
  setAudioMode: (mode: 'tts' | 'upload') => void
  setScriptMode: (mode: 'existing' | 'audio' | 'fetch' | 'generate') => void
  setSelectedVideoForTranscription: (url: string | null) => void
  setStudioMode: (mode: AvatarStudioMode) => void
  setSelectedReaction: (reaction: ReactionType | null) => void
  setReactionDuration: (duration: ReactionDuration) => void
  setReactionAspectRatio: (aspectRatio: ReactionAspectRatio) => void

  loadAvatars: () => Promise<void>
  loadVoices: () => Promise<void>
  uploadAvatars: (files: FileList) => Promise<void>
  deleteUploadedAvatar: (filename: string) => Promise<void>
  generateAvatar: () => Promise<void>
  generateScript: () => Promise<void>
  refineScript: (instruction: string, targetDuration?: number) => Promise<void>
  translateScript: () => Promise<void>
  generateTranslationAudioBatch: () => Promise<void>
  generateTalkingAvatarVideosBatch: () => Promise<void>
  generateTTS: () => Promise<void>
  uploadAudio: (file: File) => Promise<string | null>
  createLipsync: () => Promise<void>
  generateReactionVideo: () => Promise<void>
  cancelReactionVideo: () => void
  transcribeVideo: (videoUrl: string) => Promise<void>
  sendToImageToPrompt: (imageUrl: string) => Promise<File | null>
}

export type { AvatarGender, AvatarAgeGroup, AvatarEthnicity, AvatarOutfit, ScriptTone }

export const useAvatarStore = create<AvatarState>()((set, get) => ({
  mode: 'gallery',
  avatars: [],
  avatarsLoading: false,
  selectedAvatar: null,
  fullSizeAvatarUrl: null,
  error: null,

  gender: 'female',
  ageGroup: 'young-adult',
  ethnicity: 'caucasian',
  outfit: 'casual',
  avatarCount: 1,
  generating: false,
  generatedUrls: [],
  selectedGeneratedIndex: 0,
  generationProgress: 0,

  scriptConcept: '',
  scriptDuration: 30,
  scriptTone: 'energetic',
  scriptGenerating: false,
  generatedScript: '',
  scriptWordCount: 0,
  scriptEstimatedDuration: 0,
  scriptHistory: [],
  scriptHistoryIndex: -1,
  transcriptionRequestId: 0,
  autoDetectLanguage: true,
  detectedLanguage: null,
  translationLanguages: ['EN'],
  translatedScripts: [],
  translatedAudios: [],
  translatedVideos: [],
  translationGenerating: false,
  translationError: null,

  voices: [],
  voicesLoading: false,
  selectedVoice: null,
  audioMode: 'tts',
  ttsGenerating: false,
  audioUploading: false,
  generatedAudioUrl: null,

  lipsyncGenerating: false,
  lipsyncJob: null,
  generatedVideoUrl: null,

  scriptMode: 'existing',
  transcribingVideo: false,
  transcriptionError: null,
  selectedVideoForTranscription: null,

  studioMode: 'talking',
  selectedReaction: null,
  reactionDuration: '5',
  reactionAspectRatio: '9:16',
  reactionGenerating: false,
  reactionVideoUrl: null,
  reactionError: null,

  setMode: (mode) => set({ mode }),
  setSelectedAvatar: (selectedAvatar) => set({ selectedAvatar }),
  setFullSizeAvatarUrl: (fullSizeAvatarUrl) => set({ fullSizeAvatarUrl }),
  setGender: (gender) => set({ gender }),
  setAgeGroup: (ageGroup) => set({ ageGroup }),
  setEthnicity: (ethnicity) => set({ ethnicity }),
  setOutfit: (outfit) => set({ outfit }),
  setAvatarCount: (avatarCount) => set({ avatarCount }),
  setSelectedGeneratedIndex: (selectedGeneratedIndex) => set({ selectedGeneratedIndex }),
  setScriptConcept: (scriptConcept) => set({ scriptConcept }),
  setScriptDuration: (scriptDuration) => set({ scriptDuration }),
  setScriptTone: (scriptTone) => set({ scriptTone }),
  setGeneratedScript: (generatedScript) => {
    const { scriptHistory, scriptHistoryIndex } = get()
    const newHistory = scriptHistory.slice(0, scriptHistoryIndex + 1)
    newHistory.push(generatedScript)
    set({
      generatedScript,
      scriptHistory: newHistory,
      scriptHistoryIndex: newHistory.length - 1,
      detectedLanguage: null,
      translatedScripts: [],
      translatedAudios: [],
      translatedVideos: [],
      translationError: null,
    })
  },
  undoScript: () => {
    const { scriptHistory, scriptHistoryIndex } = get()
    if (scriptHistoryIndex > 0) {
      const newIndex = scriptHistoryIndex - 1
      set({
        generatedScript: scriptHistory[newIndex],
        scriptHistoryIndex: newIndex,
        translatedScripts: [],
        translatedAudios: [],
        translatedVideos: [],
      })
    }
  },
  redoScript: () => {
    const { scriptHistory, scriptHistoryIndex } = get()
    if (scriptHistoryIndex < scriptHistory.length - 1) {
      const newIndex = scriptHistoryIndex + 1
      set({
        generatedScript: scriptHistory[newIndex],
        scriptHistoryIndex: newIndex,
        translatedScripts: [],
        translatedAudios: [],
        translatedVideos: [],
      })
    }
  },
  setAutoDetectLanguage: (autoDetectLanguage) => set({ autoDetectLanguage }),
  setTranslationLanguages: (translationLanguages) => set({ translationLanguages }),
  toggleTranslationLanguage: (language) => {
    set((state) => {
      const normalized = normalizeLanguageCode(language)
      if (!LANGUAGE_CODE_TO_NAME[normalized]) return state
      const next = new Set(state.translationLanguages)
      if (next.has(normalized)) {
        next.delete(normalized)
      } else {
        if (next.size >= MAX_TRANSLATION_LANGUAGES) return state
        next.add(normalized)
      }
      return {
        translationLanguages: Array.from(next),
        translatedScripts: [],
        translatedAudios: [],
        translatedVideos: [],
        translationError: null,
      }
    })
  },
  clearTranslations: () =>
    set({
      translatedScripts: [],
      translatedAudios: [],
      translatedVideos: [],
      detectedLanguage: null,
      translationError: null,
    }),
  setSelectedVoice: (selectedVoice) => set({ selectedVoice }),
  setAudioMode: (audioMode) => set({ audioMode }),
  setScriptMode: (scriptMode) => set({ scriptMode }),
  setSelectedVideoForTranscription: (selectedVideoForTranscription) => set({ selectedVideoForTranscription }),
  setStudioMode: (studioMode) => set({ studioMode }),
  setSelectedReaction: (selectedReaction) => set({ selectedReaction }),
  setReactionDuration: (reactionDuration) => set({ reactionDuration }),
  setReactionAspectRatio: (reactionAspectRatio) => set({ reactionAspectRatio }),

  loadAvatars: async () => {
    set({ avatarsLoading: true })
    try {
      const res = await authFetch(apiUrl('/api/avatars'))
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, `Failed to load avatars: ${res.status}`))
      }
      const raw = await res.json()
      const data = unwrapApiData<{ avatars: Avatar[] }>(raw)
      set({ avatars: data.avatars })
    } catch (err) {
      console.error('Failed to load avatars:', err)
    } finally {
      set({ avatarsLoading: false })
    }
  },

  loadVoices: async () => {
    const { voices } = get()
    if (voices.length > 0) return
    set({ voicesLoading: true })
    try {
      const res = await authFetch(apiUrl('/api/avatars/voices'))
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to load voices'))
      }
      const raw = await res.json()
      const data = unwrapApiData<{ voices?: Voice[] }>(raw)
      const loadedVoices = data.voices || []
      set({
        voices: loadedVoices,
        selectedVoice: get().selectedVoice || loadedVoices[0]?.id || null,
      })
    } catch (err) {
      console.error('Failed to load voices:', err)
    } finally {
      set({ voicesLoading: false })
    }
  },

  uploadAvatars: async (files) => {
    try {
      set({ error: null })
      const uploadedAvatars: Avatar[] = []
      for (const file of Array.from(files)) {
        const avatar = await uploadSingleAvatar(file)
        uploadedAvatars.push(avatar)
      }

      if (uploadedAvatars.length > 0) {
        const firstUploaded = uploadedAvatars[0]
        set((state) => ({
          avatars: [...uploadedAvatars, ...state.avatars],
          selectedAvatar: firstUploaded,
          generatedUrls: [],
          selectedGeneratedIndex: 0,
        }))
      }
      await get().loadAvatars()
    } catch (err) {
      const parsed = parseError(err)
      set({ error: parsed })
      throw parsed
    }
  },

  deleteUploadedAvatar: async (filename) => {
    try {
      set({ error: null })
      const res = await authFetch(apiUrl(`/api/avatars/upload/${encodeURIComponent(filename)}`), {
        method: 'DELETE',
      })
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to delete avatar'))
      }
      set((state) => ({
        avatars: state.avatars.filter((avatar) => avatar.filename !== filename),
      }))
    } catch (err) {
      const parsed = parseError(err)
      set({ error: parsed })
      throw parsed
    }
  },

  generateAvatar: async () => {
    const { gender, ageGroup, ethnicity, outfit, avatarCount } = get()

    set({ generating: true, error: null, generatedUrls: [], selectedGeneratedIndex: 0, generationProgress: 0 })

    const urls: string[] = []

    try {
      for (let i = 0; i < avatarCount; i++) {
        set({ generationProgress: i + 1 })

        const seed = Math.floor(Math.random() * 999999999)
        const outfitVariations = OUTFIT_VARIATIONS[outfit]
        const randomOutfit = outfitVariations[Math.floor(Math.random() * outfitVariations.length)]
        const randomExpression = EXPRESSION_VARIATIONS[Math.floor(Math.random() * EXPRESSION_VARIATIONS.length)]

        console.log(`[Avatar ${i + 1}] seed: ${seed}, outfit: ${randomOutfit}`)

        const prompt = `portrait photo of a ${AGE_DESCRIPTIONS[ageGroup]} ${ETHNICITY_DESCRIPTIONS[ethnicity]} ${gender}
background: solid green color (#1ebf1a)
outfit: ${randomOutfit}
pose: standing straight, body and face directly facing the camera, arms relaxed at sides
framing: medium shot from waist up
expression: ${randomExpression}
lighting: soft studio lighting, even illumination
sharp focus, detailed skin texture, 8k uhd, high resolution, photorealistic, professional photography`
        const res = await authFetch(apiUrl('/api/avatars/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, aspectRatio: '9:16', seed }),
        })

        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, 'Failed to generate avatar'))
        }

        const raw = await res.json()
        const data = unwrapApiData<{ localPath: string }>(raw)
        urls.push(data.localPath)
        set({ generatedUrls: [...urls] })
      }

      await get().loadAvatars()
    } catch (err) {
      set({ error: parseError(err) })
    } finally {
      set({ generating: false })
    }
  },

  generateScript: async () => {
    const { scriptConcept, scriptDuration, scriptTone } = get()
    if (!scriptConcept.trim()) {
      set({ error: { message: 'Please enter a concept', type: 'warning' } })
      return
    }

    set({ scriptGenerating: true, error: null })

    try {
      const res = await authFetch(apiUrl('/api/avatars/script'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept: scriptConcept, duration: scriptDuration, tone: scriptTone }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to generate script'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ script: string; wordCount: number; estimatedDuration: number }>(raw)
      get().setGeneratedScript(data.script)
      set({
        scriptWordCount: data.wordCount,
        scriptEstimatedDuration: data.estimatedDuration,
      })
    } catch (err) {
      set({ error: parseError(err) })
    } finally {
      set({ scriptGenerating: false })
    }
  },

  refineScript: async (instruction: string, targetDuration?: number) => {
    const { generatedScript } = get()
    if (!generatedScript.trim()) {
      set({ error: { message: 'No script to refine', type: 'warning' } })
      return
    }

    const wordCount = generatedScript.split(/\s+/).length
    const estimatedDuration = targetDuration || Math.ceil(wordCount / 2.5)

    set({ scriptGenerating: true, error: null })

    try {
      const res = await authFetch(apiUrl('/api/avatars/script/refine'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: generatedScript,
          feedback: instruction,
          duration: estimatedDuration,
        }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to refine script'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ script: string; wordCount: number; estimatedDuration: number }>(raw)
      get().setGeneratedScript(data.script)
      set({
        scriptWordCount: data.wordCount,
        scriptEstimatedDuration: data.estimatedDuration,
      })
    } catch (err) {
      set({ error: parseError(err) })
    } finally {
      set({ scriptGenerating: false })
    }
  },

  translateScript: async () => {
    const { generatedScript, translationLanguages, autoDetectLanguage } = get()
    if (!generatedScript.trim()) {
      set({ translationError: { message: 'No script to translate', type: 'warning' } })
      return
    }

    let enabledLanguages = translationLanguages
      .map((value) => normalizeLanguageCode(value))
      .filter((code) => Boolean(LANGUAGE_CODE_TO_NAME[code]))

    let detectedLanguage: string | null = null
    if (autoDetectLanguage) {
      try {
        const detectRes = await authFetch(apiUrl('/api/avatars/script/detect'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: generatedScript }),
        })
        if (detectRes.ok) {
          const detectRaw = await detectRes.json()
          const detectData = unwrapApiData<{ languageCode?: string }>(detectRaw)
          const normalized = normalizeLanguageCode(detectData.languageCode || '')
          if (LANGUAGE_CODE_TO_NAME[normalized]) {
            detectedLanguage = normalized
            if (!enabledLanguages.includes(normalized)) {
              enabledLanguages = [normalized, ...enabledLanguages].slice(0, MAX_TRANSLATION_LANGUAGES)
            }
          }
        }
      } catch {
        // Auto-detect is best effort; keep manual language selection if detection fails.
      }
    }

    if (enabledLanguages.length === 0) {
      set({ translationError: { message: 'Select at least one language', type: 'warning' } })
      return
    }

    set({
      translationGenerating: true,
      translationError: null,
      translatedScripts: [],
      translatedAudios: [],
      translatedVideos: [],
      detectedLanguage,
      translationLanguages: enabledLanguages,
    })

    try {
      const languageNames = enabledLanguages.map((code) => LANGUAGE_CODE_TO_NAME[code]).filter(Boolean)
      const res = await authFetch(apiUrl('/api/avatars/script/translate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: generatedScript, languages: languageNames }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to translate script'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ translations: Array<{ language: string; script: string }> }>(raw)
      const byLanguageName = new Map<string, string>(
        (data.translations || []).map((item) => [item.language.trim().toLowerCase(), item.script || '']),
      )
      const translatedScripts = enabledLanguages.map((code) => {
        const languageName = LANGUAGE_CODE_TO_NAME[code]
        const translated = byLanguageName.get(languageName.toLowerCase())?.trim() || ''
        return {
          language: code,
          script: translated || (detectedLanguage === code ? generatedScript.trim() : ''),
        }
      })
      set({ translatedScripts })
    } catch (err) {
      set({ translationError: parseError(err) })
    } finally {
      set({ translationGenerating: false })
    }
  },

  generateTranslationAudioBatch: async () => {
    const { selectedVoice } = get()
    if (!selectedVoice) {
      set({ translationError: { message: 'Please select a voice', type: 'warning' } })
      return
    }

    await get().translateScript()
    const translatedScripts = get().translatedScripts.filter((item) => item.script.trim())
    if (translatedScripts.length === 0) return

    set({
      translationGenerating: true,
      translationError: null,
      translatedAudios: translatedScripts.map((item) => ({
        language: item.language,
        script: item.script,
        audioUrl: null,
        status: 'queued',
      })),
      translatedVideos: [],
      generatedAudioUrl: null,
    })

    await runWithConcurrency(translatedScripts, TTS_BATCH_CONCURRENCY, async (item) => {
      set((state) => ({
        translatedAudios: state.translatedAudios.map((audio) =>
          audio.language === item.language ? { ...audio, status: 'generating', error: undefined } : audio,
        ),
      }))

      try {
        const res = await authFetchWithRateLimitRetry(apiUrl('/api/avatars/tts'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: item.script, voiceId: selectedVoice }),
        })

        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, `TTS failed for ${item.language}`))
        }

        const raw = await res.json()
        const data = unwrapApiData<{ audioUrl: string }>(raw)
        set((state) => ({
          translatedAudios: state.translatedAudios.map((audio) =>
            audio.language === item.language
              ? { ...audio, status: 'completed', audioUrl: data.audioUrl, error: undefined }
              : audio,
          ),
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : `TTS failed for ${item.language}`
        set((state) => ({
          translatedAudios: state.translatedAudios.map((audio) =>
            audio.language === item.language ? { ...audio, status: 'failed', error: message } : audio,
          ),
        }))
      }
    })

    const firstCompletedAudio = get().translatedAudios.find((item) => item.status === 'completed' && item.audioUrl)
    set({
      generatedAudioUrl: firstCompletedAudio?.audioUrl || null,
      translationGenerating: false,
    })
  },

  generateTalkingAvatarVideosBatch: async () => {
    const {
      selectedVoice,
      generatedScript,
      translationLanguages,
      generatedUrls,
      selectedGeneratedIndex,
      selectedAvatar,
    } = get()
    if (!generatedScript.trim()) {
      set({ translationError: { message: 'Please generate a script first', type: 'warning' } })
      return
    }
    if (!selectedVoice) {
      set({ translationError: { message: 'Please select a voice', type: 'warning' } })
      return
    }
    if (translationLanguages.length === 0) {
      set({ translationError: { message: 'Select at least one language', type: 'warning' } })
      return
    }
    const avatarUrl = generatedUrls[selectedGeneratedIndex] || selectedAvatar?.url || null
    if (!avatarUrl) {
      set({ translationError: { message: 'Select an avatar to generate videos', type: 'warning' } })
      return
    }

    await get().generateTranslationAudioBatch()

    const { translatedAudios } = get()
    const readyAudios = translatedAudios.filter((item) => item.status === 'completed' && item.audioUrl)
    if (readyAudios.length === 0) return

    set({
      lipsyncGenerating: true,
      translationError: null,
      translatedVideos: readyAudios.map((item) => ({
        language: item.language,
        status: 'queued',
        videoUrl: null,
      })),
      generatedVideoUrl: null,
    })

    await runWithConcurrency(readyAudios, LIPSYNC_BATCH_CONCURRENCY, async (item) => {
      set((state) => ({
        translatedVideos: state.translatedVideos.map((video) =>
          video.language === item.language ? { ...video, status: 'generating', error: undefined } : video,
        ),
      }))

      try {
        const res = await authFetchWithRateLimitRetry(apiUrl('/api/avatars/lipsync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: avatarUrl || undefined,
            audioUrl: item.audioUrl,
          }),
        })
        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, `Video generation failed for ${item.language}`))
        }

        const raw = await res.json()
        const data = unwrapApiData<{ localPath?: string }>(raw)
        if (!data.localPath) {
          throw new Error(`No output file returned for ${item.language}`)
        }
        set((state) => ({
          translatedVideos: state.translatedVideos.map((video) =>
            video.language === item.language
              ? { ...video, status: 'completed', videoUrl: data.localPath, error: undefined }
              : video,
          ),
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : `Video generation failed for ${item.language}`
        set((state) => ({
          translatedVideos: state.translatedVideos.map((video) =>
            video.language === item.language ? { ...video, status: 'failed', error: message } : video,
          ),
        }))
      }
    })

    const firstCompletedVideo = get().translatedVideos.find((item) => item.status === 'completed' && item.videoUrl)
    set({
      generatedVideoUrl: firstCompletedVideo?.videoUrl || null,
      lipsyncGenerating: false,
    })
  },

  generateTTS: async () => {
    const { generatedScript, selectedVoice } = get()
    if (!generatedScript.trim()) {
      set({ error: { message: 'Please generate a script first', type: 'warning' } })
      return
    }
    if (!selectedVoice) {
      set({ error: { message: 'Please select a voice', type: 'warning' } })
      return
    }

    set({ ttsGenerating: true, error: null, generatedAudioUrl: null })

    try {
      const res = await authFetchWithRateLimitRetry(apiUrl('/api/avatars/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: generatedScript, voiceId: selectedVoice }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to generate audio'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ audioUrl: string }>(raw)
      set({ generatedAudioUrl: data.audioUrl })
    } catch (err) {
      set({ error: parseError(err) })
    } finally {
      set({ ttsGenerating: false })
    }
  },

  uploadAudio: async (file: File) => {
    set({ audioUploading: true, error: null, generatedAudioUrl: null })

    try {
      const formData = new FormData()
      formData.append('audio', file)

      const res = await authFetch(apiUrl('/api/avatars/upload-audio'), {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to upload audio'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ audioUrl: string }>(raw)
      set({ generatedAudioUrl: data.audioUrl })
      return data.audioUrl
    } catch (err) {
      set({ error: parseError(err) })
      return null
    } finally {
      set({ audioUploading: false })
    }
  },

  createLipsync: async () => {
    const { generatedUrls, selectedGeneratedIndex, selectedAvatar, generatedAudioUrl } = get()
    const avatarUrl = generatedUrls[selectedGeneratedIndex] || selectedAvatar?.url

    if (!generatedAudioUrl) {
      set({ error: { message: 'Please generate audio first', type: 'warning' } })
      return
    }

    // If no avatar selected, this is audio-only voiceover
    if (!avatarUrl) {
      set({
        error: null,
        generatedVideoUrl: generatedAudioUrl, // Set audio as the "video" output for download
      })
      return
    }

    set({ lipsyncGenerating: true, error: null, lipsyncJob: null, generatedVideoUrl: null })

    try {
      const res = await authFetchWithRateLimitRetry(apiUrl('/api/avatars/lipsync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: avatarUrl, audioUrl: generatedAudioUrl }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to create lipsync video'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ localPath?: string }>(raw)
      if (data.localPath) {
        set({
          generatedVideoUrl: data.localPath,
          lipsyncJob: { id: `lipsync_${Date.now()}`, status: 'complete', videoUrl: data.localPath },
        })
      }
    } catch (err) {
      set({ error: parseError(err) })
    } finally {
      set({ lipsyncGenerating: false })
    }
  },

  transcribeVideo: async (videoUrl: string) => {
    if (!videoUrl) {
      set({ transcriptionError: { message: 'Please select a video', type: 'warning' } })
      return
    }

    // Increment request ID to invalidate previous requests
    const currentRequestId = get().transcriptionRequestId + 1
    const clientRequestId = `transcribe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    set({
      transcribingVideo: true,
      transcriptionError: null,
      generatedScript: '',
      scriptHistory: [],
      scriptHistoryIndex: -1,
      transcriptionRequestId: currentRequestId,
      detectedLanguage: null,
      translatedScripts: [],
      translatedAudios: [],
      translatedVideos: [],
      translationError: null,
    })

    try {
      const res = await authFetch(apiUrl('/api/videos/transcribe'), {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Request-Id': clientRequestId,
        },
        body: JSON.stringify({ videoUrl }),
      })

      // Check if this request is still current (not superseded by newer request)
      if (get().transcriptionRequestId !== currentRequestId) {
        console.log('[Transcribe] Ignoring stale response (request superseded)')
        return
      }

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to transcribe video'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ transcript: string; duration: number; language?: string }>(raw)

      // Double-check request ID before setting transcript
      if (get().transcriptionRequestId !== currentRequestId) {
        console.log('[Transcribe] Ignoring stale transcript (request superseded)')
        return
      }

      console.log('[Transcribe] Client request id:', clientRequestId)
      console.log('[Transcribe] Received transcript:', data.transcript.substring(0, 100))
      console.log('[Transcribe] Video URL was:', videoUrl)
      get().setGeneratedScript(data.transcript)
    } catch (err) {
      // Only set error if this request is still current
      if (get().transcriptionRequestId === currentRequestId) {
        set({ transcriptionError: parseError(err) })
      }
    } finally {
      // Only clear loading state if this request is still current
      if (get().transcriptionRequestId === currentRequestId) {
        set({ transcribingVideo: false })
      }
    }
  },

  generateReactionVideo: async () => {
    const {
      generatedUrls,
      selectedGeneratedIndex,
      selectedAvatar,
      selectedReaction,
      reactionDuration,
      reactionAspectRatio,
    } = get()

    const avatarUrl = generatedUrls[selectedGeneratedIndex] || selectedAvatar?.url
    if (!avatarUrl) {
      set({ reactionError: { message: 'Please select or generate an avatar', type: 'warning' } })
      return
    }
    if (!selectedReaction) {
      set({ reactionError: { message: 'Please choose a reaction', type: 'warning' } })
      return
    }

    set({ reactionGenerating: true, reactionError: null, reactionVideoUrl: null })

    try {
      const res = await authFetch(apiUrl('/api/avatars/reaction'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: avatarUrl,
          reaction: selectedReaction,
          duration: reactionDuration,
          aspectRatio: reactionAspectRatio,
        }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to generate reaction video'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ localPath: string }>(raw)
      set({ reactionVideoUrl: data.localPath })
    } catch (err) {
      set({ reactionError: parseError(err) })
    } finally {
      set({ reactionGenerating: false })
    }
  },

  cancelReactionVideo: () => {
    set({ reactionGenerating: false, reactionError: null })
  },

  sendToImageToPrompt: async (imageUrl) => {
    try {
      const res = await authFetch(assetUrl(imageUrl))
      const blob = await res.blob()
      const filename = imageUrl.split('/').pop() || 'generated-image.png'
      return new File([blob], filename, { type: blob.type })
    } catch {
      console.error('Failed to load image for analysis')
      return null
    }
  },
}))
