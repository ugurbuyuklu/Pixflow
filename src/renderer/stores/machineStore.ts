import { create } from 'zustand'
import { apiUrl, assetUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type { Avatar, BatchProgress, ErrorInfo, GeneratedPrompt, MachineStep, Voice } from '../types'
import { parseError } from '../types'

type ScriptTone = 'casual' | 'professional' | 'energetic' | 'friendly' | 'dramatic'

function revokePreviews(previews: string[]) {
  for (const url of previews) URL.revokeObjectURL(url)
}

async function fetchScript({
  concept,
  duration,
  tone,
  appName,
  signal,
}: {
  concept: string
  duration: number
  tone: ScriptTone
  appName?: string
  signal?: AbortSignal
}): Promise<string> {
  const res = await authFetch(apiUrl('/api/avatars/script'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ concept, duration, tone, appName }),
    signal,
  })
  if (!res.ok) {
    const raw = await res.json().catch(() => ({}))
    throw new Error(getApiError(raw, 'Script generation failed'))
  }
  const raw = await res.json()
  const data = unwrapApiData<{ script: string }>(raw)
  return data.script
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
  selectedApp: string
  selectedVoice: Voice | null
  selectedAvatar: Avatar | null
  selectedAvatars: Avatar[]

  prompts: GeneratedPrompt[]
  batchProgress: BatchProgress | null
  script: string
  scriptGenerating: boolean
  scriptHistory: string[]
  scriptHistoryIndex: number
  audioUrl: string | null
  videoUrl: string | null

  setConcept: (concept: string) => void
  setPromptCount: (count: number) => void
  setScriptDuration: (duration: number) => void
  setScriptTone: (tone: ScriptTone) => void
  setSelectedApp: (appName: string) => void
  setSelectedVoice: (voice: Voice | null) => void
  setSelectedAvatar: (avatar: Avatar | null) => void
  toggleGalleryAvatar: (avatar: Avatar) => void
  setScript: (script: string) => void
  undoScript: () => void
  redoScript: () => void
  addRefImages: (files: File[]) => void
  removeRefImage: (index: number) => void
  clearRefImages: () => void

  generateScript: () => Promise<string | null>
  refineScript: (instruction: string, targetDuration?: number) => Promise<void>
  run: (resumeFrom?: MachineStep) => Promise<void>
  cancel: () => void
  reset: () => void
}

let abortController: AbortController | null = null

async function pollBatch(
  jobId: string,
  signal: AbortSignal,
  onProgress: (p: BatchProgress) => void,
): Promise<BatchProgress> {
  let failedPolls = 0
  while (!signal.aborted) {
    try {
      const res = await authFetch(apiUrl(`/api/generate/progress/${jobId}`), { signal })
      if (!res.ok) throw new Error(`${res.status}`)
      failedPolls = 0
      const raw = await res.json()
      const data = unwrapApiData<BatchProgress>(raw)
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
  promptCount: 5,
  refImages: [],
  refPreviews: [],
  scriptDuration: 15,
  scriptTone: 'energetic',
  selectedApp: 'Clone AI',
  selectedVoice: null,
  selectedAvatar: null,
  selectedAvatars: [],

  prompts: [],
  batchProgress: null,
  script: '',
  scriptGenerating: false,
  scriptHistory: [],
  scriptHistoryIndex: -1,
  audioUrl: null,
  videoUrl: null,

  setConcept: (concept) => set({ concept }),
  setPromptCount: (promptCount) => set({ promptCount }),
  setScriptDuration: (scriptDuration) => set({ scriptDuration }),
  setScriptTone: (scriptTone) => set({ scriptTone }),
  setSelectedApp: (selectedApp) => set({ selectedApp }),
  setSelectedVoice: (selectedVoice) => set({ selectedVoice }),
  setSelectedAvatar: (selectedAvatar) =>
    set({ selectedAvatar, selectedAvatars: selectedAvatar ? [selectedAvatar] : [] }),
  toggleGalleryAvatar: (avatar) =>
    set((state) => {
      const idx = state.selectedAvatars.findIndex((a) => a.filename === avatar.filename)
      if (idx >= 0) {
        const next = state.selectedAvatars.filter((_, i) => i !== idx)
        return { selectedAvatars: next, selectedAvatar: next[0] ?? null }
      }
      const next = [...state.selectedAvatars, avatar]
      return { selectedAvatars: next, selectedAvatar: next[0] }
    }),
  setScript: (script) =>
    set((state) => {
      const history = [...state.scriptHistory]
      const index = history.length - 1
      if (index >= 0 && history[index] === script) {
        return { script }
      }
      history.push(script)
      return { script, scriptHistory: history, scriptHistoryIndex: history.length - 1 }
    }),
  undoScript: () =>
    set((state) => {
      if (state.scriptHistoryIndex <= 0) return state
      const nextIndex = state.scriptHistoryIndex - 1
      return {
        scriptHistoryIndex: nextIndex,
        script: state.scriptHistory[nextIndex] ?? state.script,
      }
    }),
  redoScript: () =>
    set((state) => {
      if (state.scriptHistoryIndex >= state.scriptHistory.length - 1) return state
      const nextIndex = state.scriptHistoryIndex + 1
      return {
        scriptHistoryIndex: nextIndex,
        script: state.scriptHistory[nextIndex] ?? state.script,
      }
    }),

  addRefImages: (files) =>
    set((state) => {
      revokePreviews(state.refPreviews)
      const newFiles = [...state.refImages, ...files].slice(0, 5)
      return {
        refImages: newFiles,
        refPreviews: newFiles.map((f) => URL.createObjectURL(f)),
      }
    }),

  removeRefImage: (index) =>
    set((state) => {
      revokePreviews(state.refPreviews)
      const newFiles = state.refImages.filter((_, i) => i !== index)
      return {
        refImages: newFiles,
        refPreviews: newFiles.map((f) => URL.createObjectURL(f)),
      }
    }),

  clearRefImages: () =>
    set((state) => {
      revokePreviews(state.refPreviews)
      return { refImages: [], refPreviews: [] }
    }),

  generateScript: async () => {
    if (get().scriptGenerating) return null
    const { concept, scriptDuration, scriptTone, selectedApp } = get()
    if (!concept.trim()) {
      set({ error: { message: 'Enter a concept to generate a script', type: 'warning' } })
      return null
    }

    set({ scriptGenerating: true, error: null })
    try {
      const script = await fetchScript({ concept, duration: scriptDuration, tone: scriptTone, appName: selectedApp })
      get().setScript(script)
      return script
    } catch (err) {
      set({ error: parseError(err) })
      return null
    } finally {
      set({ scriptGenerating: false })
    }
  },

  refineScript: async (instruction, targetDuration) => {
    const { script } = get()
    if (!script.trim()) {
      set({ error: { message: 'No script to refine', type: 'warning' } })
      return
    }

    const wordCount = script.split(/\s+/).length
    const estimatedDuration = targetDuration || Math.ceil(wordCount / 2.5)

    set({ scriptGenerating: true, error: null })

    try {
      const res = await authFetch(apiUrl('/api/avatars/script/refine'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script,
          feedback: instruction,
          duration: estimatedDuration,
        }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to refine script'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ script: string }>(raw)
      get().setScript(data.script)
    } catch (err) {
      set({ error: parseError(err) })
    } finally {
      set({ scriptGenerating: false })
    }
  },

  run: async (resumeFrom) => {
    const {
      concept,
      selectedAvatar,
      selectedAvatars,
      selectedVoice,
      promptCount,
      scriptDuration,
      scriptTone,
      selectedApp,
      refImages,
    } = get()
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
    const shouldGenerateScript = startIdx <= 2 && (resumeFrom === 'script' || !localScript)
    let scriptPromise: Promise<string | null> | null = null
    let scriptError: Error | null = null
    let ttsPromise: Promise<string | null> | null = null
    let ttsError: Error | null = null

    try {
      if (shouldGenerateScript) {
        set({ scriptGenerating: true })
        scriptPromise = fetchScript({
          concept,
          duration: scriptDuration,
          tone: scriptTone,
          appName: selectedApp,
          signal,
        })
          .then((script) => {
            localScript = script
            get().setScript(script)
            return script
          })
          .catch((err) => {
            scriptError = err as Error
            return null
          })
          .finally(() => {
            set({ scriptGenerating: false })
          })
      }

      if (startIdx <= 3) {
        ttsPromise = (async () => {
          const scriptText = scriptPromise ? await scriptPromise : localScript || get().script
          if (!scriptText) throw scriptError ?? new Error('Script generation failed')
          const res = await authFetch(apiUrl('/api/avatars/tts'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: scriptText, voiceId }),
            signal,
          })
          if (!res.ok) {
            const raw = await res.json().catch(() => ({}))
            throw new Error(getApiError(raw, 'TTS failed'))
          }
          const raw = await res.json()
          const data = unwrapApiData<{ audioUrl: string }>(raw)
          return data.audioUrl
        })().catch((err) => {
          ttsError = err as Error
          return null
        })
      }

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
        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, 'Prompt generation failed'))
        }
        const raw = await res.json()
        const data = unwrapApiData<{ prompts: GeneratedPrompt[] }>(raw)
        localPrompts = data.prompts
        set({ prompts: localPrompts })
      }

      // Step 2: Generate Images
      if (startIdx <= 1) {
        currentStep = 'images'
        set({ step: currentStep, batchProgress: null })

        const avatarFiles = await Promise.all(
          selectedAvatars.map(async (a) => {
            const res = await authFetch(assetUrl(a.url), { signal })
            const blob = await res.blob()
            return new File([blob], a.url.split('/').pop() || 'avatar.png', { type: blob.type })
          }),
        )

        const formData = new FormData()
        // biome-ignore lint/suspicious/useIterableCallbackReturn: side-effect FormData append
        avatarFiles.forEach((f) => formData.append('referenceImages', f))
        // biome-ignore lint/suspicious/useIterableCallbackReturn: side-effect FormData append
        refImages.forEach((f) => formData.append('referenceImages', f))
        formData.append('concept', concept)
        formData.append('prompts', JSON.stringify(localPrompts))
        formData.append('aspectRatio', '9:16')
        formData.append('numImagesPerPrompt', '1')
        formData.append('resolution', '2K')
        formData.append('outputFormat', 'jpeg')

        const res = await authFetch(apiUrl('/api/generate/batch'), { method: 'POST', body: formData, signal })
        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, 'Batch generation failed'))
        }
        const raw = await res.json()
        const data = unwrapApiData<{ jobId: string; status: string; totalImages: number; outputDir: string }>(raw)
        set({
          batchProgress: {
            jobId: data.jobId,
            status: data.status,
            progress: 0,
            totalImages: data.totalImages,
            completedImages: 0,
            outputDir: data.outputDir,
            images: [],
          },
        })
        const result = await pollBatch(data.jobId, signal, (p) => set({ batchProgress: p }))
        if (result.status === 'failed') throw new Error('Image generation failed')
      }

      // Step 3: Generate Script
      if (startIdx <= 2) {
        currentStep = 'script'
        set({ step: currentStep })
        if (scriptPromise) {
          localScript = (await scriptPromise) || localScript
        }
        if (!localScript) localScript = get().script
        if (!localScript) throw scriptError ?? new Error('Script generation failed')
      }

      // Step 4: TTS
      if (startIdx <= 3) {
        currentStep = 'tts'
        set({ step: currentStep })
        if (ttsPromise) {
          localAudioUrl = (await ttsPromise) || null
        }
        if (!localAudioUrl) throw ttsError ?? new Error('TTS failed')
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
              const errRaw = await res.json().catch(() => ({}))
              throw new Error(getApiError(errRaw, 'Lipsync video failed'))
            }
            const raw = await res.json()
            const data = unwrapApiData<{ localPath?: string }>(raw)
            if (data.localPath) set({ videoUrl: data.localPath })
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
      scriptGenerating: false,
      scriptHistory: [],
      scriptHistoryIndex: -1,
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
      scriptGenerating: false,
      scriptHistory: [],
      scriptHistoryIndex: -1,
      audioUrl: null,
      videoUrl: null,
      refImages: [],
      refPreviews: [],
      selectedAvatar: null,
      selectedAvatars: [],
      selectedApp: 'Clone AI',
    })
  },
}))
