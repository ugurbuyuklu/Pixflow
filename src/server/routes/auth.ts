import { Router } from 'express'
import { authenticateUser, changePassword, createUser, getUserById, listUsers } from '../services/auth.js'
import { requireAuth, requireAdmin, type AuthRequest } from '../middleware/auth.js'
import { sendError, sendSuccess } from '../utils/http.js'

export function createAuthRouter(): Router {
  const router = Router()

  router.post('/login', (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
      sendError(res, 400, 'Email and password required', 'INVALID_LOGIN_PAYLOAD')
      return
    }

    const result = authenticateUser(email, password)
    if (!result) {
      sendError(res, 401, 'Invalid credentials', 'INVALID_CREDENTIALS')
      return
    }

    sendSuccess(res, result)
  })

  router.get('/me', requireAuth, (req: AuthRequest, res) => {
    sendSuccess(res, { user: req.user })
  })

  router.post('/change-password', requireAuth, (req: AuthRequest, res) => {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      sendError(res, 400, 'Current and new password required', 'INVALID_PASSWORD_PAYLOAD')
      return
    }

    if (newPassword.length < 6) {
      sendError(res, 400, 'Password must be at least 6 characters', 'INVALID_PASSWORD')
      return
    }

    const success = changePassword(req.user!.id, currentPassword, newPassword)
    if (!success) {
      sendError(res, 400, 'Current password is incorrect', 'INVALID_CURRENT_PASSWORD')
      return
    }

    sendSuccess(res, { message: 'Password changed' })
  })

  router.post('/users', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const { email, password, name, role } = req.body
    if (!email || !password || !name) {
      sendError(res, 400, 'Email, password, and name required', 'INVALID_USER_PAYLOAD')
      return
    }

    try {
      const user = createUser(email, password, name, role)
      sendSuccess(res, { user }, 201)
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        sendError(res, 409, 'Email already exists', 'EMAIL_EXISTS')
        return
      }
      throw err
    }
  })

  router.get('/users', requireAuth, requireAdmin, (_req, res) => {
    sendSuccess(res, { users: listUsers() })
  })

  return router
}
