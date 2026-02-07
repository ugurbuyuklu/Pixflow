import { create } from 'zustand'
import { apiUrl, authFetch } from '../lib/api'
import type { HistoryEntry, FavoritePrompt, GeneratedPrompt } from '../types'

interface HistoryState {
  entries: HistoryEntry[]
  favorites: FavoritePrompt[]
  loading: boolean
  selectedPrompt: GeneratedPrompt | null
  favoriteAdded: string | null

  setSelectedPrompt: (prompt: GeneratedPrompt | null) => void

  loadAll: () => Promise<void>
  loadFavorites: () => Promise<void>
  addToFavorites: (prompt: GeneratedPrompt, name: string, concept?: string) => Promise<void>
  removeFromFavorites: (id: string) => Promise<void>
  deleteHistoryEntry: (id: string) => Promise<void>
  clearHistory: () => Promise<void>
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  entries: [],
  favorites: [],
  loading: false,
  selectedPrompt: null,
  favoriteAdded: null,

  setSelectedPrompt: (selectedPrompt) => set({ selectedPrompt }),

  loadAll: async () => {
    set({ loading: true })
    try {
      const [historyRes, favoritesRes] = await Promise.all([
        authFetch(apiUrl('/api/history')),
        authFetch(apiUrl('/api/history/favorites')),
      ])
      if (historyRes.ok) {
        const data = await historyRes.json()
        set({ entries: data.history })
      }
      if (favoritesRes.ok) {
        const data = await favoritesRes.json()
        set({ favorites: data.favorites })
      }
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      set({ loading: false })
    }
  },

  loadFavorites: async () => {
    try {
      const res = await authFetch(apiUrl('/api/history/favorites'))
      if (res.ok) {
        const data = await res.json()
        set({ favorites: data.favorites })
      }
    } catch {
      // Silently fail — favorites will load when tab is opened
    }
  },

  addToFavorites: async (prompt, name, concept) => {
    try {
      const res = await authFetch(apiUrl('/api/history/favorites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, name, concept }),
      })
      if (res.ok) {
        const data = await res.json()
        set((state) => ({
          favorites: [data.favorite, ...state.favorites],
          favoriteAdded: name,
        }))
        setTimeout(() => set({ favoriteAdded: null }), 2000)
      }
    } catch (err) {
      console.error('Failed to add to favorites:', err)
    }
  },

  removeFromFavorites: async (id) => {
    try {
      const res = await authFetch(apiUrl(`/api/history/favorites/${id}`), { method: 'DELETE' })
      if (res.ok) {
        set((state) => ({ favorites: state.favorites.filter((f) => f.id !== id) }))
      }
    } catch (err) {
      console.error('Failed to remove from favorites:', err)
    }
  },

  deleteHistoryEntry: async (id) => {
    try {
      const res = await authFetch(apiUrl(`/api/history/${id}`), { method: 'DELETE' })
      if (res.ok) {
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }))
      }
    } catch (err) {
      console.error('Failed to delete history entry:', err)
    }
  },

  clearHistory: async () => {
    try {
      const res = await authFetch(apiUrl('/api/history'), { method: 'DELETE' })
      if (res.ok) {
        set({ entries: [] })
      }
    } catch (err) {
      console.error('Failed to clear history:', err)
    }
  },
}))
