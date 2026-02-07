import { create } from 'zustand'
import { apiUrl, assetUrl, authFetch } from '../lib/api'
import type { GeneratedPrompt, BatchProgress, ErrorInfo, Avatar } from '../types'
import { parseError } from '../types'

const MAX_REFERENCE_IMAGES = 4
const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4', '4:5', '5:4', '3:2', '2:3', '21:9'] as const
const RESOLUTIONS = ['1K', '2K', '4K'] as const
const OUTPUT_FORMATS = ['png', 'jpeg', 'webp'] as const

function revokePreviews(previews: string[]) {
  for (const url of previews) URL.revokeObjectURL(url)
}

function rebuildPreviews(files: File[]): string[] {
  return files.map((f) => URL.createObjectURL(f))
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

  promptSource: 'generated' | 'custom'
  customPromptJson: string
  customPromptCount: number
  customPromptError: string | null

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
  setPromptSource: (source: 'generated' | 'custom') => void
  setCustomPromptJson: (json: string) => void
  setCustomPromptCount: (count: number) => void
  setCustomPromptError: (error: string | null) => void
  setImageSource: (source: 'upload' | 'gallery') => void
  setAspectRatio: (ratio: string) => void
  setNumImagesPerPrompt: (count: number) => void
  setOutputFormat: (format: string) => void
  setResolution: (resolution: string) => void
  setPreviewImage: (url: string | null) => void

  addReferenceFiles: (files: File[]) => void
  removeReferenceImage: (index: number) => void
  clearReferenceImages: () => void
  setUploadError: (error: string | null) => void

  loadAvatars: () => Promise<void>
  selectAvatar: (avatar: Avatar) => Promise<void>
  startBatch: (prompts: GeneratedPrompt[], concept: string) => Promise<void>
  cancelBatch: () => void

  reset: () => void
}

export { MAX_REFERENCE_IMAGES, ASPECT_RATIOS, RESOLUTIONS, OUTPUT_FORMATS }

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

  promptSource: 'generated',
  customPromptJson: '',
  customPromptCount: 1,
  customPromptError: null,

  imageSource: 'upload',
  avatars: [],
  avatarsLoading: false,

  aspectRatio: '9:16',
  numImagesPerPrompt: 1,
  outputFormat: 'jpeg',
  resolution: '2K',

  togglePromptSelection: (index) => set((state) => {
    const next = new Set(state.selectedPrompts)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    return { selectedPrompts: next }
  }),

  selectAllPrompts: (count) => set({ selectedPrompts: new Set(Array.from({ length: count }, (_, i) => i)) }),
  deselectAllPrompts: () => set({ selectedPrompts: new Set() }),
  setPromptSource: (promptSource) => set({ promptSource }),
  setCustomPromptJson: (customPromptJson) => set({ customPromptJson }),
  setCustomPromptCount: (customPromptCount) => set({ customPromptCount }),
  setCustomPromptError: (customPromptError) => set({ customPromptError }),
  setImageSource: (imageSource) => set({ imageSource }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setNumImagesPerPrompt: (numImagesPerPrompt) => set({ numImagesPerPrompt }),
  setOutputFormat: (outputFormat) => set({ outputFormat }),
  setResolution: (resolution) => set({ resolution }),
  setPreviewImage: (previewImage) => set({ previewImage }),

  addReferenceFiles: (files) => set((state) => {
    revokePreviews(state.referencePreviews)
    const newFiles = [...state.referenceImages, ...files].slice(0, MAX_REFERENCE_IMAGES)
    return {
      referenceImages: newFiles,
      referencePreviews: rebuildPreviews(newFiles),
      uploadError: null,
    }
  }),

  removeReferenceImage: (index) => set((state) => {
    revokePreviews(state.referencePreviews)
    const newFiles = state.referenceImages.filter((_, i) => i !== index)
    return {
      referenceImages: newFiles,
      referencePreviews: rebuildPreviews(newFiles),
    }
  }),

  clearReferenceImages: () => set((state) => {
    revokePreviews(state.referencePreviews)
    return { referenceImages: [], referencePreviews: [] }
  }),

  setUploadError: (uploadError) => set({ uploadError }),

  loadAvatars: async () => {
    set({ avatarsLoading: true })
    try {
      const res = await authFetch(apiUrl('/api/avatars'))
      if (!res.ok) throw new Error(`Failed to load avatars: ${res.status}`)
      const data = await res.json()
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

  startBatch: async (prompts, concept) => {
    const { referenceImages, aspectRatio, numImagesPerPrompt, resolution, outputFormat } = get()

    if (referenceImages.length === 0) {
      set({ batchError: { message: 'Please add at least one reference image', type: 'warning' } })
      return
    }

    batchAbort?.abort()
    const controller = new AbortController()
    batchAbort = controller

    set({ batchLoading: true, batchError: null, batchProgress: null })

    try {
      const formData = new FormData()
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
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Batch generation failed')
      }

      const data = await res.json()
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
          const progress: BatchProgress = await pollRes.json()
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
      customPromptJson: '',
      customPromptError: null,
    })
  },
}))
