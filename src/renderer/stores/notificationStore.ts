import { create } from 'zustand'
import { apiUrl, authFetch } from '../lib/api'
import type { Notification } from '../types'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number

  load: () => Promise<void>
  markRead: (id: number) => Promise<void>
  markAllRead: () => Promise<void>
  clear: () => void
}

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
    if (get().unreadCount === 0) return

    const prev = get().notifications
    set({
      notifications: prev.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })

    try {
      await authFetch(apiUrl('/api/notifications/read-all'), { method: 'POST' })
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err)
      set({ notifications: prev, unreadCount: prev.filter((n) => !n.read).length })
    }
  },

  clear: () => set({ notifications: [], unreadCount: 0 }),
}))
