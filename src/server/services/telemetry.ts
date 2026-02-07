import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

type TelemetryStatus = 'start' | 'success' | 'error'

interface PipelineTelemetryEvent {
  id: string
  timestamp: string
  pipeline: string
  status: TelemetryStatus
  durationMs?: number
  userId?: number
  metadata?: Record<string, unknown>
  error?: string
}

const TELEMETRY_FILE_NAME = 'pipeline-events.jsonl'

function isTelemetryEnabled(): boolean {
  const raw = process.env.PIXFLOW_TELEMETRY_ENABLED
  if (!raw) return true
  const normalized = raw.trim().toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(normalized)
}

function getTelemetryDir(): string {
  const configured = process.env.PIXFLOW_TELEMETRY_DIR?.trim()
  if (configured) return configured
  return path.join(process.cwd(), 'logs')
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
}

export async function recordPipelineEvent(
  payload: Omit<PipelineTelemetryEvent, 'id' | 'timestamp'>
): Promise<void> {
  if (!isTelemetryEnabled()) return

  try {
    const event: PipelineTelemetryEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload,
    }
    const dir = getTelemetryDir()
    await fs.mkdir(dir, { recursive: true })
    await fs.appendFile(path.join(dir, TELEMETRY_FILE_NAME), `${JSON.stringify(event)}\n`, 'utf8')
  } catch (error) {
    console.error('[Telemetry] Failed to write pipeline event:', toErrorMessage(error))
  }
}

export function createPipelineSpan(input: {
  pipeline: string
  userId?: number
  metadata?: Record<string, unknown>
}) {
  const startedAt = Date.now()
  void recordPipelineEvent({
    pipeline: input.pipeline,
    status: 'start',
    userId: input.userId,
    metadata: input.metadata,
  })

  return {
    success(metadata?: Record<string, unknown>) {
      void recordPipelineEvent({
        pipeline: input.pipeline,
        status: 'success',
        userId: input.userId,
        durationMs: Date.now() - startedAt,
        metadata: {
          ...input.metadata,
          ...metadata,
        },
      })
    },
    error(error: unknown, metadata?: Record<string, unknown>) {
      void recordPipelineEvent({
        pipeline: input.pipeline,
        status: 'error',
        userId: input.userId,
        durationMs: Date.now() - startedAt,
        metadata: {
          ...input.metadata,
          ...metadata,
        },
        error: toErrorMessage(error),
      })
    },
  }
}
