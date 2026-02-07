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

function signedPct(value) {
  if (!Number.isFinite(value)) return '0.00%'
  const sign = value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(2)}%`
}

function ms(value) {
  if (!Number.isFinite(value)) return '0.0ms'
  return `${value.toFixed(1)}ms`
}

function signedMs(value) {
  if (!Number.isFinite(value)) return '0.0ms'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}ms`
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

async function run() {
  const trendsFile = path.resolve(getArgValue('--trends') || path.join('logs', 'telemetry-trends.json'))
  const outFile = path.resolve(getArgValue('--out') || path.join('docs', 'ops', 'telemetry-highlights.md'))
  const trends = await readJson(trendsFile)

  const current = trends.current || {}
  const previous = trends.previous || {}
  const delta = trends.delta || {}
  const hasBaseline = Number(previous.windowEvents || 0) > 0

  const lines = ['## Telemetry Regression Highlights', '']
  lines.push(`- Generated: ${new Date().toISOString()}`)
  lines.push(`- Window size: ${trends.windowSize ?? 0}`)
  lines.push(`- Current events: ${current.windowEvents ?? 0}`)
  lines.push(`- Previous events: ${previous.windowEvents ?? 0}`)
  lines.push('')

  if (!hasBaseline) {
    lines.push('- Baseline not available yet (previous window is empty).')
  } else {
    const successDelta = Number(delta.successRate || 0)
    const p95Delta = Number(delta.p95Ms || 0)
    const successRegressed = successDelta < 0
    const p95Regressed = p95Delta > 0
    lines.push('| Metric | Current | Previous | Delta | Status |')
    lines.push('|---|---:|---:|---:|---|')
    lines.push(
      `| Success rate | ${pct(current.overallSuccessRate)} | ${pct(previous.overallSuccessRate)} | ${signedPct(successDelta)} | ${successRegressed ? 'regressed' : (successDelta > 0 ? 'improved' : 'stable')} |`
    )
    lines.push(
      `| p95 latency | ${ms(current.overallP95Ms)} | ${ms(previous.overallP95Ms)} | ${signedMs(p95Delta)} | ${p95Regressed ? 'regressed' : (p95Delta < 0 ? 'improved' : 'stable')} |`
    )
    lines.push('')

    const providerDeltas = delta.providerFailRate || {}
    const regressedProviders = Object.entries(providerDeltas)
      .filter(([, value]) => Number(value) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))

    if (regressedProviders.length === 0) {
      lines.push('- Provider fail-rate regressions: none.')
    } else {
      lines.push('- Provider fail-rate regressions:')
      for (const [provider, value] of regressedProviders) {
        lines.push(`  - ${provider}: ${signedPct(Number(value))}`)
      }
    }
  }

  lines.push('')
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8')
  console.log(`[Telemetry:Highlights] Wrote ${outFile}`)
}

run().catch((error) => {
  console.error('[Telemetry:Highlights] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
