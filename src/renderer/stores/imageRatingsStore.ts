import { create } from 'zustand'
import { apiUrl, authFetch, unwrapApiData } from '../lib/api'
import type { GeneratedImageRecord } from '../types'

interface ImageRatingsState {
  images: GeneratedImageRecord[]
  likedImages: GeneratedImageRecord[]
  dislikedImages: GeneratedImageRecord[]
  loading: boolean

  loadImages: (filters?: { rating?: number; concept?: string }) => Promise<void>
  loadLikedImages: () => Promise<void>
  rateImage: (imageId: number, rating: 1 | -1) => Promise<void>
  removeRating: (imageId: number) => Promise<void>
}

export const useImageRatingsStore = create<ImageRatingsState>()((set, get) => ({
  images: [],
  likedImages: [],
  dislikedImages: [],
  loading: false,

  loadImages: async (filters) => {
    set({ loading: true })
    try {
      const params = new URLSearchParams()
      if (filters?.rating !== undefined) params.append('rating', String(filters.rating))
      if (filters?.concept) params.append('concept', filters.concept)

      const res = await authFetch(apiUrl(`/api/images?${params.toString()}`))
      if (!res.ok) throw new Error(`${res.status}`)

      const raw = await res.json()
      const data = unwrapApiData<{ images: GeneratedImageRecord[] }>(raw)
      set({ images: data.images, loading: false })
    } catch (err) {
      console.error('Failed to load images:', err)
      set({ loading: false })
    }
  },

  loadLikedImages: async () => {
    set({ loading: true })
    try {
      const res = await authFetch(apiUrl('/api/images?rating=1'))
      if (!res.ok) throw new Error(`${res.status}`)

      const raw = await res.json()
      const data = unwrapApiData<{ images: GeneratedImageRecord[] }>(raw)
      set({ likedImages: data.images, loading: false })
    } catch (err) {
      console.error('Failed to load liked images:', err)
      set({ loading: false })
    }
  },

  rateImage: async (imageId, rating) => {
    try {
      const res = await authFetch(apiUrl(`/api/images/${imageId}/rate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      })
      if (!res.ok) throw new Error(`${res.status}`)

      await get().loadLikedImages()
    } catch (err) {
      console.error('Failed to rate image:', err)
    }
  },

  removeRating: async (imageId) => {
    try {
      const res = await authFetch(apiUrl(`/api/images/${imageId}/rate`), {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`${res.status}`)

      await get().loadLikedImages()
    } catch (err) {
      console.error('Failed to remove rating:', err)
    }
  },
}))
