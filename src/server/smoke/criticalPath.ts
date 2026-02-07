import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import { createApp } from '../createApp.js'
import { stopJobCleanup } from '../services/fal.js'

type JsonValue = Record<string, unknown>

interface ApiEnvelope<T = JsonValue> {
  success: boolean
  data: T
  error?: string
  code?: string
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEnvelope<T>(value: unknown, endpoint: string): asserts value is ApiEnvelope<T> {
  assert(!!value && typeof value === 'object', `${endpoint}: response is not an object`)
  const obj = value as Record<string, unknown>
  assert(typeof obj.success === 'boolean', `${endpoint}: missing boolean success`)
  assert(Object.prototype.hasOwnProperty.call(obj, 'data'), `${endpoint}: missing data envelope`)
}

async function requestJson<T>(
  baseUrl: string,
  endpoint: string,
  init?: RequestInit
): Promise<{ status: number; json: ApiEnvelope<T> }> {
  const res = await fetch(`${baseUrl}${endpoint}`, init)
  const json = (await res.json()) as unknown
  assertEnvelope<T>(json, endpoint)
  return { status: res.status, json }
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'pixflow-smoke-secret-abcdefghijklmnopqrstuvwxyz'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP = process.env.PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP || 'true'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL = process.env.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL || 'smoke-admin@pixflow.local'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD = process.env.PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD || 'SmokeAdminPassword123'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_NAME = process.env.PIXFLOW_BOOTSTRAP_ADMIN_NAME || 'Smoke Admin'

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-smoke-'))
  const dataDir = path.join(tempRoot, 'data')

  const app = createApp({
    projectRoot: process.cwd(),
    dataDir,
  })

  const server = app.listen(0)
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  let token = ''
  let historyEntryId = ''
  let favoriteId = ''

  try {
    console.log(`[Smoke] Base URL: ${baseUrl}`)

    const health = await requestJson<{ status: string }>(baseUrl, '/health')
    assert(health.status === 200, '/health should return 200')
    assert(health.json.success, '/health should be success=true')
    assert(health.json.data.status === 'ok', '/health data.status should be ok')

    const login = await requestJson<{ token: string; user: { email: string } }>(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL,
        password: process.env.PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD,
      }),
    })
    assert(login.status === 200, '/api/auth/login should return 200')
    assert(login.json.success, '/api/auth/login should be success=true')
    assert(typeof login.json.data.token === 'string' && login.json.data.token.length > 0, 'login token missing')
    token = login.json.data.token

    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    const me = await requestJson<{ user: { email: string } }>(baseUrl, '/api/auth/me', { headers: authHeaders })
    assert(me.status === 200, '/api/auth/me should return 200')
    assert(me.json.success, '/api/auth/me should be success=true')
    assert(me.json.data.user.email === process.env.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL, '/api/auth/me email mismatch')

    const products = await requestJson<{ products: unknown[] }>(baseUrl, '/api/products')
    assert(products.status === 200, '/api/products should return 200')
    assert(Array.isArray(products.json.data.products), '/api/products data.products should be array')

    const settings = await requestJson(baseUrl, '/api/settings/status', { headers: authHeaders })
    assert(settings.status === 200, '/api/settings/status should return 200')
    assert(settings.json.success, '/api/settings/status should be success=true')

    const historyCreate = await requestJson<{ entry: { id: string } }>(baseUrl, '/api/history', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        concept: 'smoke test concept',
        prompts: [{ style: 'smoke', pose: { framing: 'test' } }],
        source: 'generated',
      }),
    })
    assert(historyCreate.status === 200, '/api/history POST should return 200')
    assert(historyCreate.json.success, '/api/history POST should be success=true')
    historyEntryId = historyCreate.json.data.entry.id
    assert(typeof historyEntryId === 'string' && historyEntryId.length > 0, 'history entry id missing')

    const historyList = await requestJson<{ history: Array<{ id: string }> }>(baseUrl, '/api/history', { headers: authHeaders })
    assert(historyList.status === 200, '/api/history GET should return 200')
    assert(historyList.json.success, '/api/history GET should be success=true')
    assert(historyList.json.data.history.some((entry) => entry.id === historyEntryId), 'history entry not found in listing')

    const favoriteCreate = await requestJson<{ favorite: { id: string } }>(baseUrl, '/api/history/favorites', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Smoke Favorite',
        concept: 'smoke test concept',
        prompt: { style: 'smoke' },
      }),
    })
    assert(favoriteCreate.status === 200, '/api/history/favorites POST should return 200')
    assert(favoriteCreate.json.success, '/api/history/favorites POST should be success=true')
    favoriteId = favoriteCreate.json.data.favorite.id
    assert(typeof favoriteId === 'string' && favoriteId.length > 0, 'favorite id missing')

    const favoritePatch = await requestJson(baseUrl, `/api/history/favorites/${favoriteId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Smoke Favorite Renamed' }),
    })
    assert(favoritePatch.status === 200, '/api/history/favorites/:id PATCH should return 200')
    assert(favoritePatch.json.success, '/api/history/favorites/:id PATCH should be success=true')

    const favoriteDelete = await requestJson(baseUrl, `/api/history/favorites/${favoriteId}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    assert(favoriteDelete.status === 200, '/api/history/favorites/:id DELETE should return 200')
    assert(favoriteDelete.json.success, '/api/history/favorites/:id DELETE should be success=true')

    const historyDelete = await requestJson(baseUrl, `/api/history/${historyEntryId}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    assert(historyDelete.status === 200, '/api/history/:id DELETE should return 200')
    assert(historyDelete.json.success, '/api/history/:id DELETE should be success=true')

    const historyClear = await requestJson(baseUrl, '/api/history', {
      method: 'DELETE',
      headers: authHeaders,
    })
    assert(historyClear.status === 200, '/api/history DELETE should return 200')
    assert(historyClear.json.success, '/api/history DELETE should be success=true')

    console.log('[Smoke] Critical path passed')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    stopJobCleanup()
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

run().catch((error) => {
  console.error('[Smoke] Critical path failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
