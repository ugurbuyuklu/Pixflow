import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { createTables, seedProducts } from './schema.js'

let db: Database.Database | null = null

export function initDatabase(dataDir: string): Database.Database {
  if (db) return db

  fs.mkdirSync(dataDir, { recursive: true })

  const dbPath = path.join(dataDir, 'pixflow.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables(db)
  seedProducts(db)

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function backupDatabase(dataDir: string): string | null {
  if (!db) return null

  const backupDir = path.join(dataDir, 'backups')
  fs.mkdirSync(backupDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `pixflow-${timestamp}.db`)

  db.backup(backupPath)
  return backupPath
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
