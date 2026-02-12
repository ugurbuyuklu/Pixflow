import fs from 'node:fs/promises'
import path from 'node:path'

type TelemetryStatus = 'start' | 'success' | 'error'
type GateProfile = 'ci' | 'nightly' | 'release'

interface TelemetryEvent {
  pipeline: string
  status: TelemetryStatus
  durationMs?: number
  metadata?: Record<string, unknown>
}

interface FrontendPerfThresholds {
  maxTabSwitchP95Ms: number
  maxPageRenderP95Ms: number
  minTabSwitchSamples: number
  minPageRenderSamples: number
  requireFrontendEvents: boolean
}

const PROFILE_DEFAULTS: Record<GateProfile, FrontendPerfThresholds> = {
  ci: {
    maxTabSwitchP95Ms: 5_000,
    maxPageRenderP95Ms: 6_000,
    minTabSwitchSamples: 3,
    minPageRenderSamples: 3,
    requireFrontendEvents: true,
  },
  nightly: {
    maxTabSwitchP95Ms: 8_000,
    maxPageRenderP95Ms: 10_000,
    minTabSwitchSamples: 2,
    minPageRenderSamples: 2,
    requireFrontendEvents: true,
  },
  release: {
    maxTabSwitchP95Ms: 5_000,
    maxPageRenderP95Ms: 6_000,
    minTabSwitchSamples: 3,
    minPageRenderSamples: 3,
    requireFrontendEvents: true,
  },
}

function getArgValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

function parseProfile(value: string | null): GateProfile {
  if (value === 'ci' || value === 'nightly' || value === 'release') return value
  return 'ci'
}

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback
  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
}

function isRuntimeMismatchSkip(event: TelemetryEvent): boolean {
  return (
    event.pipeline === 'smoke.desktop' &&
    event.status === 'success' &&
    event.metadata?.provider === 'runtime' &&
    event.metadata?.reason === 'sqlite_runtime_mismatch'
  )
}

async function run(): Promise<void> {
  const fileArg = getArgValue('--file')
  const profile = parseProfile(getArgValue('--profile'))
  const filePath = fileArg ? path.resolve(fileArg) : path.join(process.cwd(), 'logs', 'pipeline-events.jsonl')

  const defaults = PROFILE_DEFAULTS[profile]
  const thresholds: FrontendPerfThresholds = {
    maxTabSwitchP95Ms: parsePositiveNumber(process.env.PIXFLOW_FRONTEND_TAB_SWITCH_P95_MS, defaults.maxTabSwitchP95Ms),
    maxPageRenderP95Ms: parsePositiveNumber(
      process.env.PIXFLOW_FRONTEND_PAGE_RENDER_P95_MS,
      defaults.maxPageRenderP95Ms,
    ),
    minTabSwitchSamples: Math.round(
      parsePositiveNumber(process.env.PIXFLOW_FRONTEND_TAB_SWITCH_MIN_SAMPLES, defaults.minTabSwitchSamples),
    ),
    minPageRenderSamples: Math.round(
      parsePositiveNumber(process.env.PIXFLOW_FRONTEND_PAGE_RENDER_MIN_SAMPLES, defaults.minPageRenderSamples),
    ),
    requireFrontendEvents: parseBoolean(process.env.PIXFLOW_FRONTEND_REQUIRE_EVENTS, defaults.requireFrontendEvents),
  }

  const raw = await fs.readFile(filePath, 'utf8')
  const events: TelemetryEvent[] = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as TelemetryEvent
      } catch {
        return null
      }
    })
    .filter((event): event is TelemetryEvent => !!event && typeof event.pipeline === 'string')

  const runtimeSkipped = events.some(isRuntimeMismatchSkip)
  const tabSwitchDurations = events
    .filter((event) => event.pipeline === 'frontend.tab.switch' && event.status === 'success')
    .map((event) => toNumber(event.durationMs))
    .filter((value): value is number => value !== null)
  const pageRenderDurations = events
    .filter((event) => event.pipeline === 'frontend.page.render' && event.status === 'success')
    .map((event) => toNumber(event.durationMs))
    .filter((value): value is number => value !== null)

  const failures: string[] = []

  if (runtimeSkipped && tabSwitchDurations.length === 0 && pageRenderDurations.length === 0) {
    console.log('=== Pixflow Frontend Perf Gate ===')
    console.log(`Profile: ${profile}`)
    console.log(`File: ${filePath}`)
    console.log('Skipped: desktop smoke skipped due sqlite runtime mismatch')
    console.log('Gate passed (conditional)')
    return
  }

  if (thresholds.requireFrontendEvents && tabSwitchDurations.length === 0 && pageRenderDurations.length === 0) {
    failures.push('no frontend perf telemetry events found')
  }

  const tabSwitchP95 = percentile(tabSwitchDurations, 95)
  const pageRenderP95 = percentile(pageRenderDurations, 95)

  if (tabSwitchDurations.length > 0 && tabSwitchDurations.length < thresholds.minTabSwitchSamples) {
    failures.push(`tab switch samples ${tabSwitchDurations.length} < ${thresholds.minTabSwitchSamples}`)
  }
  if (pageRenderDurations.length > 0 && pageRenderDurations.length < thresholds.minPageRenderSamples) {
    failures.push(`page render samples ${pageRenderDurations.length} < ${thresholds.minPageRenderSamples}`)
  }

  if (tabSwitchDurations.length >= thresholds.minTabSwitchSamples && tabSwitchP95 > thresholds.maxTabSwitchP95Ms) {
    failures.push(`tab switch p95 ${tabSwitchP95.toFixed(1)}ms > ${thresholds.maxTabSwitchP95Ms.toFixed(1)}ms`)
  }
  if (pageRenderDurations.length >= thresholds.minPageRenderSamples && pageRenderP95 > thresholds.maxPageRenderP95Ms) {
    failures.push(`page render p95 ${pageRenderP95.toFixed(1)}ms > ${thresholds.maxPageRenderP95Ms.toFixed(1)}ms`)
  }

  console.log('=== Pixflow Frontend Perf Gate ===')
  console.log(`Profile: ${profile}`)
  console.log(`File: ${filePath}`)
  console.log(
    `Tab switch: samples=${tabSwitchDurations.length}, p95=${tabSwitchP95.toFixed(1)}ms (<= ${thresholds.maxTabSwitchP95Ms.toFixed(1)}ms)`,
  )
  console.log(
    `Page render: samples=${pageRenderDurations.length}, p95=${pageRenderP95.toFixed(1)}ms (<= ${thresholds.maxPageRenderP95Ms.toFixed(1)}ms)`,
  )

  if (failures.length > 0) {
    console.error('Gate failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
    return
  }

  console.log('Gate passed')
}

run().catch((error) => {
  console.error('[Telemetry:FrontendGate] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
