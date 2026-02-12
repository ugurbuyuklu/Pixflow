import fs from 'node:fs/promises'
import path from 'node:path'

type TelemetryStatus = 'start' | 'success' | 'error'

interface TelemetryEvent {
  timestamp: string
  pipeline?: string
  status: TelemetryStatus
  durationMs?: number
  metadata?: Record<string, unknown>
}

interface PipelineWindowMetrics {
  attempts: number
  successRate: number
  failRate: number
  p95Ms: number
}

interface TrendWindowSummary {
  windowEvents: number
  overallSuccessRate: number
  overallP95Ms: number
  providerFailRate: Record<string, number>
  pipelineMetrics: Record<string, PipelineWindowMetrics>
}

interface TrendSnapshot {
  generatedAt: string
  sourceFile: string
  windowSize: number
  current: TrendWindowSummary
  previous: TrendWindowSummary
  delta: {
    successRate: number
    p95Ms: number
    providerFailRate: Record<string, number>
    pipelineSuccessRate: Record<string, number>
    pipelineP95Ms: Record<string, number>
    pipelineFailRate: Record<string, number>
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

function summarizeWindow(events: TelemetryEvent[]): TrendWindowSummary {
  const successEvents = events.filter((e) => e.status === 'success')
  const errorEvents = events.filter((e) => e.status === 'error')
  const attempts = successEvents.length + errorEvents.length
  const durations = successEvents.map((e) => toNumber(e.durationMs)).filter((v): v is number => v !== null)

  const providerCounters = new Map<string, { success: number; error: number }>()
  const pipelineCounters = new Map<string, { success: number; error: number; durations: number[] }>()
  for (const event of events) {
    const pipeline = toStringValue(event.pipeline)
    if (pipeline) {
      let pipelineRow = pipelineCounters.get(pipeline)
      if (!pipelineRow) {
        pipelineRow = { success: 0, error: 0, durations: [] }
        pipelineCounters.set(pipeline, pipelineRow)
      }
      if (event.status === 'success') {
        pipelineRow.success++
        const duration = toNumber(event.durationMs)
        if (duration !== null) pipelineRow.durations.push(duration)
      }
      if (event.status === 'error') pipelineRow.error++
    }

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

  const pipelineMetrics: Record<string, PipelineWindowMetrics> = {}
  for (const [pipeline, row] of pipelineCounters.entries()) {
    const pipelineAttempts = row.success + row.error
    pipelineMetrics[pipeline] = {
      attempts: pipelineAttempts,
      successRate: ratio(row.success, pipelineAttempts),
      failRate: ratio(row.error, pipelineAttempts),
      p95Ms: percentile(row.durations, 95),
    }
  }

  return {
    windowEvents: events.length,
    overallSuccessRate: ratio(successEvents.length, attempts),
    overallP95Ms: percentile(durations, 95),
    providerFailRate,
    pipelineMetrics,
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
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
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
    providerFailRateDelta[provider] =
      (current.providerFailRate[provider] || 0) - (previous.providerFailRate[provider] || 0)
  }

  const pipelines = new Set<string>([...Object.keys(current.pipelineMetrics), ...Object.keys(previous.pipelineMetrics)])
  const pipelineSuccessRateDelta: Record<string, number> = {}
  const pipelineP95MsDelta: Record<string, number> = {}
  const pipelineFailRateDelta: Record<string, number> = {}
  for (const pipeline of pipelines) {
    const currentRow = current.pipelineMetrics[pipeline]
    const previousRow = previous.pipelineMetrics[pipeline]
    pipelineSuccessRateDelta[pipeline] = (currentRow?.successRate || 0) - (previousRow?.successRate || 0)
    pipelineP95MsDelta[pipeline] = (currentRow?.p95Ms || 0) - (previousRow?.p95Ms || 0)
    pipelineFailRateDelta[pipeline] = (currentRow?.failRate || 0) - (previousRow?.failRate || 0)
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
      pipelineSuccessRate: pipelineSuccessRateDelta,
      pipelineP95Ms: pipelineP95MsDelta,
      pipelineFailRate: pipelineFailRateDelta,
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
