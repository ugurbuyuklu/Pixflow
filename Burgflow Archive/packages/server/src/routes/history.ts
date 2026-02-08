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

const router = Router()

// History endpoints
router.get('/', async (_req, res) => {
  try {
    const history = await getHistory()
    res.json({ history })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get history',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.post('/', async (req, res) => {
  try {
    const { concept, prompts, source } = req.body

    if (!concept || !prompts || !Array.isArray(prompts)) {
      res.status(400).json({ error: 'Concept and prompts array required' })
      return
    }

    const entry = await addToHistory({
      concept,
      prompts,
      promptCount: prompts.length,
      source: source || 'generated',
    })

    res.json({ entry })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to add to history',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const deleted = await deleteHistoryEntry(id)

    if (!deleted) {
      res.status(404).json({ error: 'History entry not found' })
      return
    }

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete history entry',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.delete('/', async (_req, res) => {
  try {
    await clearHistory()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear history',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Favorites endpoints
router.get('/favorites', async (_req, res) => {
  try {
    const favorites = await getFavorites()
    res.json({ favorites })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get favorites',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.post('/favorites', async (req, res) => {
  try {
    const { prompt, name, concept } = req.body

    if (!prompt || !name) {
      res.status(400).json({ error: 'Prompt and name required' })
      return
    }

    const favorite = await addToFavorites(prompt, name, concept)
    res.json({ favorite })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to add to favorites',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.patch('/favorites/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name } = req.body

    if (!name) {
      res.status(400).json({ error: 'Name required' })
      return
    }

    const updated = await updateFavoriteName(id, name)

    if (!updated) {
      res.status(404).json({ error: 'Favorite not found' })
      return
    }

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update favorite',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

router.delete('/favorites/:id', async (req, res) => {
  try {
    const { id } = req.params
    const deleted = await removeFromFavorites(id)

    if (!deleted) {
      res.status(404).json({ error: 'Favorite not found' })
      return
    }

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to remove from favorites',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
