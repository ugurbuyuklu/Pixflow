import { Router } from 'express'
import { getDb } from '../db/index.js'

export function createProductsRouter(): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    const db = getDb()
    const products = db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY id').all()
    res.json({ products })
  })

  return router
}
