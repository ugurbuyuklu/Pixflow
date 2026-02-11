import fs from 'node:fs/promises'
import path from 'node:path'
import { getDb } from '../db/index.js'
import type { FeedbackEntry } from './feedback.js'

export interface FeedbackExport {
  exportedAt: string
  totalCount: number
  feedback: FeedbackEntry[]
}

/**
 * Export all feedback to a JSON file
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

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `feedback-export-${timestamp}.json`
  const filepath = path.join(outputDir, filename)

  await fs.writeFile(filepath, JSON.stringify(exportData, null, 2), 'utf-8')

  console.log(`[FeedbackExport] Exported ${rows.length} feedback entries to ${filename}`)

  return filepath
}

/**
 * Get the latest export file path
 */
export async function getLatestExport(outputDir: string): Promise<string | null> {
  try {
    const files = await fs.readdir(outputDir)
    const exportFiles = files.filter((f) => f.startsWith('feedback-export-') && f.endsWith('.json'))

    if (exportFiles.length === 0) return null

    exportFiles.sort().reverse()
    return path.join(outputDir, exportFiles[0])
  } catch {
    return null
  }
}

/**
 * Auto-export feedback on a schedule (daily)
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

  // Then export daily
  return setInterval(doExport, DAILY_MS)
}
