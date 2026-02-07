import { Router } from 'express'
import { getDb } from '../db/index.js'
import { getFeedback, createFeedback, deleteFeedback } from '../services/feedback.js'
import type { AuthRequest } from '../middleware/auth.js'

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

    res.json({ feedback: getFeedback(userId, productId) })
  })

  router.post('/', (req: AuthRequest, res) => {
    const { content, category, productId } = req.body

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Content is required' })
      return
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      res.status(400).json({ error: `Content too long (max ${MAX_CONTENT_LENGTH} chars)` })
      return
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      res.status(400).json({ error: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` })
      return
    }

    if (productId !== undefined && (typeof productId !== 'number' || !Number.isFinite(productId))) {
      res.status(400).json({ error: 'Invalid product ID' })
      return
    }

    const entry = createFeedback(req.user!.id, content.trim(), category, productId)
    res.status(201).json({ feedback: entry })
  })

  router.delete('/:id', (req: AuthRequest, res) => {
    if (!deleteFeedback(Number(req.params.id), req.user!.id)) {
      res.status(404).json({ error: 'Feedback not found' })
      return
    }
    res.json({ success: true })
  })

  return router
}
