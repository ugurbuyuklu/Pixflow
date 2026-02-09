import { Router } from 'express'
import type { AuthRequest } from '../middleware/auth.js'
import { sendError, sendSuccess } from '../utils/http.js'
import {
  getGeneratedImages,
  getImageById,
  rateImage,
  removeRating,
} from '../services/imageRatings.js'

export function createImageRatingsRouter(): Router {
  const router = Router()

  router.get('/', async (req: AuthRequest, res) => {
    try {
      const { rating, concept, jobId, limit } = req.query
      const images = await getGeneratedImages(req.user!.id, {
        rating: rating ? Number.parseInt(rating as string) : undefined,
        concept: concept as string,
        jobId: jobId as string,
        limit: limit ? Number.parseInt(limit as string) : undefined,
      })
      sendSuccess(res, { images })
    } catch (err) {
      sendError(res, 'Failed to load images', 500)
    }
  })

  router.get('/:id', async (req: AuthRequest, res) => {
    try {
      const image = await getImageById(req.user!.id, Number.parseInt(req.params.id))
      if (!image) {
        return sendError(res, 'Image not found', 404)
      }
      sendSuccess(res, { image })
    } catch (err) {
      sendError(res, 'Failed to load image', 500)
    }
  })

  router.post('/:id/rate', async (req: AuthRequest, res) => {
    try {
      const { rating, notes } = req.body
      if (rating !== 1 && rating !== -1) {
        return sendError(res, 'Rating must be 1 (like) or -1 (dislike)', 400)
      }
      await rateImage(req.user!.id, Number.parseInt(req.params.id), rating, notes)
      sendSuccess(res, { message: 'Image rated successfully' })
    } catch (err) {
      sendError(res, 'Failed to rate image', 500)
    }
  })

  router.delete('/:id/rate', async (req: AuthRequest, res) => {
    try {
      await removeRating(req.user!.id, Number.parseInt(req.params.id))
      sendSuccess(res, { message: 'Rating removed' })
    } catch (err) {
      sendError(res, 'Failed to remove rating', 500)
    }
  })

  return router
}
