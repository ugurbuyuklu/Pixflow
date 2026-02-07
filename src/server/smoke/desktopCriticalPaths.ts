import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import { createApp } from '../createApp.js'
import { stopJobCleanup } from '../services/fal.js'

interface ApiEnvelope<T = Record<string, unknown>> {
  success: boolean
  data: T
  error?: string
  code?: string
}

const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0yQAAAAASUVORK5CYII='

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEnvelope<T>(value: unknown, endpoint: string): asserts value is ApiEnvelope<T> {
  assert(!!value && typeof value === 'object', `${endpoint}: response is not object`)
  const obj = value as Record<string, unknown>
  assert(typeof obj.success === 'boolean', `${endpoint}: missing success`)
  assert(Object.prototype.hasOwnProperty.call(obj, 'data'), `${endpoint}: missing data`)
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

async function waitForBatchCompletion(baseUrl: string, token: string, jobId: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const progress = await requestJson<{ status: string }>(
      baseUrl,
      `/api/generate/progress/${jobId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    assert(progress.status === 200 && progress.json.success, 'batch progress failed')
    if (progress.json.data.status === 'completed') return
    if (progress.json.data.status === 'failed') throw new Error('batch failed state')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('batch did not complete in expected time')
}

async function run(): Promise<void> {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'pixflow-desktop-smoke-secret-abcdefghijklmnopqrstuvwxyz'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP = 'true'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL = 'desktop-smoke-admin@pixflow.local'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD = 'DesktopSmokePassword123'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_NAME = 'Desktop Smoke Admin'
  process.env.PIXFLOW_MOCK_PROVIDERS = 'true'
  process.env.PIXFLOW_TELEMETRY_ENABLED = 'true'

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-desktop-smoke-'))
  const dataDir = path.join(tempRoot, 'data')
  const pngPath = path.join(tempRoot, 'reference.png')
  await fs.writeFile(pngPath, Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64'))

  const app = createApp({ projectRoot: process.cwd(), dataDir })
  const server = app.listen(0)
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  try {
    console.log(`[Smoke:Desktop] Base URL: ${baseUrl}`)

    const login = await requestJson<{ token: string }>(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL,
        password: process.env.PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD,
      }),
    })
    assert(login.status === 200 && login.json.success, 'desktop login failed')
    const token = login.json.data.token
    assert(typeof token === 'string' && token.length > 0, 'desktop token missing')

    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    console.log('[Smoke:Desktop] Journey 1/2: Login -> Generate(Batch) -> History')
    const products = await requestJson<{ products: unknown[] }>(baseUrl, '/api/products')
    assert(products.status === 200 && products.json.success, 'products fetch failed')

    const status = await requestJson(baseUrl, '/api/settings/status', { headers: authHeaders })
    assert(status.status === 200 && status.json.success, 'settings status failed')

    const blob = new Blob([await fs.readFile(pngPath)], { type: 'image/png' })
    const formData = new FormData()
    formData.append('referenceImages', blob, 'reference.png')
    formData.append('concept', 'desktop journey studio test')
    formData.append('prompts', JSON.stringify([{ style: 'clean studio portrait', pose: { framing: 'medium shot' } }]))
    formData.append('aspectRatio', '9:16')
    formData.append('numImagesPerPrompt', '1')
    formData.append('resolution', '2K')
    formData.append('outputFormat', 'png')

    const batchStart = await fetch(`${baseUrl}/api/generate/batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    const batchJson = (await batchStart.json()) as unknown
    assertEnvelope<{ jobId: string }>(batchJson, '/api/generate/batch')
    assert(batchStart.status === 200 && batchJson.success, 'desktop batch start failed')
    const jobId = batchJson.data.jobId
    assert(typeof jobId === 'string' && jobId.length > 0, 'desktop missing jobId')
    await waitForBatchCompletion(baseUrl, token, jobId)

    const historyCreate = await requestJson<{ entry: { id: string } }>(baseUrl, '/api/history', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        concept: 'desktop journey concept',
        prompts: [{ style: 'studio clean', pose: { framing: 'medium shot' } }],
        source: 'generated',
      }),
    })
    assert(historyCreate.status === 200 && historyCreate.json.success, 'history create failed')
    const historyId = historyCreate.json.data.entry.id
    assert(typeof historyId === 'string' && historyId.length > 0, 'history id missing')

    const historyList = await requestJson<{ history: Array<{ id: string }> }>(baseUrl, '/api/history', { headers: authHeaders })
    assert(historyList.status === 200 && historyList.json.success, 'history list failed')
    assert(historyList.json.data.history.some((entry) => entry.id === historyId), 'desktop history entry not found')

    console.log('[Smoke:Desktop] Journey 2/2: Avatar -> Script -> TTS -> Lipsync -> I2V')
    const avatar = await requestJson<{ localPath: string }>(baseUrl, '/api/avatars/generate', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ prompt: 'portrait of a smiling creator', aspectRatio: '9:16' }),
    })
    assert(avatar.status === 200 && avatar.json.success, 'avatar generate failed')
    const avatarPath = avatar.json.data.localPath
    assert(typeof avatarPath === 'string' && avatarPath.startsWith('/avatars/'), 'avatar path invalid')

    const script = await requestJson<{ script: string }>(baseUrl, '/api/avatars/script', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ concept: 'desktop avatar ad', duration: 15, tone: 'energetic' }),
    })
    assert(script.status === 200 && script.json.success, 'avatar script failed')
    assert(typeof script.json.data.script === 'string' && script.json.data.script.length > 0, 'script empty')

    const tts = await requestJson<{ audioUrl: string }>(baseUrl, '/api/avatars/tts', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: script.json.data.script, voiceId: 'Aria' }),
    })
    assert(tts.status === 200 && tts.json.success, 'avatar tts failed')
    const audioUrl = tts.json.data.audioUrl
    assert(typeof audioUrl === 'string' && audioUrl.startsWith('/outputs/'), 'audio url invalid')

    const lipsync = await requestJson<{ localPath: string }>(baseUrl, '/api/avatars/lipsync', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ imageUrl: avatarPath, audioUrl }),
    })
    assert(lipsync.status === 200 && lipsync.json.success, 'avatar lipsync failed')
    assert(typeof lipsync.json.data.localPath === 'string' && lipsync.json.data.localPath.startsWith('/outputs/'), 'lipsync path invalid')

    const i2v = await requestJson<{ localPath: string }>(baseUrl, '/api/avatars/i2v', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ imageUrl: avatarPath, prompt: 'subtle camera push-in', duration: '5' }),
    })
    assert(i2v.status === 200 && i2v.json.success, 'avatar i2v failed')
    assert(typeof i2v.json.data.localPath === 'string' && i2v.json.data.localPath.startsWith('/outputs/'), 'i2v path invalid')

    await requestJson(baseUrl, `/api/history/${historyId}`, { method: 'DELETE', headers: authHeaders })
    await requestJson(baseUrl, '/api/history', { method: 'DELETE', headers: authHeaders })

    console.log('[Smoke:Desktop] Desktop critical journeys passed')
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
  console.error('[Smoke:Desktop] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
