import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import { createApp } from '../createApp.js'
import { stopJobCleanup } from '../services/fal.js'
import { recordPipelineEvent } from '../services/telemetry.js'

interface ApiEnvelope<T = Record<string, unknown>> {
  success: boolean
  data: T
  error?: string
  code?: string
}

const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0yQAAAAASUVORK5CYII='

const ESTIMATED_COST_USD = {
  avatarGenerate: 0.03,
  scriptGenerate: 0.02,
  tts: 0.01,
  lipsync: 0.08,
  i2v: 0.12,
  batchSingle: 0.03,
} as const

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

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value
}

async function run(): Promise<void> {
  const runReal = process.argv.includes('--real')
  const startedAt = Date.now()
  const maxRuntimeMs = parsePositiveNumber(process.env.PIXFLOW_SMOKE_REAL_MAX_RUNTIME_MS, 20 * 60 * 1000)
  const maxBudgetUsd = parsePositiveNumber(process.env.PIXFLOW_SMOKE_REAL_MAX_BUDGET_USD, 0.5)
  let estimatedCostUsd = 0

  const checkRuntimeGuardrail = async (phase: string) => {
    if (!runReal) return
    const elapsedMs = Date.now() - startedAt
    if (elapsedMs <= maxRuntimeMs) return
    await recordPipelineEvent({
      pipeline: 'smoke.external.guardrail',
      status: 'error',
      metadata: {
        mode: 'real',
        reason: 'timeout_exceeded',
        phase,
        elapsedMs,
        maxRuntimeMs,
        estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
      },
      error: 'External smoke runtime limit exceeded',
    })
    throw new Error(`real smoke runtime exceeded (${elapsedMs}ms > ${maxRuntimeMs}ms)`)
  }

  const spend = async (amount: number, phase: string) => {
    if (!runReal) return
    estimatedCostUsd += amount
    await checkRuntimeGuardrail(phase)
    if (estimatedCostUsd <= maxBudgetUsd) return

    await recordPipelineEvent({
      pipeline: 'smoke.external.guardrail',
      status: 'error',
      metadata: {
        mode: 'real',
        reason: 'budget_exceeded',
        phase,
        maxBudgetUsd,
        estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
      },
      error: 'External smoke budget limit exceeded',
    })
    throw new Error(`real smoke budget exceeded ($${estimatedCostUsd.toFixed(4)} > $${maxBudgetUsd.toFixed(4)})`)
  }

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'pixflow-external-smoke-secret-abcdefghijklmnopqrstuvwxyz'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP = 'true'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL = 'external-smoke-admin@pixflow.local'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD = 'ExternalSmokePassword123'
  process.env.PIXFLOW_BOOTSTRAP_ADMIN_NAME = 'External Smoke Admin'
  process.env.PIXFLOW_MOCK_PROVIDERS = runReal ? 'false' : 'true'
  process.env.PIXFLOW_TELEMETRY_ENABLED = 'true'

  if (runReal) {
    const required = ['OPENAI_API_KEY', 'FAL_API_KEY', 'HEDRA_API_KEY']
    const missing = required.filter((key) => !process.env[key] || String(process.env[key]).trim().length === 0)
    if (missing.length > 0) {
      throw new Error(`real smoke mode requires env vars: ${missing.join(', ')}`)
    }
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pixflow-external-smoke-'))
  const dataDir = path.join(tempRoot, 'data')

  const app = createApp({ projectRoot: process.cwd(), dataDir })
  const server = app.listen(0)
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  try {
    console.log(`[Smoke:External] Base URL: ${baseUrl}`)
    console.log(`[Smoke:External] Mode: ${runReal ? 'real providers' : 'mock providers'}`)

    const login = await requestJson<{ token: string }>(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL,
        password: process.env.PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD,
      }),
    })
    assert(login.status === 200 && login.json.success, 'login failed')
    const token = login.json.data.token
    assert(typeof token === 'string' && token.length > 0, 'missing token')

    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    const avatar = await requestJson<{ localPath: string }>(baseUrl, '/api/avatars/generate', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ prompt: 'portrait of a smiling creator', aspectRatio: '9:16' }),
    })
    assert(avatar.status === 200 && avatar.json.success, 'avatar generate failed')
    await spend(ESTIMATED_COST_USD.avatarGenerate, 'avatars.generate')
    const avatarPath = avatar.json.data.localPath
    assert(typeof avatarPath === 'string' && avatarPath.startsWith('/avatars/'), 'avatar localPath invalid')

    const script = await requestJson<{ script: string }>(baseUrl, '/api/avatars/script', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ concept: 'ad for ai photo app', duration: 15, tone: 'energetic' }),
    })
    assert(script.status === 200 && script.json.success, 'script generate failed')
    await spend(ESTIMATED_COST_USD.scriptGenerate, 'avatars.script')
    const scriptText = script.json.data.script
    assert(typeof scriptText === 'string' && scriptText.length > 0, 'script empty')

    const tts = await requestJson<{ audioUrl: string }>(baseUrl, '/api/avatars/tts', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ text: scriptText, voiceId: 'Aria' }),
    })
    assert(tts.status === 200 && tts.json.success, 'tts failed')
    await spend(ESTIMATED_COST_USD.tts, 'avatars.tts')
    const audioUrl = tts.json.data.audioUrl
    assert(typeof audioUrl === 'string' && audioUrl.startsWith('/outputs/'), 'audioUrl invalid')

    const lipsync = await requestJson<{ localPath: string }>(baseUrl, '/api/avatars/lipsync', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ imageUrl: avatarPath, audioUrl }),
    })
    assert(lipsync.status === 200 && lipsync.json.success, 'lipsync failed')
    await spend(ESTIMATED_COST_USD.lipsync, 'avatars.lipsync')
    assert(typeof lipsync.json.data.localPath === 'string' && lipsync.json.data.localPath.startsWith('/outputs/'), 'lipsync path invalid')

    const i2v = await requestJson<{ localPath: string }>(baseUrl, '/api/avatars/i2v', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ imageUrl: avatarPath, prompt: 'subtle camera push-in', duration: '5' }),
    })
    assert(i2v.status === 200 && i2v.json.success, 'i2v failed')
    await spend(ESTIMATED_COST_USD.i2v, 'avatars.i2v')
    assert(typeof i2v.json.data.localPath === 'string' && i2v.json.data.localPath.startsWith('/outputs/'), 'i2v path invalid')

    const pngPath = path.join(tempRoot, 'reference.png')
    await fs.writeFile(pngPath, Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64'))
    const blob = new Blob([await fs.readFile(pngPath)], { type: 'image/png' })
    const formData = new FormData()
    formData.append('referenceImages', blob, 'reference.png')
    formData.append('concept', 'external smoke batch')
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
    assert(batchStart.status === 200 && batchJson.success, 'batch start failed')
    await spend(ESTIMATED_COST_USD.batchSingle, 'generate.batch')
    const jobId = batchJson.data.jobId
    assert(typeof jobId === 'string' && jobId.length > 0, 'missing job id')

    const maxPollAttempts = runReal ? 120 : 10
    const pollDelayMs = runReal ? 2000 : 250
    let finished = false
    for (let i = 0; i < maxPollAttempts; i++) {
      const progress = await requestJson<{ status: string; completedImages: number; totalImages: number }>(
        baseUrl,
        `/api/generate/progress/${jobId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      assert(progress.status === 200 && progress.json.success, 'progress fetch failed')
      if (progress.json.data.status === 'completed') {
        finished = true
        break
      }
      if (progress.json.data.status === 'failed') {
        throw new Error('batch progress ended in failed state')
      }
      await checkRuntimeGuardrail('generate.progress.poll')
      await new Promise((resolve) => setTimeout(resolve, pollDelayMs))
    }
    assert(finished, 'batch did not complete in expected time')

    const telemetryPath = path.join(process.cwd(), 'logs', 'pipeline-events.jsonl')
    const telemetry = await fs.readFile(telemetryPath, 'utf8')
    assert(telemetry.includes('"provider"'), 'telemetry did not include provider metadata')
    await recordPipelineEvent({
      pipeline: 'smoke.external.guardrail',
      status: 'success',
      metadata: {
        mode: runReal ? 'real' : 'mock',
        maxBudgetUsd,
        estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
        maxRuntimeMs,
        elapsedMs: Date.now() - startedAt,
      },
    })

    console.log(`[Smoke:External] External-integrated pipeline passed (${runReal ? 'real providers' : 'mock providers'})`)
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
  console.error('[Smoke:External] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
