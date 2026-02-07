const fs = require('fs/promises')
const path = require('path')

function getArgValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

function pct(value) {
  if (!Number.isFinite(value)) return '0.00%'
  return `${(value * 100).toFixed(2)}%`
}

function ms(value) {
  if (!Number.isFinite(value)) return '0.0ms'
  return `${value.toFixed(1)}ms`
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function readJsonl(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

async function run() {
  const trendsFile = path.resolve(getArgValue('--trends') || path.join('logs', 'telemetry-trends.json'))
  const historyFile = path.resolve(getArgValue('--history') || path.join('logs', 'telemetry-trends-history.jsonl'))
  const outJson = path.resolve(getArgValue('--out-json') || path.join('docs', 'ops', 'telemetry-baseline.json'))
  const outMd = path.resolve(getArgValue('--out-md') || path.join('docs', 'ops', 'telemetry-baseline.md'))
  const minSamples = 5

  const trends = await readJson(trendsFile, null)
  if (!trends || !trends.current) throw new Error(`invalid trends file: ${trendsFile}`)

  const record = {
    generatedAt: trends.generatedAt || new Date().toISOString(),
    windowSize: Number(trends.windowSize || 0),
    successRate: Number(trends.current.overallSuccessRate || 0),
    p95Ms: Number(trends.current.overallP95Ms || 0),
    providerFailRate: trends.current.providerFailRate || {},
  }

  const history = await readJsonl(historyFile)
  const deduped = history.filter((entry) => entry && entry.generatedAt !== record.generatedAt)
  deduped.push(record)

  await fs.mkdir(path.dirname(historyFile), { recursive: true })
  await fs.writeFile(historyFile, `${deduped.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8')

  const transitions = []
  for (let i = 1; i < deduped.length; i++) {
    const prev = deduped[i - 1]
    const curr = deduped[i]
    if (!prev || !curr) continue
    transitions.push({ prev, curr })
  }

  const successDrops = transitions.map(({ prev, curr }) => Math.max(0, Number(prev.successRate || 0) - Number(curr.successRate || 0)))
  const p95Increases = transitions.map(({ prev, curr }) => Math.max(0, Number(curr.p95Ms || 0) - Number(prev.p95Ms || 0)))

  const providerSet = new Set()
  for (const entry of deduped) {
    for (const provider of Object.keys(entry.providerFailRate || {})) providerSet.add(provider)
  }

  const providerIncreases = []
  const providerSpecific = {}
  for (const provider of providerSet) {
    const series = transitions.map(({ prev, curr }) => {
      const prevRate = Number((prev.providerFailRate || {})[provider] || 0)
      const currRate = Number((curr.providerFailRate || {})[provider] || 0)
      return Math.max(0, currRate - prevRate)
    })
    providerSpecific[provider] = series
    providerIncreases.push(...series)
  }

  const suggested = {
    successDrop: Math.max(0.01, percentile(successDrops, 95)),
    p95IncreaseMs: Math.max(5000, percentile(p95Increases, 95)),
    providerFailRateIncrease: Math.max(0.05, percentile(providerIncreases, 95)),
    providerOverrides: {},
  }

  for (const provider of Object.keys(providerSpecific)) {
    const p95 = percentile(providerSpecific[provider], 95)
    suggested.providerOverrides[provider] = Math.max(suggested.providerFailRateIncrease, p95)
  }

  const baseline = {
    generatedAt: new Date().toISOString(),
    sourceTrends: trendsFile,
    historyFile,
    sampleCount: deduped.length,
    transitionCount: transitions.length,
    readyForEnforcementTuning: transitions.length >= minSamples,
    current: record,
    suggestedThresholds: suggested,
  }

  await fs.mkdir(path.dirname(outJson), { recursive: true })
  await fs.writeFile(outJson, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')

  const md = [
    '# Pixflow Telemetry Baseline',
    '',
    `Generated at: ${baseline.generatedAt}`,
    `Trend source: \`${path.relative(process.cwd(), trendsFile)}\``,
    `History source: \`${path.relative(process.cwd(), historyFile)}\``,
    '',
    '## Baseline State',
    `- Samples: ${baseline.sampleCount}`,
    `- Transitions: ${baseline.transitionCount}`,
    `- Ready for threshold tuning: ${baseline.readyForEnforcementTuning ? 'yes' : 'no'}`,
    '',
    '## Current Snapshot',
    `- Success rate: ${pct(record.successRate)}`,
    `- p95: ${ms(record.p95Ms)}`,
    '',
    '## Suggested Regression Thresholds',
    `- PIXFLOW_REGRESSION_MAX_SUCCESS_DROP=${suggested.successDrop.toFixed(4)}`,
    `- PIXFLOW_REGRESSION_MAX_P95_INCREASE_MS=${suggested.p95IncreaseMs.toFixed(1)}`,
    `- PIXFLOW_REGRESSION_MAX_PROVIDER_FAILRATE_INCREASE=${suggested.providerFailRateIncrease.toFixed(4)}`,
    `- PIXFLOW_REGRESSION_PROVIDER_THRESHOLDS_JSON=${JSON.stringify(suggested.providerOverrides)}`,
    '',
  ].join('\n')

  await fs.mkdir(path.dirname(outMd), { recursive: true })
  await fs.writeFile(outMd, `${md}\n`, 'utf8')
  console.log(`[Telemetry:Baseline] Wrote ${outJson}`)
  console.log(`[Telemetry:Baseline] Wrote ${outMd}`)
}

run().catch((error) => {
  console.error('[Telemetry:Baseline] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
