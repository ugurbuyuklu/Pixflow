import { Router } from 'express'
import {
  getHistory,
  addToHistory,
  deleteHistoryEntry,
  clearHistory,
  getFavorites,
  addToFavorites,
  removeFromFavorites,
  updateFavoriteName,
} from '../services/history.js'
import type { AuthRequest } from '../middleware/auth.js'
import { sendError, sendSuccess } from '../utils/http.js'

export function createHistoryRouter(): Router {
const router = Router()

// History endpoints
router.get('/', async (req: AuthRequest, res) => {
  try {
    const history = await getHistory(req.user!.id)
    sendSuccess(res, { history })
  } catch (error) {
    sendError(res, 500, 'Failed to get history', 'HISTORY_FETCH_FAILED', error instanceof Error ? error.message : 'Unknown error')
  }
})

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { concept, prompts, source } = req.body

    if (!concept || !prompts || !Array.isArray(prompts)) {
      sendError(res, 400, 'Concept and prompts array required', 'INVALID_HISTORY_PAYLOAD')
      return
    }

    const entry = await addToHistory(req.user!.id, {
      concept,
      prompts,
      promptCount: prompts.length,
      source: source || 'generated',
    })

    sendSuccess(res, { entry })
  } catch (error) {
    sendError(res, 500, 'Failed to add to history', 'HISTORY_CREATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const deleted = await deleteHistoryEntry(req.user!.id, id)

    if (!deleted) {
      sendError(res, 404, 'History entry not found', 'HISTORY_NOT_FOUND')
      return
    }

    sendSuccess(res, {})
  } catch (error) {
    sendError(res, 500, 'Failed to delete history entry', 'HISTORY_DELETE_FAILED', error instanceof Error ? error.message : 'Unknown error')
  }
})

router.delete('/', async (req: AuthRequest, res) => {
  try {
    await clearHistory(req.user!.id)
    sendSuccess(res, {})
  } catch (error) {
    sendError(res, 500, 'Failed to clear history', 'HISTORY_CLEAR_FAILED', error instanceof Error ? error.message : 'Unknown error')
  }
})

// Favorites endpoints
router.get('/favorites', async (req: AuthRequest, res) => {
  try {
    const favorites = await getFavorites(req.user!.id)
    sendSuccess(res, { favorites })
  } catch (error) {
    sendError(res, 500, 'Failed to get favorites', 'FAVORITES_FETCH_FAILED', error instanceof Error ? error.message : 'Unknown error')
  }
})

router.post('/favorites', async (req: AuthRequest, res) => {
  try {
    const { prompt, name, concept } = req.body

    if (!prompt || !name) {
      sendError(res, 400, 'Prompt and name required', 'INVALID_FAVORITE_PAYLOAD')
      return
    }

    const favorite = await addToFavorites(req.user!.id, prompt, name, concept)
    sendSuccess(res, { favorite })
  } catch (error) {
    sendError(res, 500, 'Failed to add to favorites', 'FAVORITE_CREATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
  }
})

router.patch('/favorites/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const { name } = req.body

    if (!name) {
      sendError(res, 400, 'Name required', 'INVALID_FAVORITE_NAME')
      return
    }

    const updated = await updateFavoriteName(req.user!.id, id, name)

    if (!updated) {
      sendError(res, 404, 'Favorite not found', 'FAVORITE_NOT_FOUND')
      return
    }

    sendSuccess(res, {})
  } catch (error) {
    sendError(res, 500, 'Failed to update favorite', 'FAVORITE_UPDATE_FAILED', error instanceof Error ? error.message : 'Unknown error')
  }
})

router.delete('/favorites/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params
    const deleted = await removeFromFavorites(req.user!.id, id)

    if (!deleted) {
      sendError(res, 404, 'Favorite not found', 'FAVORITE_NOT_FOUND')
      return
    }

    sendSuccess(res, {})
  } catch (error) {
    sendError(res, 500, 'Failed to remove from favorites', 'FAVORITE_DELETE_FAILED', error instanceof Error ? error.message : 'Unknown error')
  }
})

return router
}
