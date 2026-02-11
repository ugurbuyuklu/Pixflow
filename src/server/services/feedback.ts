import path from 'node:path'
import { getDb } from '../db/index.js'
import { exportFeedbackToJson } from './feedbackExport.js'

export interface FeedbackEntry {
  id: number
  user_id: number
  product_id: number | null
  content: string
  category: string
  created_at: string
  user_name?: string
  product_name?: string
}

interface FeedbackRow {
  id: number
  user_id: number
  product_id: number | null
  content: string
  category: string
  created_at: string
  user_name?: string
  product_name?: string
}

export function getFeedback(userId: number, productId?: number): FeedbackEntry[] {
  const db = getDb()
  const conditions = ['f.user_id = ?']
  const params: unknown[] = [userId]

  if (productId !== undefined) {
    conditions.push('f.product_id = ?')
    params.push(productId)
  }

  const where = conditions.join(' AND ')
  const rows = db
    .prepare(`
    SELECT f.*, u.name as user_name, p.name as product_name
    FROM feedback f
    LEFT JOIN users u ON f.user_id = u.id
    LEFT JOIN products p ON f.product_id = p.id
    WHERE ${where}
    ORDER BY f.created_at DESC
  `)
    .all(...params) as FeedbackRow[]

  return rows
}

export function createFeedback(userId: number, content: string, category: string, productId?: number): FeedbackEntry {
  const db = getDb()
  const result = db
    .prepare('INSERT INTO feedback (user_id, content, category, product_id) VALUES (?, ?, ?, ?)')
    .run(userId, content, category, productId ?? null)

  const row = db
    .prepare(`
    SELECT f.*, u.name as user_name, p.name as product_name
    FROM feedback f
    LEFT JOIN users u ON f.user_id = u.id
    LEFT JOIN products p ON f.product_id = p.id
    WHERE f.id = ?
  `)
    .get(result.lastInsertRowid) as FeedbackRow

  // Auto-export after creating feedback
  const exportDir = path.join(process.cwd(), 'exports')
  exportFeedbackToJson(exportDir).catch((err) => {
    console.error('[Feedback] Auto-export failed:', err)
  })

  return row
}

export function deleteFeedback(id: number, userId: number): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM feedback WHERE id = ? AND user_id = ?').run(id, userId)
  return result.changes > 0
}
