#!/usr/bin/env node
const fs = require('fs/promises')
const fss = require('fs')
const path = require('path')

function getArgValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

function parsePositiveNumber(raw, fallback) {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function pct(value) {
  if (!Number.isFinite(value)) return '0.00%'
  return `${(value * 100).toFixed(2)}%`
}

function ms(value) {
  if (!Number.isFinite(value)) return '0.0ms'
  return `${value.toFixed(1)}ms`
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function exists(filePath) {
  return fss.existsSync(filePath)
}

async function run() {
  const cwd = process.cwd()
  const profile = getArgValue('--profile') || 'release'
  const reportFile = path.resolve(getArgValue('--report') || 'telemetry-report.json')
  const trendsFile = path.resolve(getArgValue('--trends') || path.join('logs', 'telemetry-trends.json'))
  const baselineFile = path.resolve(getArgValue('--baseline') || path.join('docs', 'ops', 'telemetry-baseline.json'))
  const registryFile = path.resolve(getArgValue('--registry') || path.join('docs', 'ops', 'playbook-registry.json'))
  const outJson = path.resolve(getArgValue('--out-json') || path.join('docs', 'ops', 'release-preflight.json'))
  const outMd = path.resolve(getArgValue('--out-md') || path.join('docs', 'ops', 'release-preflight.md'))

  const report = await readJson(reportFile, null)
  const trends = await readJson(trendsFile, null)
  const baseline = await readJson(baselineFile, null)
  const registry = await readJson(registryFile, { playbooks: [] })

  const minOverall = parsePositiveNumber(process.env.PIXFLOW_GATE_MIN_OVERALL_SUCCESS_RATE, profile === 'nightly' ? 0.9 : 1)
  const minProvider = parsePositiveNumber(process.env.PIXFLOW_GATE_MIN_PROVIDER_SUCCESS_RATE, profile === 'nightly' ? 0.8 : 1)
  const maxP95Ms = parsePositiveNumber(process.env.PIXFLOW_GATE_MAX_P95_MS, profile === 'nightly' ? 600000 : 300000)
  const maxSuccessDrop = parsePositiveNumber(process.env.PIXFLOW_REGRESSION_MAX_SUCCESS_DROP, profile === 'nightly' ? 0.03 : 0.01)
  const maxP95IncreaseMs = parsePositiveNumber(process.env.PIXFLOW_REGRESSION_MAX_P95_INCREASE_MS, profile === 'nightly' ? 30000 : 5000)
  const maxProviderFailIncrease = parsePositiveNumber(process.env.PIXFLOW_REGRESSION_MAX_PROVIDER_FAILRATE_INCREASE, profile === 'nightly' ? 0.1 : 0.05)

  const checks = []

  if (!report) {
    checks.push({ id: 'telemetry_report_present', status: 'fail', detail: 'telemetry-report.json missing or invalid' })
  } else {
    const overall = Number(report.overall?.successRate || 0)
    const p95 = Number(report.overall?.durationP95Ms || 0)
    checks.push({
      id: 'overall_success_rate',
      status: overall >= minOverall ? 'pass' : 'fail',
      detail: `${pct(overall)} >= ${pct(minOverall)}`,
    })
    checks.push({
      id: 'overall_p95',
      status: p95 <= maxP95Ms ? 'pass' : 'fail',
      detail: `${ms(p95)} <= ${ms(maxP95Ms)}`,
    })

    const providerRows = Object.entries(report.providers || {})
    const badProviders = providerRows
      .filter(([, row]) => Number(row.successRate || 0) < minProvider)
      .map(([provider, row]) => `${provider}:${pct(Number(row.successRate || 0))}`)
    checks.push({
      id: 'provider_success_rates',
      status: badProviders.length === 0 ? 'pass' : 'fail',
      detail: badProviders.length === 0 ? `all providers >= ${pct(minProvider)}` : badProviders.join(', '),
    })
  }

  if (!trends || !trends.current || !trends.previous || !trends.delta) {
    checks.push({ id: 'trend_snapshot_present', status: 'fail', detail: 'telemetry-trends.json missing required shape' })
  } else {
    const previousEvents = Number(trends.previous.windowEvents || 0)
    if (previousEvents <= 0) {
      checks.push({ id: 'regression_baseline_window', status: 'warn', detail: 'previous trend window empty; regression comparison limited' })
    } else {
      const successDrop = Number(trends.previous.overallSuccessRate || 0) - Number(trends.current.overallSuccessRate || 0)
      const p95Increase = Number(trends.current.overallP95Ms || 0) - Number(trends.previous.overallP95Ms || 0)
      checks.push({
        id: 'regression_success_drop',
        status: successDrop <= maxSuccessDrop ? 'pass' : 'fail',
        detail: `${pct(successDrop)} <= ${pct(maxSuccessDrop)}`,
      })
      checks.push({
        id: 'regression_p95_increase',
        status: p95Increase <= maxP95IncreaseMs ? 'pass' : 'fail',
        detail: `${ms(p95Increase)} <= ${ms(maxP95IncreaseMs)}`,
      })
      const providerDeltas = Object.entries(trends.delta.providerFailRate || {})
      const badProviderDeltas = providerDeltas
        .filter(([, delta]) => Number(delta || 0) > maxProviderFailIncrease)
        .map(([provider, delta]) => `${provider}:${pct(Number(delta || 0))}`)
      checks.push({
        id: 'regression_provider_failrate_increase',
        status: badProviderDeltas.length === 0 ? 'pass' : 'fail',
        detail: badProviderDeltas.length === 0 ? `all providers <= ${pct(maxProviderFailIncrease)}` : badProviderDeltas.join(', '),
      })
    }
  }

  if (!baseline) {
    checks.push({ id: 'baseline_report_present', status: 'warn', detail: 'telemetry-baseline.json missing' })
  } else {
    const ready = Boolean(baseline.readyForEnforcementTuning)
    checks.push({
      id: 'baseline_sample_readiness',
      status: ready ? 'pass' : 'warn',
      detail: ready
        ? `ready (samples=${Number(baseline.sampleCount || 0)})`
        : `not-ready (samples=${Number(baseline.sampleCount || 0)}, transitions=${Number(baseline.transitionCount || 0)})`,
    })
  }

  const playbooks = Array.isArray(registry.playbooks) ? registry.playbooks : []
  const missingRunbooks = playbooks
    .filter((playbook) => typeof playbook.runbookPath === 'string' && playbook.runbookPath.length > 0)
    .map((playbook) => playbook.runbookPath)
    .filter((p) => !exists(path.join(cwd, p)))
  checks.push({
    id: 'runbook_coverage',
    status: missingRunbooks.length === 0 ? 'pass' : 'fail',
    detail: missingRunbooks.length === 0 ? `all ${playbooks.length} runbooks resolved` : `missing: ${missingRunbooks.join(', ')}`,
  })

  const failCount = checks.filter((check) => check.status === 'fail').length
  const warnCount = checks.filter((check) => check.status === 'warn').length
  const decision = failCount > 0 ? 'NOT_READY' : (warnCount > 0 ? 'CONDITIONAL' : 'READY')

  const preflight = {
    generatedAt: new Date().toISOString(),
    profile,
    decision,
    failCount,
    warnCount,
    checks,
    sources: {
      reportFile,
      trendsFile,
      baselineFile,
      registryFile,
    },
  }

  await fs.mkdir(path.dirname(outJson), { recursive: true })
  await fs.writeFile(outJson, `${JSON.stringify(preflight, null, 2)}\n`, 'utf8')

  const md = [
    '# Pixflow Release Preflight',
    '',
    `Generated at: ${preflight.generatedAt}`,
    `Profile: ${profile}`,
    `Decision: **${decision}**`,
    `Fails: ${failCount} | Warnings: ${warnCount}`,
    '',
    '## Checks',
    '| Check | Status | Detail |',
    '|---|---|---|',
    ...checks.map((check) => `| ${check.id} | ${check.status.toUpperCase()} | ${check.detail} |`),
    '',
    '## Sources',
    `- report: \`${path.relative(cwd, reportFile)}\``,
    `- trends: \`${path.relative(cwd, trendsFile)}\``,
    `- baseline: \`${path.relative(cwd, baselineFile)}\``,
    `- playbook registry: \`${path.relative(cwd, registryFile)}\``,
    '',
  ].join('\n')

  await fs.mkdir(path.dirname(outMd), { recursive: true })
  await fs.writeFile(outMd, `${md}\n`, 'utf8')

  console.log(`[Release:Preflight] Wrote ${outJson}`)
  console.log(`[Release:Preflight] Wrote ${outMd}`)
}

run().catch((error) => {
  console.error('[Release:Preflight] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
