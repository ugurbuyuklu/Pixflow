import { create } from 'zustand'
import { apiUrl, assetUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type { Avatar, BatchProgress, ErrorInfo, GeneratedPrompt } from '../types'
import { parseError } from '../types'

const MAX_REFERENCE_IMAGES = 5
const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4', '4:5', '5:4', '3:2', '2:3', '21:9'] as const
const RESOLUTIONS = ['1K', '2K', '4K'] as const
const OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const

function revokePreviews(previews: string[]) {
  for (const url of previews) URL.revokeObjectURL(url)
}

function rebuildPreviews(files: File[]): string[] {
  return files.map((f) => URL.createObjectURL(f))
}

const BATCH_COLORS = [
  'border-brand-400',
  'border-emerald-400',
  'border-amber-400',
  'border-rose-400',
  'border-cyan-400',
  'border-violet-400',
  'border-orange-400',
  'border-teal-400',
] as const

interface CompletedBatch {
  batch: BatchProgress
  color: string
}

interface GenerationState {
  selectedPrompts: Set<number>
  referenceImages: File[]
  referencePreviews: string[]
  batchLoading: boolean
  batchProgress: BatchProgress | null
  batchError: ErrorInfo | null
  uploadError: string | null
  previewImage: string | null
  selectedResultImages: Set<number>
  completedBatches: CompletedBatch[]

  promptSource: 'generated' | 'custom' | 'library'
  currentCustomPromptInput: string
  currentCustomPromptError: string | null
  savedCustomPrompts: Array<{ id: string; prompt: GeneratedPrompt; name: string }>

  imageSource: 'upload' | 'gallery'
  avatars: Avatar[]
  avatarsLoading: boolean

  aspectRatio: string
  numImagesPerPrompt: number
  outputFormat: string
  resolution: string

  togglePromptSelection: (index: number) => void
  selectAllPrompts: (count: number) => void
  deselectAllPrompts: () => void
  setPromptSource: (source: 'generated' | 'custom' | 'library') => void
  updateCurrentCustomPromptInput: (json: string) => void
  setCurrentCustomPromptError: (error: string | null) => void
  saveCurrentCustomPrompt: (prompt: GeneratedPrompt, name: string) => void
  removeSavedCustomPrompt: (id: string) => void
  setImageSource: (source: 'upload' | 'gallery') => void
  setAspectRatio: (ratio: string) => void
  setNumImagesPerPrompt: (count: number) => void
  setOutputFormat: (format: string) => void
  setResolution: (resolution: string) => void
  setPreviewImage: (url: string | null) => void
  toggleResultImage: (index: number) => void
  selectAllResultImages: () => void
  deselectAllResultImages: () => void

  addReferenceFiles: (files: File[]) => void
  removeReferenceImage: (index: number) => void
  clearReferenceImages: () => void
  setUploadError: (error: string | null) => void
  setBatchError: (error: ErrorInfo | null) => void

  loadAvatars: () => Promise<void>
  selectAvatar: (avatar: Avatar) => Promise<void>
  startBatch: (prompts: GeneratedPrompt[], concept: string) => Promise<void>
  cancelBatch: () => void
  clearCompletedBatches: () => void

  reset: () => void
}

export { MAX_REFERENCE_IMAGES, ASPECT_RATIOS, RESOLUTIONS, OUTPUT_FORMATS, BATCH_COLORS }
export type { CompletedBatch }

let batchAbort: AbortController | null = null

export const useGenerationStore = create<GenerationState>()((set, get) => ({
  selectedPrompts: new Set<number>(),
  referenceImages: [],
  referencePreviews: [],
  batchLoading: false,
  batchProgress: null,
  batchError: null,
  uploadError: null,
  previewImage: null,
  selectedResultImages: new Set<number>(),
  completedBatches: [],

  promptSource: 'generated',
  currentCustomPromptInput: '',
  currentCustomPromptError: null,
  savedCustomPrompts: [],

  imageSource: 'upload',
  avatars: [],
  avatarsLoading: false,

  aspectRatio: '9:16',
  numImagesPerPrompt: 1,
  outputFormat: 'jpeg',
  resolution: '2K',

  togglePromptSelection: (index) =>
    set((state) => {
      const next = new Set(state.selectedPrompts)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return { selectedPrompts: next }
    }),

  selectAllPrompts: (count) => set({ selectedPrompts: new Set(Array.from({ length: count }, (_, i) => i)) }),
  deselectAllPrompts: () => set({ selectedPrompts: new Set() }),
  setPromptSource: (promptSource) => set({ promptSource }),

  updateCurrentCustomPromptInput: (currentCustomPromptInput) =>
    set({ currentCustomPromptInput, currentCustomPromptError: null }),

  setCurrentCustomPromptError: (currentCustomPromptError) => set({ currentCustomPromptError }),

  saveCurrentCustomPrompt: (prompt, name) => {
    const id = `saved-${Date.now()}`
    set((state) => ({
      savedCustomPrompts: [...state.savedCustomPrompts, { id, prompt, name }],
      currentCustomPromptInput: '',
      currentCustomPromptError: null,
    }))
  },

  removeSavedCustomPrompt: (id) => {
    set((state) => ({
      savedCustomPrompts: state.savedCustomPrompts.filter((sp) => sp.id !== id),
    }))
  },

  setImageSource: (imageSource) => set({ imageSource }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setNumImagesPerPrompt: (numImagesPerPrompt) => set({ numImagesPerPrompt }),
  setOutputFormat: (outputFormat) => set({ outputFormat }),
  setResolution: (resolution) => set({ resolution }),
  setPreviewImage: (previewImage) => set({ previewImage }),
  toggleResultImage: (index) =>
    set((state) => {
      const next = new Set(state.selectedResultImages)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return { selectedResultImages: next }
    }),
  selectAllResultImages: () =>
    set((state) => {
      const completed = state.batchProgress?.images.filter((img) => img.status === 'completed') ?? []
      return { selectedResultImages: new Set(completed.map((img) => img.index)) }
    }),
  deselectAllResultImages: () => set({ selectedResultImages: new Set<number>() }),

  addReferenceFiles: (files) =>
    set((state) => {
      revokePreviews(state.referencePreviews)
      const newFiles = [...state.referenceImages, ...files].slice(0, MAX_REFERENCE_IMAGES)
      return {
        referenceImages: newFiles,
        referencePreviews: rebuildPreviews(newFiles),
        uploadError: null,
      }
    }),

  removeReferenceImage: (index) =>
    set((state) => {
      revokePreviews(state.referencePreviews)
      const newFiles = state.referenceImages.filter((_, i) => i !== index)
      return {
        referenceImages: newFiles,
        referencePreviews: rebuildPreviews(newFiles),
      }
    }),

  clearReferenceImages: () =>
    set((state) => {
      revokePreviews(state.referencePreviews)
      return { referenceImages: [], referencePreviews: [] }
    }),

  setUploadError: (uploadError) => set({ uploadError }),
  setBatchError: (batchError) => set({ batchError }),

  loadAvatars: async () => {
    set({ avatarsLoading: true })
    try {
      const res = await authFetch(apiUrl('/api/avatars'))
      if (!res.ok) throw new Error(`Failed to load avatars: ${res.status}`)
      const raw = await res.json()
      const data = unwrapApiData<{ avatars: Avatar[] }>(raw)
      set({
        avatars: data.avatars,
        imageSource: data.avatars.length > 0 ? 'gallery' : 'upload',
      })
    } catch (err) {
      console.error('Failed to load avatars:', err)
    } finally {
      set({ avatarsLoading: false })
    }
  },

  selectAvatar: async (avatar) => {
    const { referenceImages, referencePreviews } = get()

    const existingIndex = referenceImages.findIndex((f) => f.name === avatar.filename)
    if (existingIndex >= 0) {
      revokePreviews(referencePreviews)
      const newFiles = referenceImages.filter((_, i) => i !== existingIndex)
      set({
        referenceImages: newFiles,
        referencePreviews: rebuildPreviews(newFiles),
      })
      return
    }

    if (referenceImages.length >= MAX_REFERENCE_IMAGES) {
      set({ batchError: { message: `Maximum ${MAX_REFERENCE_IMAGES} images allowed`, type: 'warning' } })
      return
    }

    try {
      const res = await authFetch(assetUrl(avatar.url))
      if (!res.ok) throw new Error('Failed to fetch avatar')
      const blob = await res.blob()
      const file = new File([blob], avatar.filename, { type: blob.type })
      revokePreviews(get().referencePreviews)
      const newFiles = [...get().referenceImages, file]
      set({
        referenceImages: newFiles,
        referencePreviews: rebuildPreviews(newFiles),
      })
    } catch {
      set({ batchError: { message: 'Failed to load avatar image', type: 'error' } })
    }
  },

  clearCompletedBatches: () => set({ completedBatches: [] }),

  startBatch: async (prompts, concept) => {
    const {
      referenceImages,
      aspectRatio,
      numImagesPerPrompt,
      resolution,
      outputFormat,
      batchProgress,
      completedBatches,
    } = get()

    if (referenceImages.length === 0) {
      set({ batchError: { message: 'Please add at least one reference image', type: 'warning' } })
      return
    }

    batchAbort?.abort()
    const controller = new AbortController()
    batchAbort = controller

    const archived = batchProgress?.images.some((img) => img.status === 'completed')
      ? [
          ...completedBatches,
          { batch: batchProgress, color: BATCH_COLORS[completedBatches.length % BATCH_COLORS.length] },
        ]
      : completedBatches

    set({
      batchLoading: true,
      batchError: null,
      batchProgress: null,
      completedBatches: archived,
      selectedResultImages: new Set(),
    })

    try {
      const formData = new FormData()
      // biome-ignore lint/suspicious/useIterableCallbackReturn: side-effect FormData append
      referenceImages.forEach((f) => formData.append('referenceImages', f))
      formData.append('concept', concept)
      formData.append('prompts', JSON.stringify(prompts))
      formData.append('aspectRatio', aspectRatio)
      formData.append('numImagesPerPrompt', String(numImagesPerPrompt))
      formData.append('resolution', resolution)
      formData.append('outputFormat', outputFormat)

      const res = await authFetch(apiUrl('/api/generate/batch'), {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Batch generation failed'))
      }

      const raw = await res.json()
      const data = unwrapApiData<{
        jobId: string
        status: string
        totalImages: number
        outputDir: string
      }>(raw)
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

      let failedPolls = 0
      while (!controller.signal.aborted) {
        await new Promise((r) => setTimeout(r, 2000))
        if (controller.signal.aborted) break
        try {
          const pollRes = await authFetch(apiUrl(`/api/generate/progress/${data.jobId}`), {
            signal: controller.signal,
          })
          if (!pollRes.ok) throw new Error(`${pollRes.status}`)
          failedPolls = 0
          const progressRaw = await pollRes.json()
          const progress = unwrapApiData<BatchProgress>(progressRaw)
          set({ batchProgress: progress })
          if (progress.status === 'completed' || progress.status === 'failed') break
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          failedPolls++
          if (failedPolls >= 3) throw new Error('Lost connection to server during image generation')
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      set({ batchError: parseError(err) })
    } finally {
      set({ batchLoading: false })
      if (batchAbort === controller) batchAbort = null
    }
  },

  cancelBatch: () => {
    batchAbort?.abort()
    batchAbort = null
    set({ batchLoading: false })
  },

  reset: () => {
    batchAbort?.abort()
    batchAbort = null
    const { referencePreviews } = get()
    revokePreviews(referencePreviews)
    set({
      selectedPrompts: new Set(),
      referenceImages: [],
      referencePreviews: [],
      batchProgress: null,
      batchError: null,
      uploadError: null,
      previewImage: null,
      currentCustomPromptInput: '',
      currentCustomPromptError: null,
      completedBatches: [],
    })
  },
}))
