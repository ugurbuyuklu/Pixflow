import fs from 'fs/promises'
import path from 'path'

type TelemetryStatus = 'start' | 'success' | 'error'

interface TelemetryEvent {
  timestamp: string
  status: TelemetryStatus
  durationMs?: number
  metadata?: Record<string, unknown>
}

interface TrendSnapshot {
  generatedAt: string
  sourceFile: string
  windowSize: number
  current: {
    windowEvents: number
    overallSuccessRate: number
    overallP95Ms: number
    providerFailRate: Record<string, number>
  }
  previous: {
    windowEvents: number
    overallSuccessRate: number
    overallP95Ms: number
    providerFailRate: Record<string, number>
  }
  delta: {
    successRate: number
    p95Ms: number
    providerFailRate: Record<string, number>
  }
}

function getArgValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

function parsePositiveInt(raw: string | null | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) return fallback
  return n
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

function ratio(part: number, total: number): number {
  if (total <= 0) return 0
  return part / total
}

function summarizeWindow(events: TelemetryEvent[]): {
  windowEvents: number
  overallSuccessRate: number
  overallP95Ms: number
  providerFailRate: Record<string, number>
} {
  const successEvents = events.filter((e) => e.status === 'success')
  const errorEvents = events.filter((e) => e.status === 'error')
  const attempts = successEvents.length + errorEvents.length
  const durations = successEvents.map((e) => toNumber(e.durationMs)).filter((v): v is number => v !== null)

  const providerCounters = new Map<string, { success: number; error: number }>()
  for (const event of events) {
    const provider = toStringValue(event.metadata?.provider)
    if (!provider) continue
    let row = providerCounters.get(provider)
    if (!row) {
      row = { success: 0, error: 0 }
      providerCounters.set(provider, row)
    }
    if (event.status === 'success') row.success++
    if (event.status === 'error') row.error++
  }

  const providerFailRate: Record<string, number> = {}
  for (const [provider, row] of providerCounters.entries()) {
    const providerAttempts = row.success + row.error
    providerFailRate[provider] = providerAttempts > 0 ? ratio(row.error, providerAttempts) : 0
  }

  return {
    windowEvents: events.length,
    overallSuccessRate: ratio(successEvents.length, attempts),
    overallP95Ms: percentile(durations, 95),
    providerFailRate,
  }
}

async function run(): Promise<void> {
  const fileArg = getArgValue('--file')
  const outArg = getArgValue('--out')
  const windowArg = getArgValue('--window')
  const windowSize = parsePositiveInt(windowArg, 300)
  const sourceFile = fileArg ? path.resolve(fileArg) : path.join(process.cwd(), 'logs', 'pipeline-events.jsonl')
  const outFile = outArg ? path.resolve(outArg) : path.join(process.cwd(), 'logs', 'telemetry-trends.json')

  const raw = await fs.readFile(sourceFile, 'utf8')
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean)
  const parsed: TelemetryEvent[] = lines
    .map((line) => {
      try {
        return JSON.parse(line) as TelemetryEvent
      } catch {
        return null
      }
    })
    .filter((event): event is TelemetryEvent => !!event && typeof event.status === 'string')

  const currentEvents = parsed.slice(-windowSize)
  const previousEvents = parsed.slice(-(windowSize * 2), -windowSize)
  const current = summarizeWindow(currentEvents)
  const previous = summarizeWindow(previousEvents)

  const providers = new Set<string>([
    ...Object.keys(current.providerFailRate),
    ...Object.keys(previous.providerFailRate),
  ])
  const providerFailRateDelta: Record<string, number> = {}
  for (const provider of providers) {
    providerFailRateDelta[provider] = (current.providerFailRate[provider] || 0) - (previous.providerFailRate[provider] || 0)
  }

  const snapshot: TrendSnapshot = {
    generatedAt: new Date().toISOString(),
    sourceFile,
    windowSize,
    current,
    previous,
    delta: {
      successRate: current.overallSuccessRate - previous.overallSuccessRate,
      p95Ms: current.overallP95Ms - previous.overallP95Ms,
      providerFailRate: providerFailRateDelta,
    },
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  console.log(`[Telemetry:Trends] Wrote ${outFile}`)
}

run().catch((error) => {
  console.error('[Telemetry:Trends] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
