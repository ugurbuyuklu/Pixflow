import fs from 'fs/promises'
import path from 'path'

type TelemetryStatus = 'start' | 'success' | 'error'
type GateProfile = 'ci' | 'nightly' | 'release'

interface TelemetryEvent {
  pipeline: string
  status: TelemetryStatus
  durationMs?: number
  metadata?: Record<string, unknown>
}

interface ProfileThresholds {
  minOverallSuccessRate: number
  minProviderSuccessRate: number
  maxP95Ms: number
  requireProviderEvents: boolean
}

const PROFILE_DEFAULTS: Record<GateProfile, ProfileThresholds> = {
  ci: {
    minOverallSuccessRate: 1,
    minProviderSuccessRate: 1,
    maxP95Ms: 300000,
    requireProviderEvents: true,
  },
  nightly: {
    minOverallSuccessRate: 0.9,
    minProviderSuccessRate: 0.8,
    maxP95Ms: 600000,
    requireProviderEvents: true,
  },
  release: {
    minOverallSuccessRate: 1,
    minProviderSuccessRate: 1,
    maxP95Ms: 300000,
    requireProviderEvents: true,
  },
}

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return numerator / denominator
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
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

async function run(): Promise<void> {
  const fileArg = getArgValue('--file')
  const profile = parseProfile(getArgValue('--profile'))
  const filePath = fileArg ? path.resolve(fileArg) : path.join(process.cwd(), 'logs', 'pipeline-events.jsonl')

  const defaults = PROFILE_DEFAULTS[profile]
  const minOverallSuccessRate = parsePositiveNumber(process.env.PIXFLOW_GATE_MIN_OVERALL_SUCCESS_RATE, defaults.minOverallSuccessRate)
  const minProviderSuccessRate = parsePositiveNumber(process.env.PIXFLOW_GATE_MIN_PROVIDER_SUCCESS_RATE, defaults.minProviderSuccessRate)
  const maxP95Ms = parsePositiveNumber(process.env.PIXFLOW_GATE_MAX_P95_MS, defaults.maxP95Ms)
  const requireProviderEvents = (process.env.PIXFLOW_GATE_REQUIRE_PROVIDER_EVENTS || String(defaults.requireProviderEvents)).toLowerCase() !== 'false'

  const raw = await fs.readFile(filePath, 'utf8')
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean)
  const events: TelemetryEvent[] = lines
    .map((line) => {
      try {
        return JSON.parse(line) as TelemetryEvent
      } catch {
        return null
      }
    })
    .filter((event): event is TelemetryEvent => !!event && typeof event.status === 'string')

  const successEvents = events.filter((e) => e.status === 'success')
  const errorEvents = events.filter((e) => e.status === 'error')
  const attempts = successEvents.length + errorEvents.length
  if (attempts === 0) {
    throw new Error('no success/error telemetry events found')
  }

  const successDurations = successEvents.map((e) => toNumber(e.durationMs)).filter((v): v is number => v !== null)
  const overallSuccessRate = ratio(successEvents.length, attempts)
  const p95Ms = percentile(successDurations, 95)

  const providerCounters = new Map<string, { success: number; error: number }>()
  for (const event of events) {
    const provider = toStringValue(event.metadata?.provider)
    if (!provider) continue
    let counter = providerCounters.get(provider)
    if (!counter) {
      counter = { success: 0, error: 0 }
      providerCounters.set(provider, counter)
    }
    if (event.status === 'success') counter.success++
    if (event.status === 'error') counter.error++
  }

  const failures: string[] = []
  if (overallSuccessRate < minOverallSuccessRate) {
    failures.push(`overall success rate ${overallSuccessRate.toFixed(4)} < ${minOverallSuccessRate.toFixed(4)}`)
  }
  if (p95Ms > maxP95Ms) {
    failures.push(`p95 duration ${p95Ms.toFixed(1)}ms > ${maxP95Ms.toFixed(1)}ms`)
  }

  if (requireProviderEvents && providerCounters.size === 0) {
    failures.push('no provider metadata events found')
  }

  for (const [provider, counter] of providerCounters) {
    const providerAttempts = counter.success + counter.error
    if (providerAttempts === 0) continue
    const providerRate = ratio(counter.success, providerAttempts)
    if (providerRate < minProviderSuccessRate) {
      failures.push(`provider ${provider} success rate ${providerRate.toFixed(4)} < ${minProviderSuccessRate.toFixed(4)}`)
    }
  }

  console.log('=== Pixflow Telemetry Gate ===')
  console.log(`Profile: ${profile}`)
  console.log(`File: ${filePath}`)
  console.log(`Overall success rate: ${overallSuccessRate.toFixed(4)} (threshold >= ${minOverallSuccessRate.toFixed(4)})`)
  console.log(`Overall p95 duration: ${p95Ms.toFixed(1)}ms (threshold <= ${maxP95Ms.toFixed(1)}ms)`)
  console.log(`Providers seen: ${providerCounters.size}`)

  if (failures.length > 0) {
    console.error('Gate failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
    return
  }

  console.log('Gate passed')
}

run().catch((error) => {
  console.error('[Telemetry:Gate] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
