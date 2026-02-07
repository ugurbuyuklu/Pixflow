import { Router } from 'express'
import { getDb } from '../db/index.js'
import { getPresets, getPreset, createPreset, updatePreset, deletePreset } from '../services/presets.js'
import type { AuthRequest } from '../middleware/auth.js'
import { sendError, sendSuccess } from '../utils/http.js'

const MAX_NAME_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 1000
const MAX_PROMPT_SIZE = 50_000

export function createPresetsRouter(): Router {
  const router = Router()

  router.get('/', (req: AuthRequest, res) => {
    const userId = req.user!.id
    let productId: number | undefined

    if (req.query.product) {
      const db = getDb()
      const row = db.prepare('SELECT id FROM products WHERE slug = ?').get(req.query.product) as { id: number } | undefined
      productId = row?.id
    }

    sendSuccess(res, { presets: getPresets(productId, userId) })
  })

  router.get('/:id', (req: AuthRequest, res) => {
    const preset = getPreset(Number(req.params.id), req.user!.id)
    if (!preset) {
      sendError(res, 404, 'Preset not found', 'PRESET_NOT_FOUND')
      return
    }
    sendSuccess(res, { preset })
  })

  router.post('/', (req: AuthRequest, res) => {
    const { name, description, prompt, productId } = req.body

    if (!name || typeof name !== 'string' || name.length > MAX_NAME_LENGTH) {
      sendError(res, 400, `Name required (max ${MAX_NAME_LENGTH} chars)`, 'INVALID_PRESET_NAME')
      return
    }
    if (description && (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH)) {
      sendError(res, 400, `Description max ${MAX_DESCRIPTION_LENGTH} chars`, 'INVALID_PRESET_DESCRIPTION')
      return
    }
    if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) {
      sendError(res, 400, 'Prompt must be a JSON object', 'INVALID_PRESET_PROMPT')
      return
    }
    if (JSON.stringify(prompt).length > MAX_PROMPT_SIZE) {
      sendError(res, 400, 'Prompt too large', 'PRESET_PROMPT_TOO_LARGE')
      return
    }

    const preset = createPreset(req.user!.id, name.trim(), description?.trim() ?? null, prompt, productId)
    sendSuccess(res, { preset }, 201)
  })

  router.patch('/:id', (req: AuthRequest, res) => {
    const { name, description, prompt } = req.body
    const updates: { name?: string; description?: string; prompt?: Record<string, unknown> } = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.length > MAX_NAME_LENGTH) {
        sendError(res, 400, `Name max ${MAX_NAME_LENGTH} chars`, 'INVALID_PRESET_NAME')
        return
      }
      updates.name = name.trim()
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH) {
        sendError(res, 400, `Description max ${MAX_DESCRIPTION_LENGTH} chars`, 'INVALID_PRESET_DESCRIPTION')
        return
      }
      updates.description = description.trim()
    }
    if (prompt !== undefined) {
      if (typeof prompt !== 'object' || Array.isArray(prompt) || !prompt) {
        sendError(res, 400, 'Prompt must be a JSON object', 'INVALID_PRESET_PROMPT')
        return
      }
      if (JSON.stringify(prompt).length > MAX_PROMPT_SIZE) {
        sendError(res, 400, 'Prompt too large', 'PRESET_PROMPT_TOO_LARGE')
        return
      }
      updates.prompt = prompt
    }

    const preset = updatePreset(Number(req.params.id), req.user!.id, updates)
    if (!preset) {
      sendError(res, 404, 'Preset not found or not editable', 'PRESET_NOT_FOUND')
      return
    }
    sendSuccess(res, { preset })
  })

  router.delete('/:id', (req: AuthRequest, res) => {
    if (!deletePreset(Number(req.params.id), req.user!.id)) {
      sendError(res, 404, 'Preset not found or not deletable', 'PRESET_NOT_FOUND')
      return
    }
    sendSuccess(res, {})
  })

  return router
}
