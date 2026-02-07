import { Router } from 'express'
import { getDb } from '../db/index.js'
import { sendSuccess } from '../utils/http.js'

export function createProductsRouter(): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    const db = getDb()
    const products = db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY id').all()
    sendSuccess(res, { products })
  })

  return router
}
