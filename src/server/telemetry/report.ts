import fs from 'fs/promises'
import path from 'path'

type TelemetryStatus = 'start' | 'success' | 'error'

interface TelemetryEvent {
  id: string
  timestamp: string
  pipeline: string
  status: TelemetryStatus
  durationMs?: number
  userId?: number
  metadata?: Record<string, unknown>
  error?: string
}

interface ProviderStats {
  total: number
  success: number
  error: number
  recovered: number
  durations: number[]
  failures: Record<string, number>
}

interface PipelineStats {
  total: number
  success: number
  error: number
}

interface TelemetryReport {
  file: string
  totals: {
    events: number
    start: number
    success: number
    error: number
    attempts: number
  }
  window: {
    start: string
    end: string
  }
  overall: {
    successRate: number
    durationP50Ms: number
    durationP95Ms: number
  }
  pipelines: Record<string, { success: number; error: number; attempts: number; successRate: number }>
  providers: Record<string, {
    success: number
    error: number
    attempts: number
    successRate: number
    failRate: number
    retryRecoveryRate: number
    durationP50Ms: number
    durationP95Ms: number
    failureTypes: Record<string, number>
  }>
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
}

function percent(part: number, total: number): string {
  if (total === 0) return '0.00%'
  return `${((part / total) * 100).toFixed(2)}%`
}

function ratio(part: number, total: number): number {
  if (total === 0) return 0
  return part / total
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function getArgValue(name: string): string | null {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

function formatReportText(report: TelemetryReport): string {
  const lines: string[] = []
  lines.push('=== Pixflow Telemetry Report ===')
  lines.push(`File: ${report.file}`)
  lines.push(
    `Events: ${report.totals.events} (start=${report.totals.start}, success=${report.totals.success}, error=${report.totals.error})`
  )
  lines.push(`Window: ${report.window.start} -> ${report.window.end}`)
  lines.push('')
  lines.push('Overall:')
  lines.push(
    `- Success rate: ${percent(report.totals.success, report.totals.attempts)} (${report.totals.success}/${report.totals.attempts})`
  )
  lines.push(`- Duration p50: ${report.overall.durationP50Ms.toFixed(1)}ms`)
  lines.push(`- Duration p95: ${report.overall.durationP95Ms.toFixed(1)}ms`)
  lines.push('')
  lines.push('By Pipeline:')
  for (const pipeline of Object.keys(report.pipelines).sort()) {
    const row = report.pipelines[pipeline]
    lines.push(
      `- ${pipeline}: success=${row.success}, error=${row.error}, successRate=${percent(row.success, row.attempts)} (${row.attempts} attempts)`
    )
  }
  lines.push('')
  lines.push('By Provider:')
  for (const provider of Object.keys(report.providers).sort()) {
    const stats = report.providers[provider]
    const failBreakdown = Object.entries(stats.failureTypes)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${type}:${count}`)
      .join(', ') || '-'
    lines.push(`- ${provider}:`)
    lines.push(`  successRate=${percent(stats.success, stats.attempts)} (${stats.success}/${stats.attempts})`)
    lines.push(`  failRate=${percent(stats.error, stats.attempts)} (${stats.error}/${stats.attempts})`)
    lines.push(`  retryRecoveryRate=${percent(stats.retryRecoveryRate * stats.success, stats.success)} (${Math.round(stats.retryRecoveryRate * stats.success)}/${stats.success})`)
    lines.push(`  p50=${stats.durationP50Ms.toFixed(1)}ms, p95=${stats.durationP95Ms.toFixed(1)}ms`)
    lines.push(`  failureTypes=${failBreakdown}`)
  }
  return lines.join('\n')
}

async function run(): Promise<void> {
  const fileArg = getArgValue('--file')
  const outArg = getArgValue('--out')
  const jsonMode = process.argv.includes('--json')
  const defaultPath = path.join(process.cwd(), 'logs', 'pipeline-events.jsonl')
  const filePath = fileArg ? path.resolve(fileArg) : defaultPath

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
    .filter((e): e is TelemetryEvent => !!e && typeof e.pipeline === 'string' && typeof e.status === 'string')

  const successEvents = events.filter((e) => e.status === 'success')
  const errorEvents = events.filter((e) => e.status === 'error')
  const startEvents = events.filter((e) => e.status === 'start')
  const successDurations = successEvents.map((e) => toNumber(e.durationMs)).filter((v): v is number => v !== null)

  const providerStats = new Map<string, ProviderStats>()
  for (const event of events) {
    const provider = toStringValue(event.metadata?.provider)
    if (!provider) continue

    let stats = providerStats.get(provider)
    if (!stats) {
      stats = { total: 0, success: 0, error: 0, recovered: 0, durations: [], failures: {} }
      providerStats.set(provider, stats)
    }

    stats.total++
    if (event.status === 'success') {
      stats.success++
      if (event.metadata?.recovered === true) stats.recovered++
      const d = toNumber(event.durationMs)
      if (d !== null) stats.durations.push(d)
    } else if (event.status === 'error') {
      stats.error++
      const failureType = toStringValue(event.metadata?.failureType) || 'unknown'
      stats.failures[failureType] = (stats.failures[failureType] || 0) + 1
    }
  }

  const byPipeline = new Map<string, PipelineStats>()
  for (const event of events) {
    let row = byPipeline.get(event.pipeline)
    if (!row) {
      row = { total: 0, success: 0, error: 0 }
      byPipeline.set(event.pipeline, row)
    }
    row.total++
    if (event.status === 'success') row.success++
    if (event.status === 'error') row.error++
  }

  const attempts = successEvents.length + errorEvents.length
  const pipelines: TelemetryReport['pipelines'] = {}
  for (const [name, row] of byPipeline.entries()) {
    const pipelineAttempts = row.success + row.error
    pipelines[name] = {
      success: row.success,
      error: row.error,
      attempts: pipelineAttempts,
      successRate: ratio(row.success, pipelineAttempts),
    }
  }

  const providers: TelemetryReport['providers'] = {}
  for (const [name, stats] of providerStats.entries()) {
    const providerAttempts = stats.success + stats.error
    providers[name] = {
      success: stats.success,
      error: stats.error,
      attempts: providerAttempts,
      successRate: ratio(stats.success, providerAttempts),
      failRate: ratio(stats.error, providerAttempts),
      retryRecoveryRate: ratio(stats.recovered, stats.success),
      durationP50Ms: percentile(stats.durations, 50),
      durationP95Ms: percentile(stats.durations, 95),
      failureTypes: stats.failures,
    }
  }

  const report: TelemetryReport = {
    file: filePath,
    totals: {
      events: events.length,
      start: startEvents.length,
      success: successEvents.length,
      error: errorEvents.length,
      attempts,
    },
    window: {
      start: events[0]?.timestamp || '-',
      end: events[events.length - 1]?.timestamp || '-',
    },
    overall: {
      successRate: ratio(successEvents.length, attempts),
      durationP50Ms: percentile(successDurations, 50),
      durationP95Ms: percentile(successDurations, 95),
    },
    pipelines,
    providers,
  }

  if (jsonMode) {
    const json = JSON.stringify(report, null, 2)
    if (outArg) await fs.writeFile(path.resolve(outArg), `${json}\n`, 'utf8')
    else console.log(json)
    return
  }

  const text = formatReportText(report)
  if (outArg) await fs.writeFile(path.resolve(outArg), `${text}\n`, 'utf8')
  else console.log(text)
}

run().catch((error) => {
  console.error('[Telemetry:Report] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
