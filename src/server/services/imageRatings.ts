import { getDb } from '../db/index.js'
import type { BatchJob } from './fal.js'

// Safe JSON parse helper to prevent crashes from corrupt DB data
function safeParseJSON(jsonString: string): Record<string, unknown> {
  try {
    return JSON.parse(jsonString)
  } catch (err) {
    console.error('[ImageRatings] Failed to parse JSON:', err)
    return {}
  }
}

export interface GeneratedImageRecord {
  id: number
  userId: number
  jobId: string
  batchIndex: number
  promptIndex: number
  variantIndex: number
  url: string
  localPath: string
  fileName: string
  concept: string
  prompt: Record<string, unknown>
  aspectRatio?: string
  resolution?: string
  outputFormat?: string
  generatedAt: string
  rating?: number
  ratingNotes?: string
  ratedAt?: string
}

export async function saveBatchImages(
  userId: number,
  job: BatchJob,
  prompts: Record<string, unknown>[],
  settings: { aspectRatio?: string; resolution?: string; outputFormat?: string },
): Promise<void> {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO generated_images (
      user_id, job_id, batch_index, prompt_index, variant_index,
      url, local_path, file_name, concept, prompt,
      aspect_ratio, resolution, output_format
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const image of job.images) {
    if (image.status !== 'completed' || !image.localPath) continue

    stmt.run(
      userId,
      job.id,
      image.promptIndex,
      image.promptIndex,
      0,
      image.url,
      image.localPath,
      image.localPath.split('/').pop() || 'unknown.jpg',
      job.concept,
      JSON.stringify(prompts[image.promptIndex]),
      settings.aspectRatio,
      settings.resolution,
      settings.outputFormat,
    )
  }
}

export async function getGeneratedImages(
  userId: number,
  filters?: { rating?: number; concept?: string; jobId?: string; limit?: number },
): Promise<GeneratedImageRecord[]> {
  const db = getDb()

  let query = `
    SELECT
      gi.*,
      ir.rating,
      ir.notes as rating_notes,
      ir.rated_at
    FROM generated_images gi
    LEFT JOIN image_ratings ir ON gi.id = ir.image_id AND ir.user_id = ?
    WHERE gi.user_id = ?
  `

  const params: unknown[] = [userId, userId]

  if (filters?.rating !== undefined) {
    query += ' AND ir.rating = ?'
    params.push(filters.rating)
  }

  if (filters?.concept) {
    query += ' AND gi.concept = ?'
    params.push(filters.concept)
  }

  if (filters?.jobId) {
    query += ' AND gi.job_id = ?'
    params.push(filters.jobId)
  }

  query += ' ORDER BY gi.generated_at DESC'

  if (filters?.limit) {
    query += ' LIMIT ?'
    params.push(filters.limit)
  }

  const rows = db.prepare(query).all(...params) as {
    id: number
    user_id: number
    job_id: string
    batch_index: number
    prompt_index: number
    variant_index: number
    url: string
    local_path: string
    file_name: string
    concept: string
    prompt: string
    aspect_ratio?: string
    resolution?: string
    output_format?: string
    generated_at: string
    rating?: number
    rating_notes?: string
    rated_at?: string
  }[]

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    batchIndex: row.batch_index,
    promptIndex: row.prompt_index,
    variantIndex: row.variant_index,
    url: row.url,
    localPath: row.local_path,
    fileName: row.file_name,
    concept: row.concept,
    prompt: safeParseJSON(row.prompt),
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    outputFormat: row.output_format,
    generatedAt: row.generated_at,
    rating: row.rating,
    ratingNotes: row.rating_notes,
    ratedAt: row.rated_at,
  }))
}

export async function rateImage(
  userId: number,
  imageId: number,
  rating: 1 | -1,
  notes?: string,
): Promise<void> {
  const db = getDb()

  db.prepare(`
    INSERT INTO image_ratings (user_id, image_id, rating, notes, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, image_id) DO UPDATE SET
      rating = excluded.rating,
      notes = excluded.notes,
      updated_at = datetime('now')
  `).run(userId, imageId, rating, notes || null)
}

export async function removeRating(userId: number, imageId: number): Promise<void> {
  const db = getDb()
  db.prepare('DELETE FROM image_ratings WHERE user_id = ? AND image_id = ?').run(userId, imageId)
}

export async function getImageById(userId: number, imageId: number): Promise<GeneratedImageRecord | null> {
  const db = getDb()

  const row = db
    .prepare(
      `
    SELECT
      gi.*,
      ir.rating,
      ir.notes as rating_notes,
      ir.rated_at
    FROM generated_images gi
    LEFT JOIN image_ratings ir ON gi.id = ir.image_id AND ir.user_id = ?
    WHERE gi.id = ? AND gi.user_id = ?
  `,
    )
    .get(userId, imageId, userId) as
    | {
        id: number
        user_id: number
        job_id: string
        batch_index: number
        prompt_index: number
        variant_index: number
        url: string
        local_path: string
        file_name: string
        concept: string
        prompt: string
        aspect_ratio?: string
        resolution?: string
        output_format?: string
        generated_at: string
        rating?: number
        rating_notes?: string
        rated_at?: string
      }
    | undefined

  if (!row) return null

  return {
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    batchIndex: row.batch_index,
    promptIndex: row.prompt_index,
    variantIndex: row.variant_index,
    url: row.url,
    localPath: row.local_path,
    fileName: row.file_name,
    concept: row.concept,
    prompt: safeParseJSON(row.prompt),
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    outputFormat: row.output_format,
    generatedAt: row.generated_at,
    rating: row.rating,
    ratingNotes: row.rating_notes,
    ratedAt: row.rated_at,
  }
}

export async function getImagesByJobId(userId: number, jobId: string): Promise<GeneratedImageRecord[]> {
  return getGeneratedImages(userId, { jobId })
}
