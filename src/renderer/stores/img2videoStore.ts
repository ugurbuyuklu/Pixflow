import { create } from 'zustand'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type { ErrorInfo } from '../types'

const DURATIONS = ['5', '10'] as const
const ASPECT_RATIOS = ['9:16', '16:9', '1:1'] as const
const MAX_CONCURRENCY = 10

export const VIDEO_PRESETS = [
  {
    key: 'cameraMovement',
    label: 'Camera Movement',
    options: [
      'the camera rotates around the subject',
      'the camera is stationary',
      'handheld device filming',
      'the camera zooms out',
      'the camera zooms in',
      'the camera follows the subject moving',
      'camera pans right',
      'camera tilts up',
      'camera tilts down',
      'camera orbits around',
    ],
  },
  {
    key: 'cameraSpeed',
    label: 'Camera Speed',
    options: ['The speed of the camera motion is slow'],
  },
  {
    key: 'shotType',
    label: 'Shot Type',
    options: [
      'maintaining a Close Shot',
      'medium shot',
      'positioned at a Long Shot',
      'positioned at a Low Angle',
      'positioned at a higher angle',
      'Shallow Depth of Field',
      "capture the subject's front view",
      'profile shot',
      'Close-up',
    ],
  },
] as const

function composePrompt(base: string, presets: Record<string, string>): string {
  const fragments = Object.values(presets).filter(Boolean)
  if (fragments.length === 0) return base
  return `${base}, ${fragments.join(', ')}`
}

export interface ImageEntry {
  url: string
  prompt: string
}

interface VideoJob {
  imageUrl: string
  prompt: string
  status: 'pending' | 'generating' | 'completed' | 'failed'
  videoUrl?: string
  localPath?: string
  error?: string
}

interface Img2VideoState {
  entries: ImageEntry[]
  duration: string
  aspectRatio: string
  selectedPresets: Record<string, string>
  jobs: VideoJob[]
  generating: boolean
  uploading: boolean
  error: ErrorInfo | null

  setEntries: (entries: ImageEntry[]) => void
  addEntries: (urls: string[]) => void
  removeEntry: (index: number) => void
  clearEntries: () => void
  setEntryPrompt: (index: number, prompt: string) => void
  applyPromptToAll: (prompt: string) => void
  setDuration: (duration: string) => void
  setAspectRatio: (ratio: string) => void
  setPreset: (key: string, value: string) => void
  clearPresets: () => void
  setError: (error: ErrorInfo | null) => void
  uploadFiles: (files: File[]) => Promise<void>

  generateAll: () => Promise<void>
  cancelGenerate: () => void
  reset: () => void
}

export { DURATIONS, ASPECT_RATIOS }

let abortController: AbortController | null = null

export const useImg2VideoStore = create<Img2VideoState>()((set, get) => ({
  entries: [],
  duration: '5',
  aspectRatio: '9:16',
  selectedPresets: {},
  jobs: [],
  generating: false,
  uploading: false,
  error: null,

  setEntries: (entries) => set({ entries, jobs: [], error: null }),
  addEntries: (urls) =>
    set((state) => ({
      entries: [...state.entries, ...urls.map((url) => ({ url, prompt: '' }))],
      jobs: [],
      error: null,
    })),
  removeEntry: (index) =>
    set((state) => ({
      entries: state.entries.filter((_, i) => i !== index),
      jobs: [],
    })),
  clearEntries: () => set({ entries: [], jobs: [], error: null }),
  setEntryPrompt: (index, prompt) =>
    set((state) => {
      const updated = [...state.entries]
      if (updated[index]) updated[index] = { ...updated[index], prompt }
      return { entries: updated }
    }),
  applyPromptToAll: (prompt) =>
    set((state) => ({
      entries: state.entries.map((e) => ({ ...e, prompt })),
    })),
  setDuration: (duration) => set({ duration }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setPreset: (key, value) =>
    set((state) => {
      const next = { ...state.selectedPresets }
      if (next[key] === value) delete next[key]
      else next[key] = value
      return { selectedPresets: next }
    }),
  clearPresets: () => set({ selectedPresets: {} }),
  setError: (error) => set({ error }),

  uploadFiles: async (files) => {
    set({ uploading: true, error: null })
    const uploaded: string[] = []
    for (const file of files) {
      const form = new FormData()
      form.append('image', file)
      try {
        const res = await authFetch(apiUrl('/api/generate/upload-reference'), {
          method: 'POST',
          body: form,
        })
        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, `Upload failed (${res.status})`))
        }
        const raw = await res.json()
        const data = unwrapApiData<{ path: string }>(raw)
        uploaded.push(data.path)
      } catch (err) {
        set({
          uploading: false,
          error: { message: err instanceof Error ? err.message : 'Upload failed', type: 'error' },
        })
        return
      }
    }
    set((state) => ({
      entries: [...state.entries, ...uploaded.map((url) => ({ url, prompt: '' }))],
      jobs: [],
      uploading: false,
    }))
  },

  generateAll: async () => {
    const { entries, duration, aspectRatio, selectedPresets } = get()

    if (entries.length === 0) {
      set({ error: { message: 'No images selected', type: 'warning' } })
      return
    }
    const missing = entries.some((e) => !e.prompt.trim())
    if (missing) {
      set({ error: { message: 'Every image needs a video prompt', type: 'warning' } })
      return
    }

    abortController?.abort()
    const controller = new AbortController()
    abortController = controller

    const initialJobs: VideoJob[] = entries.map((e) => ({
      imageUrl: e.url,
      prompt: composePrompt(e.prompt, selectedPresets),
      status: 'pending',
    }))
    set({ generating: true, error: null, jobs: initialJobs })

    const generateOne = async (i: number) => {
      if (controller.signal.aborted) return

      set((state) => {
        const updated = [...state.jobs]
        updated[i] = { ...updated[i], status: 'generating' }
        return { jobs: updated }
      })

      try {
        const res = await authFetch(apiUrl('/api/avatars/i2v'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: entries[i].url,
            prompt: composePrompt(entries[i].prompt, selectedPresets),
            duration,
            aspectRatio,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, `Video generation failed (${res.status})`))
        }

        const raw = await res.json()
        const data = unwrapApiData<{ videoUrl: string; localPath: string; requestId: string }>(raw)

        set((state) => {
          const updated = [...state.jobs]
          updated[i] = {
            ...updated[i],
            status: 'completed',
            videoUrl: data.videoUrl,
            localPath: data.localPath,
          }
          return { jobs: updated }
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        set((state) => {
          const updated = [...state.jobs]
          updated[i] = {
            ...updated[i],
            status: 'failed',
            error: err instanceof Error ? err.message : 'Unknown error',
          }
          return { jobs: updated }
        })
      }
    }

    const queue = [...Array(entries.length).keys()]
    const concurrency = Math.min(MAX_CONCURRENCY, entries.length)
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        if (controller.signal.aborted) return
        const idx = queue.shift()
        if (idx !== undefined) await generateOne(idx)
      }
    })

    await Promise.all(workers)

    set({ generating: false })
    if (abortController === controller) abortController = null
  },

  cancelGenerate: () => {
    abortController?.abort()
    abortController = null
    set({ generating: false })
  },

  reset: () => {
    abortController?.abort()
    abortController = null
    set({
      entries: [],
      duration: '5',
      aspectRatio: '9:16',
      selectedPresets: {},
      jobs: [],
      generating: false,
      uploading: false,
      error: null,
    })
  },
}))
