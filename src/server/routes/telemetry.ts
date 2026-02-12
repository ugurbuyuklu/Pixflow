import express from 'express'
import type { AuthRequest } from '../middleware/auth.js'
import { recordPipelineEvent } from '../services/telemetry.js'
import { sendError, sendSuccess } from '../utils/http.js'

type FrontendPerfMetric = 'tab_switch' | 'page_render'

const METRIC_TO_PIPELINE: Record<FrontendPerfMetric, string> = {
  tab_switch: 'frontend.tab.switch',
  page_render: 'frontend.page.render',
}

function parseMetric(value: unknown): FrontendPerfMetric | null {
  if (value === 'tab_switch' || value === 'page_render') return value
  return null
}

function parseDurationMs(value: unknown): number | null {
  let n: number
  if (typeof value === 'number') {
    n = value
  } else if (typeof value === 'string' && value.trim().length > 0) {
    n = Number(value.trim())
  } else {
    return null
  }
  if (!Number.isFinite(n) || n < 0 || n > 120_000) return null
  return Math.round(n)
}

function parseSafeLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  const sanitized = trimmed.replace(/[^a-z0-9._:-]/gi, '_').slice(0, 64)
  return sanitized || fallback
}

export function createTelemetryRouter(): express.Router {
  const router = express.Router()

  router.post('/client/perf', async (req: AuthRequest, res) => {
    const metric = parseMetric(req.body?.metric)
    if (!metric) {
      sendError(res, 400, 'Invalid metric', 'VALIDATION_ERROR', 'metric must be tab_switch or page_render')
      return
    }

    const durationMs = parseDurationMs(req.body?.durationMs)
    if (durationMs === null) {
      sendError(
        res,
        400,
        'Invalid durationMs',
        'VALIDATION_ERROR',
        'durationMs must be a finite number between 0 and 120000',
      )
      return
    }

    const tab = parseSafeLabel(req.body?.tab, 'unknown')
    const source = parseSafeLabel(req.body?.source, 'renderer')
    const fromTab = parseSafeLabel(req.body?.fromTab, 'unknown')

    await recordPipelineEvent({
      pipeline: METRIC_TO_PIPELINE[metric],
      status: 'success',
      durationMs,
      userId: req.user?.id,
      metadata: {
        provider: 'frontend',
        source,
        metric,
        tab,
        fromTab,
      },
    })

    sendSuccess(res, { accepted: true }, 202)
  })

  return router
}
