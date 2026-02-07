import fs from 'fs/promises'
import path from 'path'

type Mode = 'warn' | 'block'

interface TrendWindow {
  windowEvents: number
  overallSuccessRate: number
  overallP95Ms: number
  providerFailRate: Record<string, number>
}

interface TrendSnapshot {
  generatedAt: string
  sourceFile: string
  windowSize: number
  current: TrendWindow
  previous: TrendWindow
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

function parseMode(raw: string | null): Mode {
  return raw === 'warn' ? 'warn' : 'block'
}

function parseNonNegative(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

function parseProviderThresholdMap(raw: string | undefined): Record<string, number> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, number> = {}
    for (const [provider, value] of Object.entries(parsed)) {
      if (typeof provider !== 'string' || provider.length === 0) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue
      out[provider] = value
    }
    return out
  } catch {
    return {}
  }
}

async function run(): Promise<void> {
  const fileArg = getArgValue('--file')
  const mode = parseMode(getArgValue('--mode'))
  const filePath = fileArg ? path.resolve(fileArg) : path.join(process.cwd(), 'logs', 'telemetry-trends.json')

  const maxSuccessDrop = parseNonNegative(process.env.PIXFLOW_REGRESSION_MAX_SUCCESS_DROP, 0.01)
  const maxP95IncreaseMs = parseNonNegative(process.env.PIXFLOW_REGRESSION_MAX_P95_INCREASE_MS, 5000)
  const maxProviderFailRateIncrease = parseNonNegative(process.env.PIXFLOW_REGRESSION_MAX_PROVIDER_FAILRATE_INCREASE, 0.05)
  const providerThresholds = parseProviderThresholdMap(process.env.PIXFLOW_REGRESSION_PROVIDER_THRESHOLDS_JSON)

  const raw = await fs.readFile(filePath, 'utf8')
  const snapshot = JSON.parse(raw) as TrendSnapshot
  const previousEvents = Number(snapshot.previous?.windowEvents || 0)

  console.log('=== Pixflow Regression Gate ===')
  console.log(`Mode: ${mode}`)
  console.log(`File: ${filePath}`)
  console.log(`Current events: ${snapshot.current?.windowEvents ?? 0}`)
  console.log(`Previous events: ${previousEvents}`)
  console.log(`Thresholds: successDrop<=${maxSuccessDrop.toFixed(4)}, p95Increase<=${maxP95IncreaseMs.toFixed(1)}ms, providerFailIncrease<=${maxProviderFailRateIncrease.toFixed(4)}`)
  if (Object.keys(providerThresholds).length > 0) {
    console.log(`Provider overrides: ${JSON.stringify(providerThresholds)}`)
  }

  if (previousEvents <= 0) {
    console.log('No previous baseline window available; skipping regression enforcement.')
    return
  }

  const failures: string[] = []
  const successDrop = Number(snapshot.previous.overallSuccessRate) - Number(snapshot.current.overallSuccessRate)
  const p95Increase = Number(snapshot.current.overallP95Ms) - Number(snapshot.previous.overallP95Ms)

  if (successDrop > maxSuccessDrop) {
    failures.push(`overall success drop ${successDrop.toFixed(4)} > ${maxSuccessDrop.toFixed(4)}`)
  }
  if (p95Increase > maxP95IncreaseMs) {
    failures.push(`overall p95 increase ${p95Increase.toFixed(1)}ms > ${maxP95IncreaseMs.toFixed(1)}ms`)
  }

  for (const [provider, increase] of Object.entries(snapshot.delta.providerFailRate || {})) {
    const threshold = providerThresholds[provider] ?? maxProviderFailRateIncrease
    if (increase > threshold) {
      failures.push(`provider ${provider} fail-rate increase ${increase.toFixed(4)} > ${threshold.toFixed(4)}`)
    }
  }

  if (failures.length === 0) {
    console.log('Regression gate passed')
    return
  }

  const header = mode === 'warn' ? 'Regression warning:' : 'Regression gate failed:'
  console.error(header)
  for (const failure of failures) console.error(`- ${failure}`)
  if (mode === 'block') process.exitCode = 1
}

run().catch((error) => {
  console.error('[Telemetry:RegressionGate] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
