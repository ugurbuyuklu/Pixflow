import { create } from 'zustand'
import { apiUrl, getApiError, unwrapApiData } from '../lib/api'
import { clearToken, getToken, setToken } from '../lib/auth'

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
      // Dev auto-login: auth gate is bypassed, auto-login so API calls have a token
      // TODO: remove when auth gate is re-enabled before release
      await useAuthStore.getState().login('dev@pixery.ai', 'dev123pixery!')
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
      const raw = await res.json()
      const { user } = unwrapApiData<{ user: User }>(raw)
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
        const raw = await res.json().catch(() => ({}))
        set({ error: getApiError(raw, 'Login failed') })
        return false
      }

      const raw = await res.json()
      const { user, token } = unwrapApiData<{ user: User; token: string }>(raw)
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
        const raw = await res.json().catch(() => ({}))
        return getApiError(raw, 'Failed to change password')
      }

      return null
    } catch {
      return 'Connection failed'
    }
  },
}))
