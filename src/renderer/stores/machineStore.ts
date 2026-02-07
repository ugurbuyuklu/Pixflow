import { create } from 'zustand'
import { apiUrl, assetUrl, authFetch } from '../lib/api'
import type { GeneratedPrompt, BatchProgress, Avatar, Voice, ErrorInfo, MachineStep } from '../types'
import { parseError } from '../types'

type ScriptTone = 'casual' | 'professional' | 'energetic' | 'friendly' | 'dramatic'

function revokePreviews(previews: string[]) {
  for (const url of previews) URL.revokeObjectURL(url)
}

interface MachineState {
  step: MachineStep
  failedStep: MachineStep
  error: ErrorInfo | null

  concept: string
  promptCount: number
  refImages: File[]
  refPreviews: string[]
  scriptDuration: number
  scriptTone: ScriptTone
  selectedVoice: Voice | null
  selectedAvatar: Avatar | null

  prompts: GeneratedPrompt[]
  batchProgress: BatchProgress | null
  script: string
  audioUrl: string | null
  videoUrl: string | null

  setConcept: (concept: string) => void
  setPromptCount: (count: number) => void
  setScriptDuration: (duration: number) => void
  setScriptTone: (tone: ScriptTone) => void
  setSelectedVoice: (voice: Voice | null) => void
  setSelectedAvatar: (avatar: Avatar | null) => void
  addRefImages: (files: File[]) => void
  removeRefImage: (index: number) => void
  clearRefImages: () => void

  run: (resumeFrom?: MachineStep) => Promise<void>
  cancel: () => void
  reset: () => void
}

let abortController: AbortController | null = null

async function pollBatch(jobId: string, signal: AbortSignal, onProgress: (p: BatchProgress) => void): Promise<BatchProgress> {
  let failedPolls = 0
  while (!signal.aborted) {
    try {
      const res = await authFetch(apiUrl(`/api/generate/progress/${jobId}`), { signal })
      if (!res.ok) throw new Error(`${res.status}`)
      failedPolls = 0
      const data: BatchProgress = await res.json()
      onProgress(data)
      if (data.status === 'completed' || data.status === 'failed') return data
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      failedPolls++
      if (failedPolls >= 3) throw new Error('Lost connection to server during image generation')
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new DOMException('Aborted', 'AbortError')
}

export const useMachineStore = create<MachineState>()((set, get) => ({
  step: 'idle',
  failedStep: 'idle',
  error: null,

  concept: '',
  promptCount: 6,
  refImages: [],
  refPreviews: [],
  scriptDuration: 30,
  scriptTone: 'energetic',
  selectedVoice: null,
  selectedAvatar: null,

  prompts: [],
  batchProgress: null,
  script: '',
  audioUrl: null,
  videoUrl: null,

  setConcept: (concept) => set({ concept }),
  setPromptCount: (promptCount) => set({ promptCount }),
  setScriptDuration: (scriptDuration) => set({ scriptDuration }),
  setScriptTone: (scriptTone) => set({ scriptTone }),
  setSelectedVoice: (selectedVoice) => set({ selectedVoice }),
  setSelectedAvatar: (selectedAvatar) => set({ selectedAvatar }),

  addRefImages: (files) => set((state) => {
    revokePreviews(state.refPreviews)
    const newFiles = [...state.refImages, ...files].slice(0, 3)
    return {
      refImages: newFiles,
      refPreviews: newFiles.map((f) => URL.createObjectURL(f)),
    }
  }),

  removeRefImage: (index) => set((state) => {
    revokePreviews(state.refPreviews)
    const newFiles = state.refImages.filter((_, i) => i !== index)
    return {
      refImages: newFiles,
      refPreviews: newFiles.map((f) => URL.createObjectURL(f)),
    }
  }),

  clearRefImages: () => set((state) => {
    revokePreviews(state.refPreviews)
    return { refImages: [], refPreviews: [] }
  }),

  run: async (resumeFrom) => {
    const { concept, selectedAvatar, selectedVoice, promptCount, scriptDuration, scriptTone, refImages } = get()
    const avatarUrl = selectedAvatar?.url

    if (!concept.trim()) {
      set({ error: { message: 'Enter a concept to get started', type: 'warning' } })
      return
    }
    if (!avatarUrl) {
      set({ error: { message: 'Select an avatar for the video', type: 'warning' } })
      return
    }
    if (!selectedVoice) {
      set({ error: { message: 'Select a voice for the voiceover', type: 'warning' } })
      return
    }

    abortController?.abort()
    const controller = new AbortController()
    abortController = controller
    const { signal } = controller
    set({ error: null })

    const steps: MachineStep[] = ['prompts', 'images', 'script', 'tts', 'lipsync']
    const startIdx = resumeFrom ? steps.indexOf(resumeFrom) : 0

    let localPrompts = get().prompts
    let localScript = get().script
    let localAudioUrl = get().audioUrl
    let currentStep: MachineStep = 'idle'
    const voiceId = selectedVoice.id

    try {
      // Step 1: Generate Prompts
      if (startIdx <= 0) {
        currentStep = 'prompts'
        set({ step: currentStep })
        const res = await authFetch(apiUrl('/api/prompts/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ concept, count: promptCount }),
          signal,
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Prompt generation failed')
        const data = await res.json()
        localPrompts = data.prompts
        set({ prompts: localPrompts })
      }

      // Step 2: Generate Images
      if (startIdx <= 1) {
        currentStep = 'images'
        set({ step: currentStep, batchProgress: null })

        const avatarRes = await authFetch(assetUrl(avatarUrl), { signal })
        const avatarBlob = await avatarRes.blob()
        const avatarFile = new File([avatarBlob], avatarUrl.split('/').pop() || 'avatar.png', { type: avatarBlob.type })

        const formData = new FormData()
        formData.append('referenceImages', avatarFile)
        refImages.forEach((f) => formData.append('referenceImages', f))
        formData.append('concept', concept)
        formData.append('prompts', JSON.stringify(localPrompts))
        formData.append('aspectRatio', '9:16')
        formData.append('numImagesPerPrompt', '1')
        formData.append('resolution', '2K')
        formData.append('outputFormat', 'jpeg')

        const res = await authFetch(apiUrl('/api/generate/batch'), { method: 'POST', body: formData, signal })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Batch generation failed')
        const data = await res.json()
        set({
          batchProgress: {
            jobId: data.jobId, status: data.status, progress: 0,
            totalImages: data.totalImages, completedImages: 0, outputDir: data.outputDir, images: [],
          },
        })
        const result = await pollBatch(data.jobId, signal, (p) => set({ batchProgress: p }))
        if (result.status === 'failed') throw new Error('Image generation failed')
      }

      // Step 3: Generate Script
      if (startIdx <= 2) {
        currentStep = 'script'
        set({ step: currentStep })
        const res = await authFetch(apiUrl('/api/avatars/script'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ concept, duration: scriptDuration, tone: scriptTone }),
          signal,
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Script generation failed')
        const data = await res.json()
        localScript = data.script
        set({ script: localScript })
      }

      // Step 4: TTS
      if (startIdx <= 3) {
        currentStep = 'tts'
        set({ step: currentStep })
        const res = await authFetch(apiUrl('/api/avatars/tts'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: localScript, voiceId }),
          signal,
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'TTS failed')
        const data = await res.json()
        localAudioUrl = data.audioUrl
        set({ audioUrl: localAudioUrl })
      }

      // Step 5: Lipsync (auto-retry once)
      if (startIdx <= 4) {
        currentStep = 'lipsync'
        set({ step: currentStep })
        let lastErr: Error | null = null
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await authFetch(apiUrl('/api/avatars/lipsync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageUrl: avatarUrl, audioUrl: localAudioUrl }),
              signal,
            })
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}))
              throw new Error(errData.details || errData.error || 'Lipsync video failed')
            }
            const data = await res.json()
            if (data.success && data.localPath) set({ videoUrl: data.localPath })
            lastErr = null
            break
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err
            lastErr = err as Error
            if (attempt === 0) {
              console.log('[Machine] Lipsync attempt 1 failed, retrying in 3s...', lastErr.message)
              await new Promise((r) => setTimeout(r, 3000))
            }
          }
        }
        if (lastErr) throw lastErr
      }

      set({ step: 'done' })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      set({ failedStep: currentStep, step: 'error', error: parseError(err) })
    }
  },

  cancel: () => {
    abortController?.abort()
    abortController = null
    set({
      step: 'idle',
      prompts: [],
      batchProgress: null,
      script: '',
      audioUrl: null,
      videoUrl: null,
    })
  },

  reset: () => {
    abortController?.abort()
    abortController = null
    revokePreviews(get().refPreviews)
    set({
      step: 'idle',
      failedStep: 'idle',
      error: null,
      concept: '',
      prompts: [],
      batchProgress: null,
      script: '',
      audioUrl: null,
      videoUrl: null,
      refImages: [],
      refPreviews: [],
      selectedAvatar: null,
    })
  },
}))
