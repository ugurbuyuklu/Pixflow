import { Router } from 'express'
import { getNotifications, markAsRead, markAllAsRead } from '../services/notifications.js'
import type { AuthRequest } from '../middleware/auth.js'

export function createNotificationsRouter(): Router {
  const router = Router()

  router.get('/', (req: AuthRequest, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const notifications = getNotifications(req.user!.id, Math.min(limit, 100))
    res.json({ notifications })
  })

  router.patch('/:id/read', (req: AuthRequest, res) => {
    if (!markAsRead(Number(req.params.id), req.user!.id)) {
      res.status(404).json({ error: 'Notification not found' })
      return
    }
    res.json({ success: true })
  })

  router.post('/read-all', (req: AuthRequest, res) => {
    const count = markAllAsRead(req.user!.id)
    res.json({ success: true, marked: count })
  })

  return router
}
