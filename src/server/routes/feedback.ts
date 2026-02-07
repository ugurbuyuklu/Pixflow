import { Router } from 'express'
import { getDb } from '../db/index.js'
import { getFeedback, createFeedback, deleteFeedback } from '../services/feedback.js'
import type { AuthRequest } from '../middleware/auth.js'
import { sendError, sendSuccess } from '../utils/http.js'

const MAX_CONTENT_LENGTH = 2000
const VALID_CATEGORIES = ['bug', 'feature', 'improvement', 'other']

export function createFeedbackRouter(): Router {
  const router = Router()

  router.get('/', (req: AuthRequest, res) => {
    const userId = req.user!.id
    let productId: number | undefined

    const slug = req.query.product
    if (slug && typeof slug === 'string' && /^[a-z0-9-]{1,50}$/.test(slug)) {
      const db = getDb()
      const row = db.prepare('SELECT id FROM products WHERE slug = ?').get(slug) as { id: number } | undefined
      productId = row?.id
    }

    sendSuccess(res, { feedback: getFeedback(userId, productId) })
  })

  router.post('/', (req: AuthRequest, res) => {
    const { content, category, productId } = req.body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      sendError(res, 400, 'Content is required', 'INVALID_FEEDBACK_CONTENT')
      return
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      sendError(res, 400, `Content too long (max ${MAX_CONTENT_LENGTH} chars)`, 'FEEDBACK_TOO_LONG')
      return
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      sendError(res, 400, `Category must be one of: ${VALID_CATEGORIES.join(', ')}`, 'INVALID_FEEDBACK_CATEGORY')
      return
    }

    if (productId !== undefined && (typeof productId !== 'number' || !Number.isFinite(productId))) {
      sendError(res, 400, 'Invalid product ID', 'INVALID_PRODUCT_ID')
      return
    }

    const entry = createFeedback(req.user!.id, content.trim(), category, productId)
    sendSuccess(res, { feedback: entry }, 201)
  })

  router.delete('/:id', (req: AuthRequest, res) => {
    if (!deleteFeedback(Number(req.params.id), req.user!.id)) {
      sendError(res, 404, 'Feedback not found', 'FEEDBACK_NOT_FOUND')
      return
    }
    sendSuccess(res, {})
  })

  return router
}
