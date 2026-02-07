import { Router } from 'express'
import { authenticateUser, changePassword, createUser, getUserById, listUsers } from '../services/auth.js'
import { requireAuth, requireAdmin, type AuthRequest } from '../middleware/auth.js'

export function createAuthRouter(): Router {
  const router = Router()

  router.post('/login', (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' })
      return
    }

    const result = authenticateUser(email, password)
    if (!result) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    res.json(result)
  })

  router.get('/me', requireAuth, (req: AuthRequest, res) => {
    res.json({ user: req.user })
  })

  router.post('/change-password', requireAuth, (req: AuthRequest, res) => {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password required' })
      return
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' })
      return
    }

    const success = changePassword(req.user!.id, currentPassword, newPassword)
    if (!success) {
      res.status(400).json({ error: 'Current password is incorrect' })
      return
    }

    res.json({ message: 'Password changed' })
  })

  router.post('/users', requireAuth, requireAdmin, (req: AuthRequest, res) => {
    const { email, password, name, role } = req.body
    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name required' })
      return
    }

    try {
      const user = createUser(email, password, name, role)
      res.status(201).json({ user })
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        res.status(409).json({ error: 'Email already exists' })
        return
      }
      throw err
    }
  })

  router.get('/users', requireAuth, requireAdmin, (_req, res) => {
    res.json({ users: listUsers() })
  })

  return router
}
