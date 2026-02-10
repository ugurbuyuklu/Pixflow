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
      sendError(res, 500, 'Failed to load images')
    }
  })

  router.get('/:id', async (req: AuthRequest, res) => {
    try {
      const imageId = Number.parseInt(req.params.id)
      if (Number.isNaN(imageId)) {
        return sendError(res, 400, 'Invalid image ID')
      }
      const image = await getImageById(req.user!.id, imageId)
      if (!image) {
        return sendError(res, 404, 'Image not found')
      }
      sendSuccess(res, { image })
    } catch (err) {
      sendError(res, 500, 'Failed to load image')
    }
  })

  router.post('/:id/rate', async (req: AuthRequest, res) => {
    try {
      const imageId = Number.parseInt(req.params.id)
      if (Number.isNaN(imageId)) {
        return sendError(res, 400, 'Invalid image ID')
      }
      const { rating, notes } = req.body
      if (rating !== 1 && rating !== -1) {
        return sendError(res, 400, 'Rating must be 1 (like) or -1 (dislike)')
      }
      await rateImage(req.user!.id, imageId, rating, notes)
      sendSuccess(res, { message: 'Image rated successfully' })
    } catch (err) {
      sendError(res, 500, 'Failed to rate image')
    }
  })

  router.delete('/:id/rate', async (req: AuthRequest, res) => {
    try {
      const imageId = Number.parseInt(req.params.id)
      if (Number.isNaN(imageId)) {
        return sendError(res, 400, 'Invalid image ID')
      }
      await removeRating(req.user!.id, imageId)
      sendSuccess(res, { message: 'Rating removed' })
    } catch (err) {
      sendError(res, 500, 'Failed to remove rating')
    }
  })

  return router
}
