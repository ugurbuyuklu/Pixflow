import { create } from 'zustand'
import { apiUrl, assetUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type { Avatar, AvatarStudioMode, ErrorInfo, LipsyncJob, ReactionAspectRatio, ReactionDuration, ReactionType, Voice } from '../types'
import { parseError } from '../types'

type AvatarGender = 'female' | 'male'
type AvatarAgeGroup = 'young-adult' | 'adult' | 'middle-aged'
type AvatarEthnicity = 'caucasian' | 'black' | 'asian' | 'hispanic' | 'middle-eastern' | 'south-asian'
type AvatarOutfit = 'casual' | 'business' | 'sporty' | 'elegant' | 'streetwear'
type ScriptTone = 'casual' | 'professional' | 'energetic' | 'friendly' | 'dramatic'

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

const OUTFIT_DESCRIPTIONS: Record<AvatarOutfit, string> = {
  casual: 'casual everyday clothes',
  business: 'professional business attire',
  sporty: 'athletic sportswear',
  elegant: 'elegant formal outfit',
  streetwear: 'trendy streetwear',
}

export const REACTION_DEFINITIONS: Record<ReactionType, { label: string; emoji: string; prompt: string }> = {
  sad: {
    label: 'Sad',
    emoji: '😢',
    prompt: 'person looking down with sad expression, slight frown, eyes looking downward, subtle head movement showing disappointment',
  },
  upset: {
    label: 'Upset',
    emoji: '😠',
    prompt: 'person showing frustration, furrowed brows, tight lips, slight head shake, showing annoyance and displeasure',
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
    prompt: 'person crying, tears, face contorted in sorrow, shoulders shaking, hand covering face, deep emotional distress',
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

  voices: Voice[]
  voicesLoading: boolean
  selectedVoice: Voice | null
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
  setSelectedVoice: (voice: Voice | null) => void
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
  generateAvatar: () => Promise<void>
  generateScript: () => Promise<void>
  refineScript: (instruction: string, targetDuration?: number) => Promise<void>
  generateTTS: () => Promise<void>
  uploadAudio: (file: File) => Promise<void>
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
    })
  },
  undoScript: () => {
    const { scriptHistory, scriptHistoryIndex } = get()
    if (scriptHistoryIndex > 0) {
      const newIndex = scriptHistoryIndex - 1
      set({
        generatedScript: scriptHistory[newIndex],
        scriptHistoryIndex: newIndex,
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
      })
    }
  },
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
        selectedVoice: get().selectedVoice || loadedVoices[0] || null,
      })
    } catch (err) {
      console.error('Failed to load voices:', err)
    } finally {
      set({ voicesLoading: false })
    }
  },

  uploadAvatars: async (files) => {
    const formData = new FormData()
    // biome-ignore lint/suspicious/useIterableCallbackReturn: side-effect FormData append
    Array.from(files).forEach((f) => formData.append('files', f))

    try {
      const res = await authFetch(apiUrl('/api/avatars/upload'), {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Upload failed'))
      }
      await get().loadAvatars()
    } catch (err) {
      set({ error: parseError(err) })
    }
  },

  generateAvatar: async () => {
    const { gender, ageGroup, ethnicity, outfit, avatarCount } = get()

    set({ generating: true, error: null, generatedUrls: [], selectedGeneratedIndex: 0, generationProgress: 0 })

    const prompt = `portrait photo of a ${AGE_DESCRIPTIONS[ageGroup]} ${ETHNICITY_DESCRIPTIONS[ethnicity]} ${gender}
background: solid green color (1ebf1a)
outfit: ${OUTFIT_DESCRIPTIONS[outfit]}
pose: standing straight, body and face directly facing the camera, arms relaxed at sides
framing: medium shot from waist up
expression: friendly, warm smile, direct eye contact with camera, looking straight at viewer
lighting: soft studio lighting, even illumination
sharp focus, detailed skin texture, 8k uhd, high resolution, photorealistic, professional photography`

    const urls: string[] = []

    try {
      for (let i = 0; i < avatarCount; i++) {
        set({ generationProgress: i + 1 })

        const res = await authFetch(apiUrl('/api/avatars/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, aspectRatio: '9:16' }),
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
      set({
        generatedScript: data.script,
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
      set({
        generatedScript: data.script,
        scriptWordCount: data.wordCount,
        scriptEstimatedDuration: data.estimatedDuration,
      })
    } catch (err) {
      set({ error: parseError(err) })
    } finally {
      set({ scriptGenerating: false })
    }
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
      const res = await authFetch(apiUrl('/api/avatars/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: generatedScript, voiceId: selectedVoice.id }),
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
    } catch (err) {
      set({ error: parseError(err) })
    } finally {
      set({ audioUploading: false })
    }
  },

  createLipsync: async () => {
    const { generatedUrls, selectedGeneratedIndex, selectedAvatar, generatedAudioUrl } = get()
    const avatarUrl = generatedUrls[selectedGeneratedIndex] || selectedAvatar?.url
    if (!avatarUrl) {
      set({ error: { message: 'Please select or generate an avatar', type: 'warning' } })
      return
    }
    if (!generatedAudioUrl) {
      set({ error: { message: 'Please generate audio first', type: 'warning' } })
      return
    }

    set({ lipsyncGenerating: true, error: null, lipsyncJob: null, generatedVideoUrl: null })

    try {
      const res = await authFetch(apiUrl('/api/avatars/lipsync'), {
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

    set({ transcribingVideo: true, transcriptionError: null })

    try {
      const res = await authFetch(apiUrl('/api/videos/transcribe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to transcribe video'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ transcript: string; duration: number; language?: string }>(raw)
      set({ generatedScript: data.transcript })
    } catch (err) {
      set({ transcriptionError: parseError(err) })
    } finally {
      set({ transcribingVideo: false })
    }
  },

  generateReactionVideo: async () => {
    const { generatedUrls, selectedGeneratedIndex, selectedAvatar, selectedReaction, reactionDuration, reactionAspectRatio } = get()

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
