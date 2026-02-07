import { create } from 'zustand'
import { apiUrl, authFetch } from '../lib/api'

interface Notification {
  id: number
  type: string
  title: string
  body: string
  read: boolean
  created_at: string
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number

  load: () => Promise<void>
  markRead: (id: number) => Promise<void>
  markAllRead: () => Promise<void>
  clear: () => void
}

export type { Notification }

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,

  load: async () => {
    try {
      const res = await authFetch(apiUrl('/api/notifications'))
      if (res.ok) {
        const data = await res.json()
        const notifications = data.notifications || []
        set({
          notifications,
          unreadCount: notifications.filter((n: Notification) => !n.read).length,
        })
      }
    } catch (err) {
      console.error('Failed to load notifications:', err)
    }
  },

  markRead: async (id) => {
    try {
      const res = await authFetch(apiUrl(`/api/notifications/${id}/read`), { method: 'PATCH' })
      if (res.ok) {
        set((state) => {
          const notifications = state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          )
          return {
            notifications,
            unreadCount: notifications.filter((n) => !n.read).length,
          }
        })
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  },

  markAllRead: async () => {
    const unreadIds = get().notifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return

    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))

    for (const id of unreadIds) {
      try {
        await authFetch(apiUrl(`/api/notifications/${id}/read`), { method: 'PATCH' })
      } catch (err) {
        console.error(`Failed to mark notification ${id} as read:`, err)
      }
    }
  },

  clear: () => set({ notifications: [], unreadCount: 0 }),
}))
