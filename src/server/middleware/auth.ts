import type { NextFunction, Request, Response } from 'express'
import { getUserById, verifyToken } from '../services/auth.js'
import { sendError } from '../utils/http.js'

export interface AuthRequest extends Request {
  user?: { id: number; email: string; name: string; role: string }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  // Dev mode bypass - use mock user
  if (process.env.NODE_ENV === 'development') {
    req.user = { id: 1, email: 'dev@test.com', name: 'Dev User', role: 'admin' }
    next()
    return
  }

  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    sendError(res, 401, 'Missing authorization header', 'AUTH_HEADER_MISSING')
    return
  }

  const payload = verifyToken(header.slice(7))
  if (!payload) {
    sendError(res, 401, 'Invalid or expired token', 'AUTH_TOKEN_INVALID')
    return
  }

  const user = getUserById(payload.userId)
  if (!user) {
    sendError(res, 401, 'User not found', 'AUTH_USER_NOT_FOUND')
    return
  }

  req.user = user
  next()
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    sendError(res, 403, 'Admin access required', 'ADMIN_REQUIRED')
    return
  }
  next()
}
