#!/usr/bin/env node
const fs = require('fs/promises')
const path = require('path')

function getArgValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

function parseNonNegative(raw, fallback) {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

function parseProviderThresholdMap(raw) {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    const out = {}
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

function relativeDelta(current, proposed) {
  if (current === 0 && proposed === 0) return 0
  if (current === 0) return Infinity
  return Math.abs(proposed - current) / Math.abs(current)
}

function direction(current, proposed, lowerIsTighter) {
  if (proposed === current) return 'unchanged'
  return (proposed < current) === lowerIsTighter ? 'tighten' : 'loosen'
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function run() {
  const baselineFile = path.resolve(getArgValue('--baseline') || path.join('docs', 'ops', 'telemetry-baseline.json'))
  const outEnv = path.resolve(getArgValue('--out-env') || path.join('docs', 'ops', 'proposed-thresholds.env'))
  const outMd = path.resolve(getArgValue('--out-md') || path.join('docs', 'ops', 'proposed-thresholds.md'))
  const RELATIVE_THRESHOLD = 0.05

  const baseline = await readJson(baselineFile, null)
  if (!baseline) throw new Error(`baseline file missing or invalid: ${baselineFile}`)

  if (!baseline.readyForEnforcementTuning) {
    console.log(`[Threshold:Propose] Not ready for tuning (samples=${Number(baseline.sampleCount || 0)}, transitions=${Number(baseline.transitionCount || 0)}). Need >= 5 transitions.`)
    return
  }

  const suggested = baseline.suggestedThresholds
  if (!suggested) throw new Error('baseline missing suggestedThresholds')

  const currentSuccessDrop = parseNonNegative(process.env.PIXFLOW_REGRESSION_MAX_SUCCESS_DROP, 0.01)
  const currentP95IncreaseMs = parseNonNegative(process.env.PIXFLOW_REGRESSION_MAX_P95_INCREASE_MS, 5000)
  const currentProviderFailIncrease = parseNonNegative(process.env.PIXFLOW_REGRESSION_MAX_PROVIDER_FAILRATE_INCREASE, 0.05)
  const currentProviderOverrides = parseProviderThresholdMap(process.env.PIXFLOW_REGRESSION_PROVIDER_THRESHOLDS_JSON)

  const proposals = []
  const envLines = []

  const items = [
    {
      key: 'PIXFLOW_REGRESSION_MAX_SUCCESS_DROP',
      current: currentSuccessDrop,
      proposed: Number(suggested.successDrop),
      format: (v) => v.toFixed(4),
      lowerIsTighter: true,
    },
    {
      key: 'PIXFLOW_REGRESSION_MAX_P95_INCREASE_MS',
      current: currentP95IncreaseMs,
      proposed: Number(suggested.p95IncreaseMs),
      format: (v) => v.toFixed(1),
      lowerIsTighter: true,
    },
    {
      key: 'PIXFLOW_REGRESSION_MAX_PROVIDER_FAILRATE_INCREASE',
      current: currentProviderFailIncrease,
      proposed: Number(suggested.providerFailRateIncrease),
      format: (v) => v.toFixed(4),
      lowerIsTighter: true,
    },
  ]

  for (const item of items) {
    const delta = relativeDelta(item.current, item.proposed)
    const changed = delta > RELATIVE_THRESHOLD
    const rec = changed ? direction(item.current, item.proposed, item.lowerIsTighter) : 'unchanged'
    proposals.push({
      key: item.key,
      current: item.format(item.current),
      proposed: item.format(item.proposed),
      delta: `${(delta * 100).toFixed(1)}%`,
      recommendation: rec,
      changed,
    })
    if (changed) envLines.push(`${item.key}=${item.format(item.proposed)}`)
  }

  const mergedOverrides = { ...currentProviderOverrides }
  const providerProposals = []
  for (const [provider, value] of Object.entries(suggested.providerOverrides || {})) {
    const currentVal = currentProviderOverrides[provider] ?? currentProviderFailIncrease
    const proposedVal = Number(value)
    const delta = relativeDelta(currentVal, proposedVal)
    const changed = delta > RELATIVE_THRESHOLD
    const rec = changed ? direction(currentVal, proposedVal, true) : 'unchanged'
    providerProposals.push({
      provider,
      current: currentVal.toFixed(4),
      proposed: proposedVal.toFixed(4),
      delta: `${(delta * 100).toFixed(1)}%`,
      recommendation: rec,
      changed,
    })
    if (changed) mergedOverrides[provider] = proposedVal
  }

  const overridesChanged = providerProposals.some((p) => p.changed)
  if (overridesChanged) {
    envLines.push(`PIXFLOW_REGRESSION_PROVIDER_THRESHOLDS_JSON=${JSON.stringify(mergedOverrides)}`)
  }

  const envContent = envLines.length > 0 ? `${envLines.join('\n')}\n` : ''
  await fs.mkdir(path.dirname(outEnv), { recursive: true })
  await fs.writeFile(outEnv, envContent, 'utf8')

  const changeCount = proposals.filter((p) => p.changed).length + (overridesChanged ? 1 : 0)
  const md = [
    '# Proposed Threshold Update',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Baseline source: \`${path.relative(process.cwd(), baselineFile)}\``,
    `Samples: ${baseline.sampleCount} | Transitions: ${baseline.transitionCount}`,
    `Change threshold: >${(RELATIVE_THRESHOLD * 100).toFixed(0)}% relative delta`,
    `Proposed changes: ${changeCount}`,
    '',
    '## Global Thresholds',
    '| Variable | Current | Proposed | Delta | Recommendation |',
    '|---|---|---|---|---|',
    ...proposals.map((p) => `| ${p.key} | ${p.current} | ${p.proposed} | ${p.delta} | ${p.recommendation} |`),
    '',
  ]

  if (providerProposals.length > 0) {
    md.push(
      '## Provider Overrides',
      '| Provider | Current | Proposed | Delta | Recommendation |',
      '|---|---|---|---|---|',
      ...providerProposals.map((p) => `| ${p.provider} | ${p.current} | ${p.proposed} | ${p.delta} | ${p.recommendation} |`),
      '',
    )
  }

  if (envLines.length > 0) {
    md.push(
      '## Proposed `.env` Snippet',
      '```',
      ...envLines,
      '```',
      '',
    )
  } else {
    md.push('All thresholds within tolerance of current values. No changes proposed.', '')
  }

  await fs.mkdir(path.dirname(outMd), { recursive: true })
  await fs.writeFile(outMd, `${md.join('\n')}\n`, 'utf8')

  console.log(`[Threshold:Propose] Wrote ${outEnv}`)
  console.log(`[Threshold:Propose] Wrote ${outMd}`)
  if (envLines.length > 0) {
    console.log(`[Threshold:Propose] ${changeCount} change(s) proposed:`)
    for (const line of envLines) console.log(`  ${line}`)
  } else {
    console.log('[Threshold:Propose] No changes proposed; all thresholds within tolerance.')
  }
}

run().catch((error) => {
  console.error('[Threshold:Propose] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
