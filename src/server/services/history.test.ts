import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from '../db/index.js'
import { isSqliteRuntimeCompatible, setupTestDb } from '../test-helpers.js'
import {
  addToFavorites,
  addToHistory,
  clearHistory,
  deleteHistoryEntry,
  getFavorites,
  getHistory,
  removeFromFavorites,
  updateFavoriteName,
} from './history.js'

let cleanup: (() => Promise<void>) | undefined
let userId: number
let otherUserId: number
const describeDb = isSqliteRuntimeCompatible() ? describe : describe.skip

beforeAll(async () => {
  if (!isSqliteRuntimeCompatible()) return
  process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!'
  const ctx = await setupTestDb()
  cleanup = ctx.cleanup

  const db = getDb()
  const u1 = db
    .prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
    .run('hist@test.com', 'hash', 'Hist', 'user')
  userId = Number(u1.lastInsertRowid)
  const u2 = db
    .prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)')
    .run('other@test.com', 'hash', 'Other', 'user')
  otherUserId = Number(u2.lastInsertRowid)
})

afterAll(async () => {
  if (!isSqliteRuntimeCompatible()) return
  delete process.env.JWT_SECRET
  if (cleanup) {
    await cleanup()
  }
})

const sampleEntry = () => ({
  concept: 'Christmas',
  prompts: [{ style: 'editorial' }],
  promptCount: 1,
  source: 'generated' as const,
})

describeDb('getHistory', () => {
  it('returns empty array when no history', async () => {
    expect(await getHistory(userId)).toEqual([])
  })

  it('returns multiple entries', async () => {
    await addToHistory(userId, { ...sampleEntry(), concept: 'First' })
    await addToHistory(userId, { ...sampleEntry(), concept: 'Second' })
    const entries = await getHistory(userId)
    expect(entries.length).toBeGreaterThanOrEqual(2)
    expect(entries.map((e) => e.concept)).toContain('First')
    expect(entries.map((e) => e.concept)).toContain('Second')
  })

  it('respects limit parameter', async () => {
    const entries = await getHistory(userId, 1)
    expect(entries).toHaveLength(1)
  })

  it('clamps limit to range [1, 200]', async () => {
    const entriesZero = await getHistory(userId, 0)
    expect(entriesZero.length).toBeGreaterThanOrEqual(1)
    const entriesNeg = await getHistory(userId, -5)
    expect(entriesNeg.length).toBeGreaterThanOrEqual(1)
  })
})

describeDb('addToHistory', () => {
  it('inserts entry and returns it with id and createdAt', async () => {
    const entry = await addToHistory(userId, sampleEntry())
    expect(entry.id).toBeTruthy()
    expect(entry.createdAt).toBeTruthy()
    expect(entry.concept).toBe('Christmas')
  })

  it('serializes prompts as JSON array', async () => {
    const entry = await addToHistory(userId, {
      ...sampleEntry(),
      prompts: [{ a: 1 }, { b: 2 }],
      promptCount: 2,
    })
    expect(entry.prompts).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('normalizes source to generated for unknown values', async () => {
    const entry = await addToHistory(userId, {
      ...sampleEntry(),
      source: 'garbage' as 'generated',
    })
    expect(entry.source).toBe('generated')
  })

  it('preserves analyzed source', async () => {
    const entry = await addToHistory(userId, {
      ...sampleEntry(),
      source: 'analyzed',
    })
    expect(entry.source).toBe('analyzed')
  })

  it('auto-deletes oldest entries when count exceeds 100', async () => {
    await clearHistory(userId)
    for (let i = 0; i < 102; i++) {
      await addToHistory(userId, { ...sampleEntry(), concept: `Entry ${i}` })
    }
    const all = await getHistory(userId, 200)
    expect(all.length).toBe(100)
    expect(all.some((e) => e.concept === 'Entry 0')).toBe(false)
    expect(all.some((e) => e.concept === 'Entry 1')).toBe(false)
    expect(all.some((e) => e.concept === 'Entry 101')).toBe(true)
  })
})

describeDb('deleteHistoryEntry', () => {
  it('returns true and removes entry for valid id + userId', async () => {
    const entry = await addToHistory(userId, sampleEntry())
    expect(await deleteHistoryEntry(userId, entry.id)).toBe(true)
    const remaining = await getHistory(userId, 200)
    expect(remaining.find((e) => e.id === entry.id)).toBeUndefined()
  })

  it('returns false for non-existent id', async () => {
    expect(await deleteHistoryEntry(userId, '999999')).toBe(false)
  })

  it('returns false for id belonging to different user', async () => {
    const entry = await addToHistory(otherUserId, sampleEntry())
    expect(await deleteHistoryEntry(userId, entry.id)).toBe(false)
  })

  it('returns false for invalid id format', async () => {
    expect(await deleteHistoryEntry(userId, 'abc')).toBe(false)
    expect(await deleteHistoryEntry(userId, '-1')).toBe(false)
    expect(await deleteHistoryEntry(userId, '1.5')).toBe(false)
  })
})

describeDb('clearHistory', () => {
  it('removes all entries for given user', async () => {
    await addToHistory(userId, sampleEntry())
    await clearHistory(userId)
    expect(await getHistory(userId)).toEqual([])
  })

  it('does not affect other users entries', async () => {
    await addToHistory(otherUserId, { ...sampleEntry(), concept: 'Other kept' })
    await clearHistory(userId)
    const otherEntries = await getHistory(otherUserId)
    expect(otherEntries.some((e) => e.concept === 'Other kept')).toBe(true)
  })
})

describeDb('getFavorites', () => {
  it('returns empty array when no favorites', async () => {
    expect(await getFavorites(userId)).toEqual([])
  })
})

describeDb('addToFavorites', () => {
  it('inserts favorite and returns it with id', async () => {
    const fav = await addToFavorites(userId, { style: 'minimal' }, 'My Fav', 'Christmas')
    expect(fav.id).toBeTruthy()
    expect(fav.name).toBe('My Fav')
    expect(fav.concept).toBe('Christmas')
    expect(fav.prompt).toEqual({ style: 'minimal' })
  })

  it('handles undefined concept', async () => {
    const fav = await addToFavorites(userId, { style: 'bold' }, 'No Concept')
    expect(fav.concept).toBeUndefined()
  })

  it('returns Untitled when name is null in row', async () => {
    const db = getDb()
    db.prepare('INSERT INTO favorites (user_id, prompt, name, concept) VALUES (?, ?, NULL, NULL)').run(userId, '{}')
    const favs = await getFavorites(userId)
    const nullNameFav = favs.find((f) => f.name === 'Untitled')
    expect(nullNameFav).toBeDefined()
  })
})

describeDb('removeFromFavorites', () => {
  it('returns true for valid removal', async () => {
    const fav = await addToFavorites(userId, { x: 1 }, 'Del Me')
    expect(await removeFromFavorites(userId, fav.id)).toBe(true)
  })

  it('returns false for non-existent id', async () => {
    expect(await removeFromFavorites(userId, '999999')).toBe(false)
  })

  it('returns false for id belonging to different user', async () => {
    const fav = await addToFavorites(otherUserId, { x: 1 }, 'Other Fav')
    expect(await removeFromFavorites(userId, fav.id)).toBe(false)
  })
})

describeDb('updateFavoriteName', () => {
  it('returns true and updates name', async () => {
    const fav = await addToFavorites(userId, { z: 1 }, 'Old Name')
    expect(await updateFavoriteName(userId, fav.id, 'New Name')).toBe(true)
    const favs = await getFavorites(userId)
    expect(favs.find((f) => f.id === fav.id)?.name).toBe('New Name')
  })

  it('returns false for non-existent favorite', async () => {
    expect(await updateFavoriteName(userId, '999999', 'Nope')).toBe(false)
  })

  it('returns false for invalid id format', async () => {
    expect(await updateFavoriteName(userId, 'abc', 'Nope')).toBe(false)
    expect(await updateFavoriteName(userId, '-1', 'Nope')).toBe(false)
  })
})
