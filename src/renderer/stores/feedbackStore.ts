import { create } from 'zustand'
import { apiUrl, authFetch, getApiError, unwrapApiData } from '../lib/api'
import type { ErrorInfo } from '../types'
import { parseError } from '../types'

interface FeedbackEntry {
  id: number
  user_id: number
  product_id: number | null
  content: string
  category: string
  created_at: string
  user_name?: string
  product_name?: string
}

interface FeedbackState {
  entries: FeedbackEntry[]
  loading: boolean
  submitting: boolean
  error: ErrorInfo | null

  load: (productSlug?: string) => Promise<void>
  submit: (content: string, category: string, productId?: number) => Promise<boolean>
  remove: (id: number) => Promise<void>
}

export type { FeedbackEntry }

export const useFeedbackStore = create<FeedbackState>()((set) => ({
  entries: [],
  loading: false,
  submitting: false,
  error: null,

  load: async (productSlug) => {
    set({ loading: true, error: null })
    try {
      const url = productSlug
        ? apiUrl(`/api/feedback?product=${encodeURIComponent(productSlug)}`)
        : apiUrl('/api/feedback')
      const res = await authFetch(url)
      if (res.ok) {
        const raw = await res.json()
        const data = unwrapApiData<{ feedback: FeedbackEntry[] }>(raw)
        set({ entries: data.feedback })
      }
    } catch (err) {
      set({ error: parseError(err) })
    } finally {
      set({ loading: false })
    }
  },

  submit: async (content, category, productId) => {
    set({ submitting: true, error: null })
    try {
      const res = await authFetch(apiUrl('/api/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, category, productId }),
      })

      if (!res.ok) {
        const raw = await res.json().catch(() => ({}))
        throw new Error(getApiError(raw, 'Failed to submit feedback'))
      }

      return true
    } catch (err) {
      set({ error: parseError(err) })
      return false
    } finally {
      set({ submitting: false })
    }
  },

  remove: async (id) => {
    try {
      const res = await authFetch(apiUrl(`/api/feedback/${id}`), { method: 'DELETE' })
      if (res.ok) {
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }))
      }
    } catch (err) {
      console.error('Failed to delete feedback:', err)
    }
  },
}))
