import { create } from 'zustand'
import { apiUrl, getApiError, unwrapApiData } from '../lib/api'
import { clearToken, getToken, setToken } from '../lib/auth'

const DEV_AUTO_LOGIN_ENABLED =
  import.meta.env.DEV && String(import.meta.env.VITE_PIXFLOW_DEV_AUTO_LOGIN || '').trim() === '1'
const DEV_AUTO_LOGIN_EMAIL = String(import.meta.env.VITE_PIXFLOW_DEV_AUTO_LOGIN_EMAIL || 'dev@pixery.ai').trim()
const DEV_AUTO_LOGIN_PASSWORD = String(import.meta.env.VITE_PIXFLOW_DEV_AUTO_LOGIN_PASSWORD || 'dev123pixery!').trim()

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
      // Optional local shortcut for faster UI iteration.
      if (DEV_AUTO_LOGIN_ENABLED && DEV_AUTO_LOGIN_EMAIL && DEV_AUTO_LOGIN_PASSWORD) {
        await useAuthStore.getState().login(DEV_AUTO_LOGIN_EMAIL, DEV_AUTO_LOGIN_PASSWORD)
      }
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
