import { create } from 'zustand'
import { apiUrl } from '../lib/api'
import { getToken, setToken, clearToken } from '../lib/auth'

interface User {
  id: number
  email: string
  name: string
  role: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null

  init: () => Promise<void>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  loading: true,
  error: null,

  init: async () => {
    const token = getToken()
    if (!token) {
      set({ loading: false })
      return
    }

    try {
      const res = await fetch(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        clearToken()
        set({ loading: false })
        return
      }
      const { user } = await res.json()
      set({ user, isAuthenticated: true, loading: false })
    } catch {
      clearToken()
      set({ loading: false })
    }
  },

  login: async (email, password) => {
    set({ error: null })
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const data = await res.json()
        set({ error: data.error || 'Login failed' })
        return false
      }

      const { user, token } = await res.json()
      setToken(token)
      set({ user, isAuthenticated: true, error: null })
      return true
    } catch {
      set({ error: 'Connection failed' })
      return false
    }
  },

  logout: () => {
    clearToken()
    set({ user: null, isAuthenticated: false })
  },

  changePassword: async (currentPassword, newPassword) => {
    const token = getToken()
    try {
      const res = await fetch(apiUrl('/api/auth/change-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      if (!res.ok) {
        const data = await res.json()
        return data.error || 'Failed to change password'
      }

      return null
    } catch {
      return 'Connection failed'
    }
  },
}))
