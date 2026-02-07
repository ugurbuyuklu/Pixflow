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

function signedPct(value) {
  if (!Number.isFinite(value)) return '0.00%'
  const sign = value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(2)}%`
}

function signedMs(value) {
  if (!Number.isFinite(value)) return '0.0ms'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}ms`
}

function deltaStatus(metric, value) {
  if (!Number.isFinite(value) || value === 0) return 'stable'
  if (metric === 'successRate') return value > 0 ? 'improved' : 'regressed'
  if (metric === 'p95Ms') return value < 0 ? 'improved' : 'regressed'
  if (metric === 'providerFailRate') return value < 0 ? 'improved' : 'regressed'
  return 'stable'
}

function metricOrNA(hasBaseline, formatter, value) {
  if (!hasBaseline) return 'n/a'
  return formatter(value)
}

function relPathFromCwd(filePath) {
  return path.relative(process.cwd(), filePath) || '.'
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

function normalizeTrends(trends) {
  if (trends && typeof trends === 'object' && trends.current && trends.delta && trends.previous) return trends
  return {
    ...trends,
    windowSize: trends.windowEvents ?? 0,
    current: {
      windowEvents: trends.windowEvents ?? 0,
      overallSuccessRate: trends.overallSuccessRate ?? 0,
      overallP95Ms: trends.overallP95Ms ?? 0,
      providerFailRate: trends.providerFailRate || {},
    },
    previous: {
      windowEvents: 0,
      overallSuccessRate: 0,
      overallP95Ms: 0,
      providerFailRate: {},
    },
    delta: {
      successRate: 0,
      p95Ms: 0,
      providerFailRate: {},
    },
  }
}

function sectionProviders(report) {
  const providers = Object.entries(report.providers || {})
  if (providers.length === 0) return '- No provider attempt data found.'
  const lines = ['| Provider | Success Rate | Fail Rate | Recovery Rate | p95 |', '|---|---:|---:|---:|---:|']
  for (const [provider, row] of providers.sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(
      `| ${provider} | ${pct(row.successRate)} | ${pct(row.failRate)} | ${pct(row.retryRecoveryRate)} | ${ms(row.durationP95Ms)} |`
    )
  }
  return lines.join('\n')
}

function sectionPipelines(report) {
  const pipelines = Object.entries(report.pipelines || {})
  if (pipelines.length === 0) return '- No pipeline data found.'
  const lines = ['| Pipeline | Attempts | Success | Error | Success Rate |', '|---|---:|---:|---:|---:|']
  for (const [pipeline, row] of pipelines.sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(
      `| ${pipeline} | ${row.attempts ?? 0} | ${row.success ?? 0} | ${row.error ?? 0} | ${pct(row.successRate)} |`
    )
  }
  return lines.join('\n')
}

async function run() {
  const reportFile = path.resolve(getArgValue('--report') || 'telemetry-report.json')
  const trendsFile = path.resolve(getArgValue('--trends') || path.join('logs', 'telemetry-trends.json'))
  const outFile = path.resolve(getArgValue('--out') || path.join('docs', 'ops', 'telemetry-dashboard.md'))

  const report = await readJson(reportFile)
  const trends = normalizeTrends(await readJson(trendsFile))
  const generatedAt = new Date().toISOString()
  const hasPreviousWindow = Number(trends.previous?.windowEvents || 0) > 0

  const content = [
    '# Pixflow Telemetry Dashboard Snapshot',
    '',
    `Generated at: ${generatedAt}`,
    `Source report: \`${relPathFromCwd(reportFile)}\``,
    `Source trends: \`${relPathFromCwd(trendsFile)}\``,
    '',
    '## Summary',
    `- Window: ${report.window?.start || '-'} -> ${report.window?.end || '-'}`,
    `- Total events: ${report.totals?.events ?? 0}`,
    `- Attempts: ${report.totals?.attempts ?? 0}`,
    `- Overall success rate: ${pct(report.overall?.successRate)}`,
    `- Overall duration p95: ${ms(report.overall?.durationP95Ms)}`,
    '',
    '## Trend Window',
    `- Trend generated at: ${trends.generatedAt || '-'}`,
    `- Window size: ${trends.windowSize ?? 0}`,
    `- Current window events: ${trends.current?.windowEvents ?? 0}`,
    `- Current success rate: ${pct(trends.current?.overallSuccessRate)}`,
    `- Current p95: ${ms(trends.current?.overallP95Ms)}`,
    `- Previous window events: ${trends.previous?.windowEvents ?? 0}`,
    `- Previous success rate: ${pct(trends.previous?.overallSuccessRate)}`,
    `- Previous p95: ${ms(trends.previous?.overallP95Ms)}`,
    '',
    '## Regression Diff (Current vs Previous Window)',
    '| Metric | Current | Previous | Delta | Status |',
    '|---|---:|---:|---:|---|',
    `| Success rate | ${pct(trends.current?.overallSuccessRate)} | ${metricOrNA(hasPreviousWindow, pct, trends.previous?.overallSuccessRate)} | ${metricOrNA(hasPreviousWindow, signedPct, trends.delta?.successRate)} | ${hasPreviousWindow ? deltaStatus('successRate', trends.delta?.successRate) : 'n/a'} |`,
    `| p95 latency | ${ms(trends.current?.overallP95Ms)} | ${metricOrNA(hasPreviousWindow, ms, trends.previous?.overallP95Ms)} | ${metricOrNA(hasPreviousWindow, signedMs, trends.delta?.p95Ms)} | ${hasPreviousWindow ? deltaStatus('p95Ms', trends.delta?.p95Ms) : 'n/a'} |`,
    '',
    '## Providers',
    sectionProviders(report),
    '',
    '## Pipelines',
    sectionPipelines(report),
    '',
    '## Trend Provider Fail Rates',
    (() => {
      const currentRows = trends.current?.providerFailRate || {}
      const previousRows = trends.previous?.providerFailRate || {}
      const deltaRows = trends.delta?.providerFailRate || {}
      const providers = new Set([...Object.keys(currentRows), ...Object.keys(previousRows), ...Object.keys(deltaRows)])
      const rows = [...providers]
      if (rows.length === 0) return '- No provider fail-rate trend data found.'
      const lines = ['| Provider | Current Fail Rate | Previous Fail Rate | Delta | Status |', '|---|---:|---:|---:|---|']
      for (const provider of rows.sort((a, b) => a.localeCompare(b))) {
        const current = currentRows[provider] || 0
        const previous = previousRows[provider] || 0
        const delta = deltaRows[provider] ?? current - previous
        lines.push(
          `| ${provider} | ${pct(current)} | ${metricOrNA(hasPreviousWindow, pct, previous)} | ${metricOrNA(hasPreviousWindow, signedPct, delta)} | ${hasPreviousWindow ? deltaStatus('providerFailRate', delta) : 'n/a'} |`
        )
      }
      return lines.join('\n')
    })(),
    '',
  ].join('\n')

  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, content, 'utf8')
  console.log(`[Telemetry:Dashboard] Wrote ${outFile}`)
}

run().catch((error) => {
  console.error('[Telemetry:Dashboard] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
