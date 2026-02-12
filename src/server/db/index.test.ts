import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSqliteRuntimeCompatible } from '../test-helpers.js'
import { backupDatabase, closeDatabase, getDb, initDatabase } from './index.js'

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), 'pixflow-db-test-'))
}

const describeDb = isSqliteRuntimeCompatible() ? describe : describe.skip

describeDb('db lifecycle', () => {
  it('getDb throws before initDatabase', () => {
    expect(() => getDb()).toThrow('Database not initialized')
  })

  it('initDatabase creates pixflow.db file', async () => {
    const tmpDir = await makeTmpDir()
    try {
      initDatabase(tmpDir)
      expect(fs.existsSync(path.join(tmpDir, 'pixflow.db'))).toBe(true)
    } finally {
      closeDatabase()
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('sets WAL journal mode', async () => {
    const tmpDir = await makeTmpDir()
    try {
      initDatabase(tmpDir)
      const result = getDb().pragma('journal_mode') as { journal_mode: string }[]
      expect(result[0].journal_mode).toBe('wal')
    } finally {
      closeDatabase()
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('enables foreign keys', async () => {
    const tmpDir = await makeTmpDir()
    try {
      initDatabase(tmpDir)
      const result = getDb().pragma('foreign_keys') as { foreign_keys: number }[]
      expect(result[0].foreign_keys).toBe(1)
    } finally {
      closeDatabase()
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('initDatabase is idempotent', async () => {
    const tmpDir = await makeTmpDir()
    try {
      const db1 = initDatabase(tmpDir)
      const db2 = initDatabase(tmpDir)
      expect(db1).toBe(db2)
    } finally {
      closeDatabase()
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('creates required tables', async () => {
    const tmpDir = await makeTmpDir()
    try {
      initDatabase(tmpDir)
      const tables = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string
      }[]
      const names = tables.map((t) => t.name)
      expect(names).toContain('users')
      expect(names).toContain('history')
      expect(names).toContain('favorites')
      expect(names).toContain('products')
    } finally {
      closeDatabase()
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('backupDatabase returns path in backups subdirectory', async () => {
    const tmpDir = await makeTmpDir()
    try {
      initDatabase(tmpDir)
      const backupPath = backupDatabase(tmpDir)
      expect(backupPath).not.toBeNull()
      expect(backupPath!).toContain(path.join(tmpDir, 'backups'))
      // db.backup() returns a promise internally — wait for it before closing
      await new Promise((r) => setTimeout(r, 200))
      expect(fs.existsSync(backupPath!)).toBe(true)
    } finally {
      closeDatabase()
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('backupDatabase returns null when not initialized', () => {
    expect(backupDatabase('/tmp/irrelevant')).toBeNull()
  })

  it('closeDatabase resets singleton so getDb throws', async () => {
    const tmpDir = await makeTmpDir()
    try {
      initDatabase(tmpDir)
      expect(() => getDb()).not.toThrow()
      closeDatabase()
      expect(() => getDb()).toThrow('Database not initialized')
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('closeDatabase is idempotent', () => {
    closeDatabase()
    closeDatabase()
  })
})
