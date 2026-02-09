import { create } from 'zustand'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type { ErrorInfo } from '../types'

// Re-export constants from old store for compatibility
export const DURATIONS = ['5', '10'] as const
export const ASPECT_RATIOS = ['9:16', '16:9', '1:1'] as const
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
    options: ['The speed of the camera motion is slow', 'The speed of the camera motion is normal', 'The speed of the camera motion is fast'],
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

// UUID generation helper
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Compose multi-select presets into prompt
function composePrompt(base: string, presets: Record<string, string[]>): string {
  const fragments: string[] = []
  for (const values of Object.values(presets)) {
    fragments.push(...values)
  }
  if (fragments.length === 0) return base
  return `${base}, ${fragments.join(', ')}`
}

export interface QueueItem {
  id: string
  imageUrl: string
  prompt: string
  presets: Record<string, string[]>  // Multi-select: key -> array of selected options
  settings: {
    duration: string
    aspectRatio: string
  }
  status: 'draft' | 'queued' | 'generating' | 'completed' | 'failed' | 'paused'
  result?: {
    videoUrl: string
    localPath: string
  }
  error?: string
  createdAt: number
  completedAt?: number
}

interface Img2VideoQueueState {
  // Core state
  queueItems: Record<string, QueueItem>  // Normalized by ID
  queueOrder: string[]                    // Order array
  selectedId: string | null               // Currently viewing in workspace

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
  addItem: (imageUrl: string) => string  // Returns new item ID
  addItems: (imageUrls: string[]) => string[]  // Returns array of new IDs
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
  skipItem: (id: string) => void  // Move to end of queue

  // Batch operations
  queueItem: (id: string) => void  // Draft -> Queued
  queueAll: () => void  // All drafts -> Queued
  retryFailed: () => void  // All failed -> Queued
  clearFailed: () => void
  clearCompleted: () => void

  // Global settings
  setGlobalDuration: (duration: string) => void
  setGlobalAspectRatio: (ratio: string) => void
  setGlobalPresets: (presets: Record<string, string[]>) => void
  applyGlobalSettingsToItem: (id: string) => void
  applyGlobalSettingsToAll: () => void

  // Upload
  uploadFiles: (files: File[]) => Promise<string[]>  // Returns array of new item IDs

  // Generation
  generateQueue: () => Promise<void>
  pauseQueue: () => void
  resumeQueue: () => void
  cancelCurrent: () => void

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
  addItem: (imageUrl) => {
    const id = generateId()
    const item: QueueItem = {
      id,
      imageUrl,
      prompt: '',
      presets: {},
      settings: {
        duration: get().globalSettings.duration,
        aspectRatio: get().globalSettings.aspectRatio,
      },
      status: 'draft',
      createdAt: Date.now(),
    }

    set((state) => ({
      queueItems: { ...state.queueItems, [id]: item },
      queueOrder: [...state.queueOrder, id],
      selectedId: state.selectedId || id,  // Auto-select first item
    }))

    return id
  },

  // Add multiple items
  addItems: (imageUrls) => {
    const ids = imageUrls.map((url) => {
      const id = generateId()
      return {
        id,
        item: {
          id,
          imageUrl: url,
          prompt: '',
          presets: {},
          settings: {
            duration: get().globalSettings.duration,
            aspectRatio: get().globalSettings.aspectRatio,
          },
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
      const newSelectedId = state.selectedId === id ? (newOrder[0] || null) : state.selectedId

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
  uploadFiles: async (files) => {
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

        const id = get().addItem(data.path)
        uploadedIds.push(id)
      } catch (err) {
        set({
          uploading: false,
          error: { message: err instanceof Error ? err.message : 'Upload failed', type: 'error' },
        })
        return uploadedIds  // Return what we uploaded so far
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
        const res = await authFetch(
          apiUrl('/api/avatars/i2v'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: item.imageUrl,
              prompt: fullPrompt,
              duration: Number.parseInt(item.settings.duration),
              aspectRatio: item.settings.aspectRatio,
            }),
            signal: abortController?.signal,
          },
        )

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
