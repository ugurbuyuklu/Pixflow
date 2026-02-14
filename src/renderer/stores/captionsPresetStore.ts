import { create } from 'zustand'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'

export interface CaptionPresetSettings {
  language: string
  fontName: string
  fontSize: number
  fontWeight: 'normal' | 'bold' | 'black'
  fontColor: string
  highlightColor: string
  strokeWidth: number
  strokeColor: string
  backgroundColor: string
  backgroundOpacity: number
  position: 'top' | 'center' | 'bottom'
  xOffset: number
  yOffset: number
  timingOffsetMs?: number
  wordsPerSubtitle: number
  enableAnimation: boolean
}

export interface CaptionPreset {
  id: number
  name: string
  description: string | null
  prompt: CaptionPresetSettings
  created_at: string
}

interface CaptionsPresetState {
  presets: CaptionPreset[]
  loading: boolean
  error: string | null
  load: () => Promise<void>
  create: (name: string, description: string | null, settings: CaptionPresetSettings) => Promise<CaptionPreset | null>
  update: (
    id: number,
    updates: { name?: string; description?: string | null; settings?: CaptionPresetSettings },
  ) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
}

export const useCaptionsPresetStore = create<CaptionsPresetState>()((set, _get) => ({
  presets: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const res = await authFetch(apiUrl('/api/presets?product=captions'))
      if (!res.ok) throw new Error(`Failed to load presets (${res.status})`)
      const raw = await res.json()
      const { presets } = unwrapApiData<{ presets: CaptionPreset[] }>(raw)
      set({ presets })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load presets' })
    } finally {
      set({ loading: false })
    }
  },

  create: async (name, description, settings) => {
    set({ error: null })
    try {
      const res = await authFetch(apiUrl('/api/presets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, prompt: settings, productId: undefined, product: 'captions' }),
      })
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, `Failed to create preset (${res.status})`))
      }
      const raw = await res.json()
      const { preset } = unwrapApiData<{ preset: CaptionPreset }>(raw)
      set((s) => ({ presets: [preset, ...s.presets] }))
      return preset
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create preset' })
      return null
    }
  },

  update: async (id, updates) => {
    set({ error: null })
    try {
      const payload: { name?: string; description?: string | null; prompt?: CaptionPresetSettings } = {}
      if (updates.name !== undefined) payload.name = updates.name
      if (updates.description !== undefined) payload.description = updates.description
      if (updates.settings !== undefined) payload.prompt = updates.settings

      const res = await authFetch(apiUrl(`/api/presets/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, `Failed to update preset (${res.status})`))
      }
      const raw = await res.json()
      const { preset } = unwrapApiData<{ preset: CaptionPreset }>(raw)
      set((s) => ({ presets: s.presets.map((p) => (p.id === id ? preset : p)) }))
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update preset' })
      return false
    }
  },

  remove: async (id) => {
    set({ error: null })
    try {
      const res = await authFetch(apiUrl(`/api/presets/${id}`), { method: 'DELETE' })
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, `Failed to delete preset (${res.status})`))
      }
      set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }))
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete preset' })
      return false
    }
  },
}))
