import { Router } from 'express'
import { getNotifications, markAsRead, markAllAsRead } from '../services/notifications.js'
import type { AuthRequest } from '../middleware/auth.js'
import { sendError, sendSuccess } from '../utils/http.js'

export function createNotificationsRouter(): Router {
  const router = Router()

  router.get('/', (req: AuthRequest, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const notifications = getNotifications(req.user!.id, Math.min(limit, 100))
    sendSuccess(res, { notifications })
  })

  router.patch('/:id/read', (req: AuthRequest, res) => {
    if (!markAsRead(Number(req.params.id), req.user!.id)) {
      sendError(res, 404, 'Notification not found', 'NOTIFICATION_NOT_FOUND')
      return
    }
    sendSuccess(res, {})
  })

  router.post('/read-all', (req: AuthRequest, res) => {
    const count = markAllAsRead(req.user!.id)
    sendSuccess(res, { marked: count })
  })

  return router
}
