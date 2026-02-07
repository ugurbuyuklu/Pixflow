import { Request, Response, NextFunction } from 'express'
import { verifyToken, getUserById } from '../services/auth.js'

export interface AuthRequest extends Request {
  user?: { id: number; email: string; name: string; role: string }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' })
    return
  }

  const payload = verifyToken(header.slice(7))
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  const user = getUserById(payload.userId)
  if (!user) {
    res.status(401).json({ error: 'User not found' })
    return
  }

  req.user = user
  next()
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}
