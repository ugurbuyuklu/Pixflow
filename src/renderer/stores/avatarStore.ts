import { create } from 'zustand'
import { apiUrl, assetUrl, authFetch } from '../lib/api'
import type { Avatar, Voice, LipsyncJob, ErrorInfo } from '../types'
import { parseError } from '../types'

type AvatarGender = 'female' | 'male'
type AvatarAgeGroup = 'young-adult' | 'adult' | 'middle-aged'
type AvatarEthnicity = 'caucasian' | 'black' | 'asian' | 'hispanic' | 'middle-eastern' | 'south-asian'
type AvatarOutfit = 'casual' | 'business' | 'sporty' | 'elegant' | 'streetwear'
type ScriptTone = 'casual' | 'professional' | 'energetic' | 'friendly' | 'dramatic'

const AGE_DESCRIPTIONS: Record<AvatarAgeGroup, string> = {
  'young-adult': 'young adult in their 20s',
  'adult': 'adult in their 30s',
  'middle-aged': 'middle-aged person in their 40s-50s',
}

const ETHNICITY_DESCRIPTIONS: Record<AvatarEthnicity, string> = {
  'caucasian': 'caucasian',
  'black': 'black/african',
  'asian': 'east asian',
  'hispanic': 'hispanic/latino',
  'middle-eastern': 'middle eastern',
  'south-asian': 'south asian',
}

const OUTFIT_DESCRIPTIONS: Record<AvatarOutfit, string> = {
  'casual': 'casual everyday clothes',
  'business': 'professional business attire',
  'sporty': 'athletic sportswear',
  'elegant': 'elegant formal outfit',
  'streetwear': 'trendy streetwear',
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

  voices: Voice[]
  voicesLoading: boolean
  selectedVoice: Voice | null
  ttsGenerating: boolean
  generatedAudioUrl: string | null

  lipsyncGenerating: boolean
  lipsyncJob: LipsyncJob | null
  generatedVideoUrl: string | null

  i2vPrompt: string
  i2vDuration: '5' | '10'
  i2vLoading: boolean
  i2vVideoUrl: string | null
  i2vError: ErrorInfo | null

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
  setSelectedVoice: (voice: Voice | null) => void
  setI2vPrompt: (prompt: string) => void
  setI2vDuration: (duration: '5' | '10') => void

  loadAvatars: () => Promise<void>
  loadVoices: () => Promise<void>
  uploadAvatars: (files: FileList) => Promise<void>
  generateAvatar: () => Promise<void>
  generateScript: () => Promise<void>
  generateTTS: () => Promise<void>
  createLipsync: () => Promise<void>
  generateI2V: () => Promise<void>
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

  voices: [],
  voicesLoading: false,
  selectedVoice: null,
  ttsGenerating: false,
  generatedAudioUrl: null,

  lipsyncGenerating: false,
  lipsyncJob: null,
  generatedVideoUrl: null,

  i2vPrompt: '',
  i2vDuration: '5',
  i2vLoading: false,
  i2vVideoUrl: null,
  i2vError: null,

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
  setGeneratedScript: (generatedScript) => set({ generatedScript }),
  setSelectedVoice: (selectedVoice) => set({ selectedVoice }),
  setI2vPrompt: (i2vPrompt) => set({ i2vPrompt }),
  setI2vDuration: (i2vDuration) => set({ i2vDuration }),

  loadAvatars: async () => {
    set({ avatarsLoading: true })
    try {
      const res = await authFetch(apiUrl('/api/avatars'))
      if (!res.ok) throw new Error(`Failed to load avatars: ${res.status}`)
      const data = await res.json()
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
      if (res.ok) {
        const data = await res.json()
        const loadedVoices = data.voices || []
        set({
          voices: loadedVoices,
          selectedVoice: get().selectedVoice || loadedVoices[0] || null,
        })
      }
    } catch (err) {
      console.error('Failed to load voices:', err)
    } finally {
      set({ voicesLoading: false })
    }
  },

  uploadAvatars: async (files) => {
    const formData = new FormData()
    Array.from(files).forEach((f) => formData.append('files', f))

    try {
      const res = await authFetch(apiUrl('/api/avatars/upload'), {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Upload failed')
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
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to generate avatar')
        }

        const data = await res.json()
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
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to generate script')
      }

      const data = await res.json()
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
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to generate audio')
      }

      const data = await res.json()
      set({ generatedAudioUrl: data.audioUrl })
    } catch (err) {
      set({ error: parseError(err) })
    } finally {
      set({ ttsGenerating: false })
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
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create lipsync video')
      }

      const data = await res.json()
      if (data.success && data.localPath) {
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

  generateI2V: async () => {
    const { generatedUrls, selectedGeneratedIndex, selectedAvatar, i2vPrompt, i2vDuration } = get()
    const imageUrl = generatedUrls[selectedGeneratedIndex] || selectedAvatar?.url
    if (!imageUrl) {
      set({ i2vError: { message: 'Please select or generate an avatar', type: 'warning' } })
      return
    }
    if (!i2vPrompt.trim()) {
      set({ i2vError: { message: 'Please enter a motion prompt', type: 'warning' } })
      return
    }

    set({ i2vLoading: true, i2vError: null, i2vVideoUrl: null })

    try {
      const res = await authFetch(apiUrl('/api/avatars/i2v'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, prompt: i2vPrompt, duration: i2vDuration }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to generate video')
      }

      const data = await res.json()
      set({ i2vVideoUrl: data.localPath })
    } catch (err) {
      set({ i2vError: parseError(err) })
    } finally {
      set({ i2vLoading: false })
    }
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
