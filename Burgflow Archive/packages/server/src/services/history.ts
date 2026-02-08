import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.resolve(__dirname, '../../data')
const HISTORY_FILE = path.join(DATA_DIR, 'history.json')
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json')

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

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return defaultValue
  }
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await ensureDataDir()
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
}

// History functions
export async function getHistory(limit = 50): Promise<HistoryEntry[]> {
  const history = await readJsonFile<HistoryEntry[]>(HISTORY_FILE, [])
  return history.slice(0, limit)
}

export async function addToHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): Promise<HistoryEntry> {
  const history = await readJsonFile<HistoryEntry[]>(HISTORY_FILE, [])

  const newEntry: HistoryEntry = {
    ...entry,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  }

  history.unshift(newEntry)

  // Keep only last 100 entries
  const trimmed = history.slice(0, 100)
  await writeJsonFile(HISTORY_FILE, trimmed)

  return newEntry
}

export async function deleteHistoryEntry(id: string): Promise<boolean> {
  const history = await readJsonFile<HistoryEntry[]>(HISTORY_FILE, [])
  const filtered = history.filter(h => h.id !== id)

  if (filtered.length === history.length) return false

  await writeJsonFile(HISTORY_FILE, filtered)
  return true
}

export async function clearHistory(): Promise<void> {
  await writeJsonFile(HISTORY_FILE, [])
}

// Favorites functions
export async function getFavorites(): Promise<FavoritePrompt[]> {
  return readJsonFile<FavoritePrompt[]>(FAVORITES_FILE, [])
}

export async function addToFavorites(
  prompt: Record<string, unknown>,
  name: string,
  concept?: string
): Promise<FavoritePrompt> {
  const favorites = await readJsonFile<FavoritePrompt[]>(FAVORITES_FILE, [])

  const newFavorite: FavoritePrompt = {
    id: uuidv4(),
    prompt,
    name,
    concept,
    createdAt: new Date().toISOString(),
  }

  favorites.unshift(newFavorite)
  await writeJsonFile(FAVORITES_FILE, favorites)

  return newFavorite
}

export async function removeFromFavorites(id: string): Promise<boolean> {
  const favorites = await readJsonFile<FavoritePrompt[]>(FAVORITES_FILE, [])
  const filtered = favorites.filter(f => f.id !== id)

  if (filtered.length === favorites.length) return false

  await writeJsonFile(FAVORITES_FILE, filtered)
  return true
}

export async function updateFavoriteName(id: string, name: string): Promise<boolean> {
  const favorites = await readJsonFile<FavoritePrompt[]>(FAVORITES_FILE, [])
  const favorite = favorites.find(f => f.id === id)

  if (!favorite) return false

  favorite.name = name
  await writeJsonFile(FAVORITES_FILE, favorites)
  return true
}
