import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

interface LegacyHistoryEntry {
  id: string
  concept: string
  prompts: unknown[]
  promptCount: number
  createdAt: string
  source?: string
}

interface LegacyFavorite {
  id: string
  name?: string
  concept?: string
  prompt: unknown
  createdAt: string
}

export function migrateJsonToSqlite(db: Database.Database, dataDir: string): void {
  migrateHistory(db, dataDir)
  migrateFavorites(db, dataDir)
}

function migrateHistory(db: Database.Database, dataDir: string): void {
  const jsonPath = path.join(dataDir, 'history.json')
  if (!fs.existsSync(jsonPath)) return

  const raw = fs.readFileSync(jsonPath, 'utf-8')
  let entries: LegacyHistoryEntry[]
  try {
    entries = JSON.parse(raw)
  } catch {
    console.error('[Migration] Failed to parse history.json')
    return
  }

  if (!Array.isArray(entries) || entries.length === 0) return

  const existing = db.prepare('SELECT COUNT(*) as count FROM history').get() as { count: number }
  if (existing.count > 0) return

  const adminUser = db.prepare('SELECT id FROM users WHERE role = ?').get('admin') as { id: number } | undefined
  const userId = adminUser?.id ?? 1

  const insert = db.prepare(
    'INSERT INTO history (user_id, concept, prompts, prompt_count, source, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )

  const insertAll = db.transaction((rows: LegacyHistoryEntry[]) => {
    for (const entry of rows) {
      insert.run(
        userId,
        entry.concept,
        JSON.stringify(entry.prompts),
        entry.promptCount,
        entry.source ?? 'generate',
        entry.createdAt
      )
    }
  })

  insertAll(entries)

  const bakPath = jsonPath + '.bak'
  fs.renameSync(jsonPath, bakPath)
  console.log(`[Migration] Migrated ${entries.length} history entries, original backed up to ${bakPath}`)
}

function migrateFavorites(db: Database.Database, dataDir: string): void {
  const jsonPath = path.join(dataDir, 'favorites.json')
  if (!fs.existsSync(jsonPath)) return

  const raw = fs.readFileSync(jsonPath, 'utf-8')
  let favorites: LegacyFavorite[]
  try {
    favorites = JSON.parse(raw)
  } catch {
    console.error('[Migration] Failed to parse favorites.json')
    return
  }

  if (!Array.isArray(favorites) || favorites.length === 0) return

  const existing = db.prepare('SELECT COUNT(*) as count FROM favorites').get() as { count: number }
  if (existing.count > 0) return

  const adminUser = db.prepare('SELECT id FROM users WHERE role = ?').get('admin') as { id: number } | undefined
  const userId = adminUser?.id ?? 1

  const insert = db.prepare(
    'INSERT INTO favorites (user_id, prompt, name, concept, created_at) VALUES (?, ?, ?, ?, ?)'
  )

  const insertAll = db.transaction((rows: LegacyFavorite[]) => {
    for (const fav of rows) {
      insert.run(
        userId,
        JSON.stringify(fav.prompt),
        fav.name ?? null,
        fav.concept ?? null,
        fav.createdAt
      )
    }
  })

  insertAll(favorites)

  const bakPath = jsonPath + '.bak'
  fs.renameSync(jsonPath, bakPath)
  console.log(`[Migration] Migrated ${favorites.length} favorites, original backed up to ${bakPath}`)
}
