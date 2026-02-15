import { create } from 'zustand'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type { ErrorInfo } from '../types'

// Re-export constants from old store for compatibility
export const DURATIONS = ['5', '10'] as const
export const ASPECT_RATIOS = ['9:16', '16:9', '1:1'] as const

// Img2Img specific constants
export const IMG2IMG_ASPECT_RATIOS = ['9:16', '1:1', '4:5'] as const
export const IMG2IMG_RESOLUTIONS = ['1K', '2K', '4K'] as const
export const IMG2IMG_FORMATS = ['JPG', 'PNG'] as const

const MAX_CONCURRENCY = 10

export const VIDEO_PRESETS: Record<string, { label: string; presets: string[]; multiSelect: boolean }> = {
  cameraMovement: {
    label: 'Camera Movement',
    multiSelect: true,
    presets: [
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
  cameraSpeed: {
    label: 'Camera Speed',
    multiSelect: false,
    presets: ['slow', 'normal', 'fast'],
  },
  shotType: {
    label: 'Shot Type',
    multiSelect: true,
    presets: [
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
}

// UUID generation helper
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Compose multi-select presets into prompt
export function composePrompt(base: string, presets: Record<string, string[]>): string {
  const fragments: string[] = []
  for (const values of Object.values(presets)) {
    fragments.push(...values)
  }
  if (fragments.length === 0) return base
  return `${base}, ${fragments.join(', ')}`
}

export type WorkflowType = 'img2img' | 'img2video' | 'startEnd'

export interface QueueItem {
  id: string
  imageUrl: string
  prompt: string
  workflowType: WorkflowType // NEW: distinguish between workflows

  // Img2Img specific settings
  img2imgSettings?: {
    aspectRatio: string
    numberOfOutputs: number
    resolution: string
    format: string
  }

  // Start/End specific: paired frame URLs
  startEndImages?: {
    startImageUrl: string
    endImageUrl: string
  }

  // Img2Video specific settings
  presets: Record<string, string[]> // Multi-select: key -> array of selected options
  settings: {
    duration: string
    aspectRatio: string
  }

  status: 'draft' | 'queued' | 'generating' | 'completed' | 'failed' | 'paused'
  result?: {
    videoUrl?: string // for img2video
    imageUrl?: string // for img2img
    localPath: string
  }
  error?: string
  createdAt: number
  completedAt?: number
}

interface Img2VideoQueueState {
  // Core state
  queueItems: Record<string, QueueItem> // Normalized by ID
  queueOrder: string[] // Order array
  selectedId: string | null // Currently viewing in workspace

  // Global defaults
  globalSettings: {
    duration: string
    aspectRatio: string
    presets: Record<string, string[]>
  }

  // Generation state
  generating: boolean
  uploading: boolean
  currentJobId: string | null
  error: ErrorInfo | null

  // Queue operations
  addItem: (imageUrl: string, workflowType?: WorkflowType) => string // Returns new item ID
  addItems: (imageUrls: string[], workflowType?: WorkflowType) => string[] // Returns array of new IDs
  removeItem: (id: string) => void
  clearQueue: () => void
  selectItem: (id: string | null) => void

  // Item modifications
  setItemPrompt: (id: string, prompt: string) => void
  setItemPresets: (id: string, presets: Record<string, string[]>) => void
  setItemSettings: (id: string, settings: Partial<QueueItem['settings']>) => void
  updateItem: (id: string, updates: Partial<Omit<QueueItem, 'id' | 'createdAt'>>) => void

  // Queue management
  reorderQueue: (newOrder: string[]) => void
  skipItem: (id: string) => void // Move to end of queue

  // Batch operations
  queueItem: (id: string) => void // Draft -> Queued
  queueAll: () => void // All drafts -> Queued
  retryFailed: () => void // All failed -> Queued
  clearFailed: () => void
  clearCompleted: () => void

  // Global settings
  setGlobalDuration: (duration: string) => void
  setGlobalAspectRatio: (ratio: string) => void
  setGlobalPresets: (presets: Record<string, string[]>) => void
  applyGlobalSettingsToItem: (id: string) => void
  applyGlobalSettingsToAll: () => void

  // Upload
  uploadFiles: (files: File[], workflowType?: WorkflowType) => Promise<string[]> // Returns array of new item IDs

  // Generation
  generateQueue: () => Promise<void>
  pauseQueue: () => void
  resumeQueue: () => void
  cancelCurrent: () => void

  // Img2Img specific methods
  setImg2ImgSettings: (
    id: string,
    settings: Partial<{ aspectRatio: string; numberOfOutputs: number; resolution: string; format: string }>,
  ) => void
  transformImage: (id: string) => Promise<void>
  transformBatch: (
    ids: string[],
    prompt: string,
    settings: { aspectRatio: string; numberOfOutputs: number; resolution: string; format: string },
  ) => Promise<void>

  // Start/End specific
  setStartEndImages: (id: string, images: { startImageUrl: string; endImageUrl: string }) => void
  uploadStartEndFiles: (startFile: File, endFile: File) => Promise<string | null>

  // Utility
  setError: (error: ErrorInfo | null) => void
  reset: () => void
}

let abortController: AbortController | null = null

export const useImg2VideoQueueStore = create<Img2VideoQueueState>()((set, get) => ({
  // Initial state
  queueItems: {},
  queueOrder: [],
  selectedId: null,
  globalSettings: {
    duration: '5',
    aspectRatio: '9:16',
    presets: {},
  },
  generating: false,
  uploading: false,
  currentJobId: null,
  error: null,

  // Add single item
  addItem: (imageUrl, workflowType = 'img2video') => {
    const id = generateId()
    const item: QueueItem = {
      id,
      imageUrl,
      prompt: '',
      workflowType,
      presets: {},
      settings: {
        duration: get().globalSettings.duration,
        aspectRatio: get().globalSettings.aspectRatio,
      },
      img2imgSettings:
        workflowType === 'img2img'
          ? {
              aspectRatio: '1:1',
              numberOfOutputs: 1,
              resolution: '1K',
              format: 'PNG',
            }
          : undefined,
      status: 'draft',
      createdAt: Date.now(),
    }

    set((state) => ({
      queueItems: { ...state.queueItems, [id]: item },
      queueOrder: [...state.queueOrder, id],
      selectedId: state.selectedId || id, // Auto-select first item
    }))

    return id
  },

  // Add multiple items
  addItems: (imageUrls, workflowType = 'img2video') => {
    const ids = imageUrls.map((url) => {
      const id = generateId()
      return {
        id,
        item: {
          id,
          imageUrl: url,
          prompt: '',
          workflowType,
          presets: {},
          settings: {
            duration: get().globalSettings.duration,
            aspectRatio: get().globalSettings.aspectRatio,
          },
          img2imgSettings:
            workflowType === 'img2img'
              ? {
                  aspectRatio: '1:1',
                  numberOfOutputs: 1,
                  resolution: '1K',
                  format: 'PNG',
                }
              : undefined,
          status: 'draft' as const,
          createdAt: Date.now(),
        },
      }
    })

    const newItems = Object.fromEntries(ids.map(({ id, item }) => [id, item]))
    const newIds = ids.map(({ id }) => id)

    set((state) => ({
      queueItems: { ...state.queueItems, ...newItems },
      queueOrder: [...state.queueOrder, ...newIds],
      selectedId: state.selectedId || newIds[0],
    }))

    return newIds
  },

  // Remove item
  removeItem: (id) => {
    set((state) => {
      const { [id]: removed, ...remainingItems } = state.queueItems
      const newOrder = state.queueOrder.filter((itemId) => itemId !== id)
      const newSelectedId = state.selectedId === id ? newOrder[0] || null : state.selectedId

      return {
        queueItems: remainingItems,
        queueOrder: newOrder,
        selectedId: newSelectedId,
      }
    })
  },

  // Clear entire queue
  clearQueue: () => set({ queueItems: {}, queueOrder: [], selectedId: null }),

  // Select item for workspace view
  selectItem: (id) => set({ selectedId: id }),

  // Set item prompt
  setItemPrompt: (id, prompt) => {
    set((state) => ({
      queueItems: {
        ...state.queueItems,
        [id]: { ...state.queueItems[id], prompt },
      },
    }))
  },

  // Set item presets
  setItemPresets: (id, presets) => {
    set((state) => ({
      queueItems: {
        ...state.queueItems,
        [id]: { ...state.queueItems[id], presets },
      },
    }))
  },

  // Set item settings
  setItemSettings: (id, settings) => {
    set((state) => ({
      queueItems: {
        ...state.queueItems,
        [id]: {
          ...state.queueItems[id],
          settings: { ...state.queueItems[id].settings, ...settings },
        },
      },
    }))
  },

  // Update item (general purpose)
  updateItem: (id, updates) => {
    set((state) => ({
      queueItems: {
        ...state.queueItems,
        [id]: { ...state.queueItems[id], ...updates },
      },
    }))
  },

  // Reorder queue
  reorderQueue: (newOrder) => set({ queueOrder: newOrder }),

  // Skip item (move to end)
  skipItem: (id) => {
    set((state) => {
      const newOrder = state.queueOrder.filter((itemId) => itemId !== id)
      newOrder.push(id)
      return { queueOrder: newOrder }
    })
  },

  // Queue single item (draft -> queued)
  queueItem: (id) => {
    set((state) => ({
      queueItems: {
        ...state.queueItems,
        [id]: { ...state.queueItems[id], status: 'queued' },
      },
    }))
  },

  // Queue all draft items
  queueAll: () => {
    set((state) => {
      const updated = { ...state.queueItems }
      for (const id of state.queueOrder) {
        if (updated[id].status === 'draft') {
          updated[id] = { ...updated[id], status: 'queued' }
        }
      }
      return { queueItems: updated }
    })
  },

  // Retry all failed items
  retryFailed: () => {
    set((state) => {
      const updated = { ...state.queueItems }
      for (const id of state.queueOrder) {
        if (updated[id].status === 'failed') {
          updated[id] = { ...updated[id], status: 'queued', error: undefined }
        }
      }
      return { queueItems: updated }
    })
  },

  // Clear failed items
  clearFailed: () => {
    set((state) => {
      const failedIds = state.queueOrder.filter((id) => state.queueItems[id].status === 'failed')
      const updated = { ...state.queueItems }
      for (const id of failedIds) {
        delete updated[id]
      }
      return {
        queueItems: updated,
        queueOrder: state.queueOrder.filter((id) => !failedIds.includes(id)),
      }
    })
  },

  // Clear completed items
  clearCompleted: () => {
    set((state) => {
      const completedIds = state.queueOrder.filter((id) => state.queueItems[id].status === 'completed')
      const updated = { ...state.queueItems }
      for (const id of completedIds) {
        delete updated[id]
      }
      return {
        queueItems: updated,
        queueOrder: state.queueOrder.filter((id) => !completedIds.includes(id)),
      }
    })
  },

  // Global settings
  setGlobalDuration: (duration) => {
    set((state) => ({
      globalSettings: { ...state.globalSettings, duration },
    }))
  },

  setGlobalAspectRatio: (ratio) => {
    set((state) => ({
      globalSettings: { ...state.globalSettings, aspectRatio: ratio },
    }))
  },

  setGlobalPresets: (presets) => {
    set((state) => ({
      globalSettings: { ...state.globalSettings, presets },
    }))
  },

  // Apply global settings to specific item
  applyGlobalSettingsToItem: (id) => {
    const { globalSettings } = get()
    set((state) => ({
      queueItems: {
        ...state.queueItems,
        [id]: {
          ...state.queueItems[id],
          settings: {
            duration: globalSettings.duration,
            aspectRatio: globalSettings.aspectRatio,
          },
          presets: globalSettings.presets,
        },
      },
    }))
  },

  // Apply global settings to all items
  applyGlobalSettingsToAll: () => {
    const { globalSettings, queueOrder } = get()
    set((state) => {
      const updated = { ...state.queueItems }
      for (const id of queueOrder) {
        updated[id] = {
          ...updated[id],
          settings: {
            duration: globalSettings.duration,
            aspectRatio: globalSettings.aspectRatio,
          },
          presets: globalSettings.presets,
        }
      }
      return { queueItems: updated }
    })
  },

  // Upload files
  uploadFiles: async (files, workflowType = 'img2video') => {
    set({ uploading: true, error: null })
    const uploadedIds: string[] = []

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

        const id = get().addItem(data.path, workflowType)
        uploadedIds.push(id)
      } catch (err) {
        set({
          uploading: false,
          error: { message: err instanceof Error ? err.message : 'Upload failed', type: 'error' },
        })
        return uploadedIds // Return what we uploaded so far
      }
    }

    set({ uploading: false })
    return uploadedIds
  },

  // Generate queue
  generateQueue: async () => {
    const { queueItems, queueOrder } = get()

    // Build queue of items to generate (queued status only)
    const queue = queueOrder.filter((id) => queueItems[id].status === 'queued')

    if (queue.length === 0) {
      set({ error: { message: 'No items queued for generation', type: 'warning' } })
      return
    }

    set({ generating: true, error: null })
    abortController = new AbortController()

    const generateOne = async (id: string) => {
      const item = get().queueItems[id]
      if (!item || item.status !== 'queued') return

      // Mark as generating
      set((state) => ({
        queueItems: {
          ...state.queueItems,
          [id]: { ...item, status: 'generating' },
        },
        currentJobId: id,
      }))

      const fullPrompt = composePrompt(item.prompt, item.presets)

      try {
        const isStartEnd = item.workflowType === 'startEnd' && item.startEndImages
        const endpoint = isStartEnd ? '/api/avatars/i2v-startend' : '/api/avatars/i2v'
        const payload = isStartEnd
          ? {
              startImageUrl: item.startEndImages!.startImageUrl,
              endImageUrl: item.startEndImages!.endImageUrl,
              prompt: fullPrompt,
              duration: Number.parseInt(item.settings.duration, 10),
              aspectRatio: item.settings.aspectRatio,
            }
          : {
              imageUrl: item.imageUrl,
              prompt: fullPrompt,
              duration: Number.parseInt(item.settings.duration, 10),
              aspectRatio: item.settings.aspectRatio,
            }

        const res = await authFetch(apiUrl(endpoint), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abortController?.signal,
        })

        if (!res.ok) {
          const raw = await res.json().catch(() => ({}))
          throw new Error(getApiError(raw, 'Video generation failed'))
        }

        const raw = await res.json()
        const data = unwrapApiData<{ videoUrl: string; localPath: string }>(raw)

        // Mark as completed
        set((state) => ({
          queueItems: {
            ...state.queueItems,
            [id]: {
              ...state.queueItems[id],
              status: 'completed',
              result: {
                videoUrl: data.videoUrl,
                localPath: data.localPath,
              },
              completedAt: Date.now(),
            },
          },
        }))
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // Cancelled by user
          set((state) => ({
            queueItems: {
              ...state.queueItems,
              [id]: { ...state.queueItems[id], status: 'paused' },
            },
          }))
        } else {
          // Failed
          set((state) => ({
            queueItems: {
              ...state.queueItems,
              [id]: {
                ...state.queueItems[id],
                status: 'failed',
                error: err instanceof Error ? err.message : 'Generation failed',
              },
            },
          }))
        }
      }
    }

    // Process queue with concurrency limit
    const workers = Array.from({ length: MAX_CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const id = queue.shift()
        if (id) await generateOne(id)
      }
    })

    await Promise.all(workers)

    set({ generating: false, currentJobId: null })
  },

  // Pause queue
  pauseQueue: () => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    set({ generating: false, currentJobId: null })
  },

  // Resume queue (re-queue paused items)
  resumeQueue: () => {
    set((state) => {
      const updated = { ...state.queueItems }
      for (const id of state.queueOrder) {
        if (updated[id].status === 'paused') {
          updated[id] = { ...updated[id], status: 'queued' }
        }
      }
      return { queueItems: updated }
    })

    get().generateQueue()
  },

  // Cancel current job
  cancelCurrent: () => {
    const { currentJobId } = get()
    if (currentJobId) {
      set((state) => ({
        queueItems: {
          ...state.queueItems,
          [currentJobId]: { ...state.queueItems[currentJobId], status: 'paused' },
        },
        currentJobId: null,
      }))
    }
  },

  // Img2Img specific methods
  setImg2ImgSettings: (id, settings) => {
    set((state) => ({
      queueItems: {
        ...state.queueItems,
        [id]: {
          ...state.queueItems[id],
          img2imgSettings: {
            ...(state.queueItems[id].img2imgSettings || {
              aspectRatio: '1:1',
              numberOfOutputs: 1,
              resolution: '1K',
              format: 'PNG',
            }),
            ...settings,
          },
        },
      },
    }))
  },

  transformImage: async (id) => {
    const item = get().queueItems[id]
    if (!item) return

    // Update to generating
    set((state) => ({
      queueItems: {
        ...state.queueItems,
        [id]: { ...item, status: 'generating' },
      },
    }))

    try {
      const res = await authFetch(apiUrl('/api/generate/img2img/transform'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: item.imageUrl,
          prompt: item.prompt,
          aspectRatio: item.img2imgSettings?.aspectRatio || '1:1',
          numberOfOutputs: item.img2imgSettings?.numberOfOutputs || 1,
          resolution: item.img2imgSettings?.resolution || '1K',
          format: item.img2imgSettings?.format || 'PNG',
        }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, `Transform failed (${res.status})`))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ images: Array<{ url: string; localPath?: string }> }>(raw)

      // Use first image as result (for now)
      const firstImage = data.images[0]
      if (!firstImage) {
        throw new Error('No images returned from API')
      }

      set((state) => ({
        queueItems: {
          ...state.queueItems,
          [id]: {
            ...state.queueItems[id],
            status: 'completed',
            result: {
              imageUrl: firstImage.url,
              localPath: firstImage.localPath || firstImage.url,
            },
            completedAt: Date.now(),
          },
        },
      }))
    } catch (err) {
      set((state) => ({
        queueItems: {
          ...state.queueItems,
          [id]: {
            ...state.queueItems[id],
            status: 'failed',
            error: err instanceof Error ? err.message : 'Transform failed',
          },
        },
      }))
    }
  },

  transformBatch: async (ids, prompt, settings) => {
    const items = ids.map((id) => get().queueItems[id]).filter(Boolean)
    if (items.length === 0) return

    // Mark all as generating
    set((state) => ({
      queueItems: Object.fromEntries(
        Object.entries(state.queueItems).map(([id, item]) =>
          ids.includes(id) ? [id, { ...item, status: 'generating' as const }] : [id, item],
        ),
      ),
    }))

    try {
      const imageUrls = items.map((item) => item.imageUrl)

      const res = await authFetch(apiUrl('/api/generate/img2img/transform'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls,
          prompt,
          aspectRatio: settings.aspectRatio,
          numberOfOutputs: settings.numberOfOutputs,
          resolution: settings.resolution,
          format: settings.format,
        }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, `Transform failed (${res.status})`))
      }

      const raw = await res.json()
      const data = unwrapApiData<{ images: Array<{ url: string; localPath?: string }> }>(raw)

      if (!data.images || data.images.length === 0) {
        throw new Error('No images returned from API')
      }

      // All reference images were used together to generate outputs
      // Keep reference items as draft (so they can be reused), and add new output items
      set((state) => {
        const newItems = { ...state.queueItems }

        // Reset reference items back to draft (so they can be transformed again with different prompts)
        ids.forEach((id) => {
          if (newItems[id]) {
            newItems[id] = {
              ...newItems[id],
              status: 'draft',
            }
          }
        })

        // Create new items for each generated output
        const newOutputItems: Record<string, QueueItem> = {}
        const newOutputIds: string[] = []

        data.images.forEach((image, _index) => {
          const newId = generateId()
          newOutputIds.push(newId)
          newOutputItems[newId] = {
            id: newId,
            imageUrl: image.localPath || image.url,
            prompt: prompt,
            workflowType: 'img2img',
            img2imgSettings: settings,
            presets: {},
            settings: {
              duration: state.globalSettings.duration,
              aspectRatio: state.globalSettings.aspectRatio,
            },
            status: 'completed',
            result: {
              imageUrl: image.url,
              localPath: image.localPath || image.url,
            },
            createdAt: Date.now(),
            completedAt: Date.now(),
          }
        })

        return {
          queueItems: {
            ...newItems,
            ...newOutputItems,
          },
          queueOrder: [...state.queueOrder, ...newOutputIds],
          selectedId: newOutputIds[0] || state.selectedId,
        }
      })
    } catch (err) {
      console.error('[transformBatch] Error:', err)
      // Mark all as failed
      set((state) => ({
        queueItems: Object.fromEntries(
          Object.entries(state.queueItems).map(([id, item]) =>
            ids.includes(id)
              ? [
                  id,
                  {
                    ...item,
                    status: 'failed' as const,
                    error: err instanceof Error ? err.message : 'Transform failed',
                  },
                ]
              : [id, item],
          ),
        ),
      }))
    }
  },

  // Start/End specific
  setStartEndImages: (id, images) => {
    set((state) => ({
      queueItems: {
        ...state.queueItems,
        [id]: { ...state.queueItems[id], startEndImages: images },
      },
    }))
  },

  uploadStartEndFiles: async (startFile, endFile) => {
    set({ uploading: true, error: null })

    const uploadOne = async (file: File): Promise<string> => {
      const form = new FormData()
      form.append('image', file)
      const res = await authFetch(apiUrl('/api/generate/upload-reference'), {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, `Upload failed (${res.status})`))
      }
      const raw = await res.json()
      return unwrapApiData<{ path: string }>(raw).path
    }

    try {
      const [startPath, endPath] = await Promise.all([uploadOne(startFile), uploadOne(endFile)])

      const id = generateId()
      const item: QueueItem = {
        id,
        imageUrl: startPath,
        prompt: '',
        workflowType: 'startEnd',
        presets: {},
        settings: {
          duration: get().globalSettings.duration,
          aspectRatio: get().globalSettings.aspectRatio,
        },
        startEndImages: { startImageUrl: startPath, endImageUrl: endPath },
        status: 'draft',
        createdAt: Date.now(),
      }

      set((state) => ({
        queueItems: { ...state.queueItems, [id]: item },
        queueOrder: [...state.queueOrder, id],
        selectedId: id,
        uploading: false,
      }))

      return id
    } catch (err) {
      set({
        uploading: false,
        error: { message: err instanceof Error ? err.message : 'Upload failed', type: 'error' },
      })
      return null
    }
  },

  // Utility
  setError: (error) => set({ error }),

  reset: () =>
    set({
      queueItems: {},
      queueOrder: [],
      selectedId: null,
      generating: false,
      uploading: false,
      currentJobId: null,
      error: null,
    }),
}))
