import { create } from 'zustand'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type { GeneratedPrompt } from '../types'

export interface Preset {
  id: number
  product_id: number | null
  user_id: number | null
  name: string
  description: string | null
  prompt: GeneratedPrompt
  is_builtin: number
  created_at: string
}

interface PresetState {
  presets: Preset[]
  loading: boolean
  error: string | null

  load: (productSlug?: string) => Promise<void>
  create: (name: string, description: string, prompt: GeneratedPrompt, productId?: number) => Promise<Preset | null>
  update: (id: number, updates: { name?: string; description?: string; prompt?: GeneratedPrompt }) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
}

export const usePresetStore = create<PresetState>()((set, get) => ({
  presets: [],
  loading: false,
  error: null,

  load: async (productSlug) => {
    set({ loading: true, error: null })
    try {
      const qs = productSlug ? `?product=${encodeURIComponent(productSlug)}` : ''
      const res = await authFetch(apiUrl(`/api/presets${qs}`))
      if (!res.ok) throw new Error(`Failed to load presets (${res.status})`)
      const raw = await res.json()
      const { presets } = unwrapApiData<{ presets: Preset[] }>(raw)
      set({ presets })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load presets' })
    } finally {
      set({ loading: false })
    }
  },

  create: async (name, description, prompt, productId) => {
    set({ error: null })
    try {
      const res = await authFetch(apiUrl('/api/presets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, prompt, productId }),
      })
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, `Failed to create preset (${res.status})`))
      }
      const raw = await res.json()
      const { preset } = unwrapApiData<{ preset: Preset }>(raw)
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
      const res = await authFetch(apiUrl(`/api/presets/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, `Failed to update preset (${res.status})`))
      }
      const raw = await res.json()
      const { preset } = unwrapApiData<{ preset: Preset }>(raw)
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
