import { randomUUID } from 'crypto'
import { recordPipelineEvent } from './telemetry.js'

interface RetryOptions {
  pipeline: string
  provider: 'openai' | 'fal' | 'hedra' | 'kling'
  userId?: number
  retries?: number
  baseDelayMs?: number
  metadata?: Record<string, unknown>
}

const MOCK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0yQAAAAASUVORK5CYII='

export function isMockProvidersEnabled(): boolean {
  const raw = process.env.PIXFLOW_MOCK_PROVIDERS
  if (!raw) return false
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

export function makeMockDataUrl(mimeType: string, content: string): string {
  const b64 = Buffer.from(content, 'utf8').toString('base64')
  return `data:${mimeType};base64,${b64}`
}

export function makeMockPngDataUrl(): string {
  return `data:image/png;base64,${MOCK_PNG_BASE64}`
}

export function makeMockId(prefix: string): string {
  return `mock-${prefix}-${randomUUID()}`
}

export function classifyProviderFailure(error: unknown): 'timeout' | 'rate_limit' | 'network' | 'provider' {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('timeout') || message.includes('timed out') || message.includes('abort')) return 'timeout'
  if (message.includes('429') || message.includes('rate limit')) return 'rate_limit'
  if (message.includes('fetch') || message.includes('network') || message.includes('econn')) return 'network'
  return 'provider'
}

export async function runWithRetries<T>(work: () => Promise<T>, options: RetryOptions): Promise<T> {
  const retries = Math.max(0, options.retries ?? 2)
  const baseDelayMs = Math.max(100, options.baseDelayMs ?? 400)

  let lastError: unknown
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const result = await work()
      await recordPipelineEvent({
        pipeline: options.pipeline,
        status: 'success',
        userId: options.userId,
        metadata: {
          provider: options.provider,
          attempt,
          retries,
          recovered: attempt > 1,
          ...options.metadata,
        },
      })
      return result
    } catch (error) {
      lastError = error
      const failureType = classifyProviderFailure(error)
      await recordPipelineEvent({
        pipeline: options.pipeline,
        status: 'error',
        userId: options.userId,
        metadata: {
          provider: options.provider,
          attempt,
          retries,
          failureType,
          ...options.metadata,
        },
        error: error instanceof Error ? error.message : String(error),
      })

      if (attempt > retries) break
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function recordMockProviderSuccess(input: {
  pipeline: string
  provider: 'openai' | 'fal' | 'hedra' | 'kling'
  userId?: number
  metadata?: Record<string, unknown>
}): Promise<void> {
  await recordPipelineEvent({
    pipeline: input.pipeline,
    status: 'success',
    userId: input.userId,
    metadata: {
      provider: input.provider,
      mock: true,
      attempt: 1,
      retries: 0,
      recovered: false,
      ...input.metadata,
    },
  })
}
