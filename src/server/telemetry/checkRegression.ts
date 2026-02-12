import fs from 'node:fs/promises'
import path from 'node:path'

type Mode = 'warn' | 'block'

interface TrendWindow {
  windowEvents: number
  overallSuccessRate: number
  overallP95Ms: number
  providerFailRate: Record<string, number>
  pipelineMetrics?: Record<
    string,
    {
      attempts: number
      successRate: number
      failRate: number
      p95Ms: number
    }
  >
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
    pipelineSuccessRate?: Record<string, number>
    pipelineP95Ms?: Record<string, number>
    pipelineFailRate?: Record<string, number>
  }
}

type Decision = 'PASS' | 'WARN' | 'FAIL' | 'SKIPPED_NO_BASELINE'

interface RegressionSummary {
  generatedAt: string
  mode: Mode
  decision: Decision
  sourceFile: string
  previousEvents: number
  currentEvents: number
  thresholds: {
    maxSuccessDrop: number
    maxP95IncreaseMs: number
    maxProviderFailRateIncrease: number
    maxPipelineSuccessDrop: number
    maxPipelineP95IncreaseMs: number
    maxPipelineFailRateIncrease: number
    maxFrontendSuccessDrop: number
    maxFrontendP95IncreaseMs: number
    maxFrontendFailRateIncrease: number
    minPipelineSamples: number
    providerOverrides: Record<string, number>
  }
  counters: {
    pipelineCandidates: number
    pipelineEvaluated: number
    pipelineSkippedNoBaseline: number
    pipelineSkippedLowSamples: number
  }
  failures: string[]
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

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) return fallback
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

async function writeOutputs(summary: RegressionSummary, outJson?: string | null, outMd?: string | null): Promise<void> {
  if (outJson) {
    const resolved = path.resolve(outJson)
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    console.log(`[Telemetry:RegressionGate] Wrote ${resolved}`)
  }

  if (outMd) {
    const resolved = path.resolve(outMd)
    const lines = [
      '# Pixflow Regression Gate',
      '',
      `Generated at: ${summary.generatedAt}`,
      `Mode: ${summary.mode}`,
      `Decision: **${summary.decision}**`,
      `Source: \`${summary.sourceFile}\``,
      `Current events: ${summary.currentEvents}`,
      `Previous events: ${summary.previousEvents}`,
      '',
      '## Thresholds',
      `- Overall success drop <= ${summary.thresholds.maxSuccessDrop.toFixed(4)}`,
      `- Overall p95 increase <= ${summary.thresholds.maxP95IncreaseMs.toFixed(1)}ms`,
      `- Provider fail-rate increase <= ${summary.thresholds.maxProviderFailRateIncrease.toFixed(4)}`,
      `- Pipeline success drop <= ${summary.thresholds.maxPipelineSuccessDrop.toFixed(4)}`,
      `- Pipeline p95 increase <= ${summary.thresholds.maxPipelineP95IncreaseMs.toFixed(1)}ms`,
      `- Pipeline fail-rate increase <= ${summary.thresholds.maxPipelineFailRateIncrease.toFixed(4)}`,
      `- Frontend success drop <= ${summary.thresholds.maxFrontendSuccessDrop.toFixed(4)}`,
      `- Frontend p95 increase <= ${summary.thresholds.maxFrontendP95IncreaseMs.toFixed(1)}ms`,
      `- Frontend fail-rate increase <= ${summary.thresholds.maxFrontendFailRateIncrease.toFixed(4)}`,
      `- Pipeline min samples >= ${summary.thresholds.minPipelineSamples}`,
      `- Provider overrides: \`${JSON.stringify(summary.thresholds.providerOverrides)}\``,
      '',
      '## Coverage Counters',
      `- Pipeline candidates: ${summary.counters.pipelineCandidates}`,
      `- Pipeline evaluated: ${summary.counters.pipelineEvaluated}`,
      `- Pipeline skipped (no baseline): ${summary.counters.pipelineSkippedNoBaseline}`,
      `- Pipeline skipped (low samples): ${summary.counters.pipelineSkippedLowSamples}`,
      '',
      '## Triggered Findings',
    ]
    if (summary.failures.length === 0) {
      lines.push('- none')
    } else {
      for (const failure of summary.failures) lines.push(`- ${failure}`)
    }
    lines.push('')

    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, `${lines.join('\n')}\n`, 'utf8')
    console.log(`[Telemetry:RegressionGate] Wrote ${resolved}`)
  }
}

async function run(): Promise<void> {
  const fileArg = getArgValue('--file')
  const mode = parseMode(getArgValue('--mode') || process.env.PIXFLOW_REGRESSION_MODE || null)
  const outJson = getArgValue('--out-json')
  const outMd = getArgValue('--out-md')
  const filePath = fileArg ? path.resolve(fileArg) : path.join(process.cwd(), 'logs', 'telemetry-trends.json')

  const maxSuccessDrop = parseNonNegative(process.env.PIXFLOW_REGRESSION_MAX_SUCCESS_DROP, 0.01)
  const maxP95IncreaseMs = parseNonNegative(process.env.PIXFLOW_REGRESSION_MAX_P95_INCREASE_MS, 5000)
  const maxProviderFailRateIncrease = parseNonNegative(
    process.env.PIXFLOW_REGRESSION_MAX_PROVIDER_FAILRATE_INCREASE,
    0.05,
  )
  const maxPipelineSuccessDrop = parseNonNegative(
    process.env.PIXFLOW_REGRESSION_MAX_PIPELINE_SUCCESS_DROP,
    maxSuccessDrop,
  )
  const maxPipelineP95IncreaseMs = parseNonNegative(
    process.env.PIXFLOW_REGRESSION_MAX_PIPELINE_P95_INCREASE_MS,
    maxP95IncreaseMs,
  )
  const maxPipelineFailRateIncrease = parseNonNegative(
    process.env.PIXFLOW_REGRESSION_MAX_PIPELINE_FAILRATE_INCREASE,
    maxProviderFailRateIncrease,
  )
  const maxFrontendSuccessDrop = parseNonNegative(
    process.env.PIXFLOW_REGRESSION_MAX_FRONTEND_SUCCESS_DROP,
    maxPipelineSuccessDrop,
  )
  const maxFrontendP95IncreaseMs = parseNonNegative(
    process.env.PIXFLOW_REGRESSION_MAX_FRONTEND_P95_INCREASE_MS,
    maxPipelineP95IncreaseMs,
  )
  const maxFrontendFailRateIncrease = parseNonNegative(
    process.env.PIXFLOW_REGRESSION_MAX_FRONTEND_FAILRATE_INCREASE,
    maxPipelineFailRateIncrease,
  )
  const minPipelineSamples = parsePositiveInt(process.env.PIXFLOW_REGRESSION_PIPELINE_MIN_SAMPLES, 3)
  const providerThresholds = parseProviderThresholdMap(process.env.PIXFLOW_REGRESSION_PROVIDER_THRESHOLDS_JSON)

  const raw = await fs.readFile(filePath, 'utf8')
  const snapshot = JSON.parse(raw) as TrendSnapshot
  const previousEvents = Number(snapshot.previous?.windowEvents || 0)

  console.log('=== Pixflow Regression Gate ===')
  console.log(`Mode: ${mode}`)
  console.log(`File: ${filePath}`)
  console.log(`Current events: ${snapshot.current?.windowEvents ?? 0}`)
  console.log(`Previous events: ${previousEvents}`)
  console.log(
    `Thresholds: successDrop<=${maxSuccessDrop.toFixed(4)}, p95Increase<=${maxP95IncreaseMs.toFixed(1)}ms, providerFailIncrease<=${maxProviderFailRateIncrease.toFixed(4)}`,
  )
  console.log(
    `Pipeline thresholds: successDrop<=${maxPipelineSuccessDrop.toFixed(4)}, p95Increase<=${maxPipelineP95IncreaseMs.toFixed(1)}ms, failIncrease<=${maxPipelineFailRateIncrease.toFixed(4)}, minSamples>=${minPipelineSamples}`,
  )
  console.log(
    `Frontend thresholds: successDrop<=${maxFrontendSuccessDrop.toFixed(4)}, p95Increase<=${maxFrontendP95IncreaseMs.toFixed(1)}ms, failIncrease<=${maxFrontendFailRateIncrease.toFixed(4)}`,
  )
  if (Object.keys(providerThresholds).length > 0) {
    console.log(`Provider overrides: ${JSON.stringify(providerThresholds)}`)
  }

  const summary: RegressionSummary = {
    generatedAt: new Date().toISOString(),
    mode,
    decision: 'PASS',
    sourceFile: filePath,
    previousEvents,
    currentEvents: Number(snapshot.current?.windowEvents || 0),
    thresholds: {
      maxSuccessDrop,
      maxP95IncreaseMs,
      maxProviderFailRateIncrease,
      maxPipelineSuccessDrop,
      maxPipelineP95IncreaseMs,
      maxPipelineFailRateIncrease,
      maxFrontendSuccessDrop,
      maxFrontendP95IncreaseMs,
      maxFrontendFailRateIncrease,
      minPipelineSamples,
      providerOverrides: providerThresholds,
    },
    counters: {
      pipelineCandidates: 0,
      pipelineEvaluated: 0,
      pipelineSkippedNoBaseline: 0,
      pipelineSkippedLowSamples: 0,
    },
    failures: [],
  }

  if (previousEvents <= 0) {
    summary.decision = 'SKIPPED_NO_BASELINE'
    await writeOutputs(summary, outJson, outMd)
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

  const currentPipelines = snapshot.current.pipelineMetrics || {}
  const previousPipelines = snapshot.previous.pipelineMetrics || {}
  const pipelines = new Set<string>([
    ...Object.keys(currentPipelines),
    ...Object.keys(previousPipelines),
    ...Object.keys(snapshot.delta.pipelineSuccessRate || {}),
    ...Object.keys(snapshot.delta.pipelineP95Ms || {}),
    ...Object.keys(snapshot.delta.pipelineFailRate || {}),
  ])

  summary.counters.pipelineCandidates = pipelines.size
  for (const pipeline of pipelines) {
    const current = currentPipelines[pipeline]
    const previous = previousPipelines[pipeline]
    if (!current || !previous || Number(current.attempts || 0) <= 0 || Number(previous.attempts || 0) <= 0) {
      summary.counters.pipelineSkippedNoBaseline += 1
      continue
    }

    if (Number(previous.attempts || 0) < minPipelineSamples || Number(current.attempts || 0) < minPipelineSamples) {
      summary.counters.pipelineSkippedLowSamples += 1
      continue
    }

    summary.counters.pipelineEvaluated += 1
    const isFrontend = pipeline.startsWith('frontend.')
    const successDropThreshold = isFrontend ? maxFrontendSuccessDrop : maxPipelineSuccessDrop
    const p95IncreaseThreshold = isFrontend ? maxFrontendP95IncreaseMs : maxPipelineP95IncreaseMs
    const failRateIncreaseThreshold = isFrontend ? maxFrontendFailRateIncrease : maxPipelineFailRateIncrease

    const pipelineSuccessDrop = Number(previous.successRate || 0) - Number(current.successRate || 0)
    const pipelineP95Increase = Number(current.p95Ms || 0) - Number(previous.p95Ms || 0)
    const pipelineFailRateIncrease = Number(current.failRate || 0) - Number(previous.failRate || 0)

    if (pipelineSuccessDrop > successDropThreshold) {
      failures.push(
        `pipeline ${pipeline} success drop ${pipelineSuccessDrop.toFixed(4)} > ${successDropThreshold.toFixed(4)}`,
      )
    }
    if (pipelineP95Increase > p95IncreaseThreshold) {
      failures.push(
        `pipeline ${pipeline} p95 increase ${pipelineP95Increase.toFixed(1)}ms > ${p95IncreaseThreshold.toFixed(1)}ms`,
      )
    }
    if (pipelineFailRateIncrease > failRateIncreaseThreshold) {
      failures.push(
        `pipeline ${pipeline} fail-rate increase ${pipelineFailRateIncrease.toFixed(4)} > ${failRateIncreaseThreshold.toFixed(4)}`,
      )
    }
  }

  summary.failures = failures
  if (failures.length === 0) {
    summary.decision = 'PASS'
    await writeOutputs(summary, outJson, outMd)
    console.log('Regression gate passed')
    return
  }

  summary.decision = mode === 'warn' ? 'WARN' : 'FAIL'
  await writeOutputs(summary, outJson, outMd)

  const header = mode === 'warn' ? 'Regression warning:' : 'Regression gate failed:'
  console.error(header)
  for (const failure of failures) console.error(`- ${failure}`)
  if (mode === 'block') process.exitCode = 1
}

run().catch((error) => {
  console.error('[Telemetry:RegressionGate] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
