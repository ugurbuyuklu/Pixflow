import fs from 'node:fs/promises'
import path from 'node:path'
import { getDb } from '../db/index.js'
import type { FeedbackEntry } from './feedback.js'

export interface FeedbackExport {
  exportedAt: string
  totalCount: number
  feedback: FeedbackEntry[]
}

const FEEDBACK_FILE = 'feedback.json'

/**
 * Export all feedback to a single JSON file (overwrites existing)
 */
export async function exportFeedbackToJson(outputDir: string): Promise<string> {
  const db = getDb()

  const rows = db
    .prepare(`
      SELECT f.*, u.name as user_name, p.name as product_name
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN products p ON f.product_id = p.id
      ORDER BY f.created_at DESC
    `)
    .all() as FeedbackEntry[]

  const exportData: FeedbackExport = {
    exportedAt: new Date().toISOString(),
    totalCount: rows.length,
    feedback: rows,
  }

  await fs.mkdir(outputDir, { recursive: true })

  const filepath = path.join(outputDir, FEEDBACK_FILE)

  await fs.writeFile(filepath, JSON.stringify(exportData, null, 2), 'utf-8')

  console.log(`[FeedbackExport] Exported ${rows.length} feedback entries to ${FEEDBACK_FILE}`)

  return filepath
}

/**
 * Get the feedback file path
 */
export async function getLatestExport(outputDir: string): Promise<string | null> {
  try {
    const filepath = path.join(outputDir, FEEDBACK_FILE)
    await fs.access(filepath)
    return filepath
  } catch {
    return null
  }
}

/**
 * Auto-export feedback on every feedback submission
 */
export function scheduleAutoExport(outputDir: string): NodeJS.Timeout {
  const DAILY_MS = 24 * 60 * 60 * 1000

  const doExport = async () => {
    try {
      await exportFeedbackToJson(outputDir)
    } catch (error) {
      console.error('[FeedbackExport] Auto-export failed:', error)
    }
  }

  // Export immediately on startup
  doExport()

  // Then export daily (backup schedule)
  return setInterval(doExport, DAILY_MS)
}
