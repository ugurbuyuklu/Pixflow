import { getDb } from '../db/index.js'

export interface HistoryEntry {
  id: string
  concept: string
  prompts: Record<string, unknown>[]
  promptCount: number
  createdAt: string
  source: 'generated' | 'analyzed'
}

export interface FavoritePrompt {
  id: string
  prompt: Record<string, unknown>
  name: string
  concept?: string
  createdAt: string
}

interface HistoryRow {
  id: number
  concept: string
  prompts: string
  prompt_count: number
  created_at: string
  source: string
}

interface FavoriteRow {
  id: number
  prompt: string
  name: string | null
  concept: string | null
  created_at: string
}

function parsePromptArray(raw: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}

function parsePrompt(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function mapHistoryRow(row: HistoryRow): HistoryEntry {
  return {
    id: String(row.id),
    concept: row.concept,
    prompts: parsePromptArray(row.prompts),
    promptCount: row.prompt_count,
    createdAt: row.created_at,
    source: row.source === 'analyzed' ? 'analyzed' : 'generated',
  }
}

function mapFavoriteRow(row: FavoriteRow): FavoritePrompt {
  return {
    id: String(row.id),
    prompt: parsePrompt(row.prompt),
    name: row.name || 'Untitled',
    concept: row.concept ?? undefined,
    createdAt: row.created_at,
  }
}

function normalizeHistorySource(input: unknown): 'generated' | 'analyzed' {
  return input === 'analyzed' ? 'analyzed' : 'generated'
}

export async function getHistory(userId: number, limit = 50): Promise<HistoryEntry[]> {
  const db = getDb()
  const rows = db.prepare(`
    SELECT id, concept, prompts, prompt_count, created_at, source
    FROM history
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(userId, Math.max(1, Math.min(limit, 200))) as HistoryRow[]
  return rows.map(mapHistoryRow)
}

export async function addToHistory(
  userId: number,
  entry: Omit<HistoryEntry, 'id' | 'createdAt'>
): Promise<HistoryEntry> {
  const db = getDb()
  const source = normalizeHistorySource(entry.source)

  const tx = db.transaction(() => {
    const inserted = db.prepare(`
      INSERT INTO history (user_id, concept, prompts, prompt_count, source)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      userId,
      entry.concept,
      JSON.stringify(entry.prompts),
      entry.promptCount,
      source
    )

    const row = db.prepare(`
      SELECT id, concept, prompts, prompt_count, created_at, source
      FROM history
      WHERE id = ?
    `).get(Number(inserted.lastInsertRowid)) as HistoryRow

    const count = (db.prepare('SELECT COUNT(*) as c FROM history WHERE user_id = ?').get(userId) as { c: number }).c
    if (count > 100) {
      db.prepare(`
        DELETE FROM history
        WHERE id IN (
          SELECT id FROM history
          WHERE user_id = ?
          ORDER BY datetime(created_at) ASC
          LIMIT ?
        )
      `).run(userId, count - 100)
    }

    return row
  })

  return mapHistoryRow(tx())
}

export async function deleteHistoryEntry(userId: number, id: string): Promise<boolean> {
  const parsed = Number(id)
  if (!Number.isInteger(parsed) || parsed <= 0) return false

  const db = getDb()
  const result = db.prepare('DELETE FROM history WHERE id = ? AND user_id = ?').run(parsed, userId)
  return result.changes > 0
}

export async function clearHistory(userId: number): Promise<void> {
  const db = getDb()
  db.prepare('DELETE FROM history WHERE user_id = ?').run(userId)
}

export async function getFavorites(userId: number): Promise<FavoritePrompt[]> {
  const db = getDb()
  const rows = db.prepare(`
    SELECT id, prompt, name, concept, created_at
    FROM favorites
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC
  `).all(userId) as FavoriteRow[]
  return rows.map(mapFavoriteRow)
}

export async function addToFavorites(
  userId: number,
  prompt: Record<string, unknown>,
  name: string,
  concept?: string
): Promise<FavoritePrompt> {
  const db = getDb()
  const inserted = db.prepare(`
    INSERT INTO favorites (user_id, prompt, name, concept)
    VALUES (?, ?, ?, ?)
  `).run(userId, JSON.stringify(prompt), name, concept ?? null)

  const row = db.prepare(`
    SELECT id, prompt, name, concept, created_at
    FROM favorites
    WHERE id = ?
  `).get(Number(inserted.lastInsertRowid)) as FavoriteRow

  return mapFavoriteRow(row)
}

export async function removeFromFavorites(userId: number, id: string): Promise<boolean> {
  const parsed = Number(id)
  if (!Number.isInteger(parsed) || parsed <= 0) return false

  const db = getDb()
  const result = db.prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?').run(parsed, userId)
  return result.changes > 0
}

export async function updateFavoriteName(userId: number, id: string, name: string): Promise<boolean> {
  const parsed = Number(id)
  if (!Number.isInteger(parsed) || parsed <= 0) return false

  const db = getDb()
  const result = db.prepare('UPDATE favorites SET name = ? WHERE id = ? AND user_id = ?').run(name, parsed, userId)
  return result.changes > 0
}
