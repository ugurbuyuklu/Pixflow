#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function topEntry(map) {
  let key = 'none'
  let value = 0
  for (const [k, v] of map.entries()) {
    if (v > value) {
      key = k
      value = v
    }
  }
  return { key, value }
}

function toPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0.00%'
  return `${(value * 100).toFixed(2)}%`
}

const cwd = process.cwd()
const logsPath = path.join(cwd, 'logs', 'pipeline-events.jsonl')
const trendsPath = path.join(cwd, 'logs', 'telemetry-trends.json')
const registryPath = path.join(cwd, 'docs', 'ops', 'playbook-registry.json')
const runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
const repoBase = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/blob/${process.env.GITHUB_SHA}`

const lines = fs.existsSync(logsPath)
  ? fs.readFileSync(logsPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  : []
const events = lines.map((l) => {
  try {
    return JSON.parse(l)
  } catch {
    return null
  }
}).filter(Boolean)
const registry = readJson(registryPath, { version: 'unknown', playbooks: [] })
const trends = readJson(trendsPath, null)

let budgetUsed = null
let guardrailReason = 'unknown'
const providerErrors = new Map()
const pipelineErrors = new Map()
const errorCounts = new Map()

for (let i = events.length - 1; i >= 0; i--) {
  const e = events[i]
  if (e && e.pipeline === 'smoke.external.guardrail') {
    budgetUsed = e.metadata && typeof e.metadata.estimatedCostUsd === 'number' ? e.metadata.estimatedCostUsd : null
    guardrailReason = e.metadata && typeof e.metadata.reason === 'string' ? e.metadata.reason : 'none'
    break
  }
}

for (const e of events) {
  if (!e || e.status !== 'error') continue
  const provider = e.metadata && typeof e.metadata.provider === 'string' ? e.metadata.provider : null
  if (provider) providerErrors.set(provider, (providerErrors.get(provider) || 0) + 1)
  const pipeline = typeof e.pipeline === 'string' ? e.pipeline : null
  if (pipeline) pipelineErrors.set(pipeline, (pipelineErrors.get(pipeline) || 0) + 1)
  const msg = typeof e.error === 'string' && e.error ? e.error : 'unknown'
  errorCounts.set(msg, (errorCounts.get(msg) || 0) + 1)
}

const topProvider = topEntry(providerErrors)
const topPipeline = topEntry(pipelineErrors)
const topError = topEntry(errorCounts)
const providerErrorCount = [...providerErrors.values()].reduce((a, b) => a + b, 0)
const pipelineErrorCount = [...pipelineErrors.values()].reduce((a, b) => a + b, 0)
const criticalReasons = new Set(['budget_exceeded', 'timeout_exceeded'])
const severity = criticalReasons.has(String(guardrailReason)) || pipelineErrorCount >= 3 ? 'critical' : 'warning'

const playbook = (registry.playbooks || []).find((p) => p.provider === topProvider.key)
  || (registry.playbooks || []).find((p) => p.provider === 'none')
  || { id: 'PB-CORE-GENERIC', version: 'unknown', ownerTeam: 'core-platform', ownerOncall: '@core-oncall', runbookPath: 'docs/ops/runbooks/nightly-failure.md' }

const regressionSummary = (() => {
  if (!trends || !trends.current || !trends.previous || !trends.delta) {
    return {
      available: false,
      reason: 'telemetry_trends_missing',
    }
  }

  const previousEvents = Number(trends.previous.windowEvents || 0)
  if (previousEvents <= 0) {
    return {
      available: true,
      baseline_ready: false,
      reason: 'previous_window_empty',
      window_size: Number(trends.windowSize || 0),
      current_events: Number(trends.current.windowEvents || 0),
      previous_events: previousEvents,
    }
  }

  const successDelta = Number(trends.delta.successRate || 0)
  const p95DeltaMs = Number(trends.delta.p95Ms || 0)
  const providerDelta = trends.delta.providerFailRate && typeof trends.delta.providerFailRate === 'object'
    ? trends.delta.providerFailRate
    : {}
  let topRegressedProvider = 'none'
  let topRegressedProviderDelta = 0
  for (const [provider, raw] of Object.entries(providerDelta)) {
    const delta = typeof raw === 'number' ? raw : 0
    if (delta > topRegressedProviderDelta) {
      topRegressedProvider = provider
      topRegressedProviderDelta = delta
    }
  }

  return {
    available: true,
    baseline_ready: true,
    window_size: Number(trends.windowSize || 0),
    current_events: Number(trends.current.windowEvents || 0),
    previous_events: previousEvents,
    success_rate_current: Number(trends.current.overallSuccessRate || 0),
    success_rate_previous: Number(trends.previous.overallSuccessRate || 0),
    success_rate_delta: successDelta,
    success_rate_status: successDelta < 0 ? 'regressed' : (successDelta > 0 ? 'improved' : 'stable'),
    p95_current_ms: Number(trends.current.overallP95Ms || 0),
    p95_previous_ms: Number(trends.previous.overallP95Ms || 0),
    p95_delta_ms: p95DeltaMs,
    p95_status: p95DeltaMs > 0 ? 'regressed' : (p95DeltaMs < 0 ? 'improved' : 'stable'),
    provider_failrate_deltas: providerDelta,
    top_regressed_provider: topRegressedProvider,
    top_regressed_provider_delta: topRegressedProviderDelta,
  }
})()

const nextActions = [
  `Open run: ${runUrl}`,
  `Open runbook: ${repoBase}/${playbook.runbookPath}`,
  severity === 'critical'
    ? 'Acknowledge incident and page owner on-call within 5 minutes'
    : 'Acknowledge incident and start triage within 30 minutes',
  guardrailReason === 'budget_exceeded'
    ? 'Do not retry immediately; reduce scope or increase budget guardrail with approval'
    : 'Retry once if failure signature is transient',
]

if (regressionSummary.available && regressionSummary.baseline_ready) {
  nextActions.push(
    `Review regression: success delta ${toPercent(regressionSummary.success_rate_delta)}, p95 delta ${Number(regressionSummary.p95_delta_ms || 0).toFixed(1)}ms`
  )
}

const alertSummaryLines = [
  `[${severity.toUpperCase()}] Nightly Real Smoke failed`,
  `Top provider: ${topProvider.value > 0 ? topProvider.key : 'none'} | Top pipeline: ${topPipeline.value > 0 ? topPipeline.key : 'none'}`,
  `Guardrail: ${guardrailReason} | Provider errors: ${providerErrorCount} | Pipeline errors: ${pipelineErrorCount}`,
]

if (regressionSummary.available && regressionSummary.baseline_ready) {
  alertSummaryLines.push(
    `Regression: success ${toPercent(regressionSummary.success_rate_previous)} -> ${toPercent(regressionSummary.success_rate_current)} (${toPercent(regressionSummary.success_rate_delta)}), p95 ${Number(regressionSummary.p95_previous_ms || 0).toFixed(1)}ms -> ${Number(regressionSummary.p95_current_ms || 0).toFixed(1)}ms (${Number(regressionSummary.p95_delta_ms || 0).toFixed(1)}ms)`
  )
}

const payload = {
  severity,
  alert_route: severity === 'critical' ? 'critical' : 'warning',
  workflow: 'Nightly Real Smoke',
  run_url: runUrl,
  failed_job: 'nightly-real',
  failed_step: 'nightly-real',
  budget_used: budgetUsed,
  guardrail_reason: guardrailReason,
  top_failing_provider: topProvider.value > 0 ? topProvider.key : 'none',
  top_failing_pipeline: topPipeline.value > 0 ? topPipeline.key : 'none',
  error_summary: topError.value > 0 ? topError.key : 'none',
  provider_error_count: providerErrorCount,
  pipeline_error_count: pipelineErrorCount,
  owner_team: playbook.ownerTeam,
  owner_oncall: playbook.ownerOncall,
  escalation_level: severity === 'critical' ? 'page_oncall' : 'notify_team',
  action_required: severity === 'critical' ? 'immediate_triage' : 'next_business_day_triage',
  retry_recommended: guardrailReason !== 'budget_exceeded',
  playbook_id: playbook.id,
  playbook_version: playbook.version || registry.version || 'unknown',
  playbook_registry: `${repoBase}/docs/ops/playbook-registry.json`,
  runbook_url: `${repoBase}/${playbook.runbookPath}`,
  regression_summary: regressionSummary,
  alert_summary: alertSummaryLines.join('\n'),
  next_actions: nextActions,
  ref: process.env.GITHUB_REF_NAME || '',
  sha: process.env.GITHUB_SHA || '',
}

const criticalWebhook = process.env.NIGHTLY_ALERT_WEBHOOK_CRITICAL || ''
const warningWebhook = process.env.NIGHTLY_ALERT_WEBHOOK_WARNING || ''
const fallbackWebhook = process.env.NIGHTLY_ALERT_WEBHOOK || ''

let webhook = ''
if (severity === 'critical') webhook = criticalWebhook || fallbackWebhook || warningWebhook
else webhook = warningWebhook || fallbackWebhook || criticalWebhook

fs.writeFileSync(path.join(cwd, 'nightly-alert.json'), JSON.stringify(payload))
fs.writeFileSync(path.join(cwd, 'nightly-alert-webhook.txt'), webhook)
