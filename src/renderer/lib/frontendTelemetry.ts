import { apiUrl, authFetch } from './api'

export type FrontendPerfMetric = 'tab_switch' | 'page_render'

interface FrontendPerfPayload {
  metric: FrontendPerfMetric
  tab: string
  durationMs: number
  fromTab?: string
  source?: string
}

function isFrontendTelemetryEnabled(): boolean {
  const raw = import.meta.env.VITE_PIXFLOW_FRONTEND_TELEMETRY_ENABLED
  if (raw === undefined) return true
  const normalized = String(raw).trim().toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(normalized)
}

function toRoundedDurationMs(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const rounded = Math.max(0, Math.round(value))
  if (rounded > 120_000) return null
  return rounded
}

export async function reportFrontendPerf(payload: FrontendPerfPayload): Promise<void> {
  if (!isFrontendTelemetryEnabled()) return

  const durationMs = toRoundedDurationMs(payload.durationMs)
  if (durationMs === null) return

  try {
    await authFetch(apiUrl('/api/telemetry/client/perf'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metric: payload.metric,
        tab: payload.tab,
        durationMs,
        fromTab: payload.fromTab,
        source: payload.source || 'renderer',
      }),
    })
  } catch (error) {
    console.warn('[FrontendTelemetry] Failed to report perf event', error)
  }
}
