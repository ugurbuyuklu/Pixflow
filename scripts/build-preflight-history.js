#!/usr/bin/env node
const fs = require('fs/promises')
const path = require('path')

function getArgValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return null
  return process.argv[index + 1] || null
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
        try { return JSON.parse(line) } catch { return null }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function streakOf(entries, decision) {
  let count = 0
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].decision !== decision) break
    count++
  }
  return count
}

function buildConfidenceChart(entries, width) {
  const recent = entries.slice(-width)
  const rows = ['READY', 'CONDITIONAL', 'NOT_READY']
  const maxLabel = Math.max(...rows.map((r) => r.length))
  const lines = []
  for (const row of rows) {
    const label = row.padEnd(maxLabel)
    const bar = recent.map((e) => (e.decision === row ? '\u2588' : ' ')).join('')
    lines.push(`${label}  ${bar}`)
  }
  return lines
}

async function run() {
  const preflightFile = path.resolve(getArgValue('--preflight') || path.join('docs', 'ops', 'release-preflight.json'))
  const historyFile = path.resolve(getArgValue('--history') || path.join('logs', 'preflight-history.jsonl'))
  const outFile = path.resolve(getArgValue('--out') || path.join('docs', 'ops', 'preflight-history.md'))

  const preflight = await readJson(preflightFile, null)
  if (!preflight) throw new Error(`preflight file missing or invalid: ${preflightFile}`)

  const record = {
    generatedAt: preflight.generatedAt || new Date().toISOString(),
    profile: preflight.profile || 'unknown',
    decision: preflight.decision || 'NOT_READY',
    failCount: Number(preflight.failCount || 0),
    warnCount: Number(preflight.warnCount || 0),
    passCount: (preflight.checks || []).filter((c) => c.status === 'pass').length,
  }

  const history = await readJsonl(historyFile)
  const deduped = history.filter((e) => e && e.generatedAt !== record.generatedAt)
  deduped.push(record)

  await fs.mkdir(path.dirname(historyFile), { recursive: true })
  await fs.writeFile(historyFile, `${deduped.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8')

  const total = deduped.length
  const readyCount = deduped.filter((e) => e.decision === 'READY').length
  const conditionalCount = deduped.filter((e) => e.decision === 'CONDITIONAL').length
  const notReadyCount = deduped.filter((e) => e.decision === 'NOT_READY').length
  const currentStreak = streakOf(deduped, 'READY')

  const tableEntries = deduped.slice(-30)
  const chartLines = buildConfidenceChart(deduped, 20)

  const md = [
    '# Pixflow Preflight Decision History',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Source: \`${path.relative(process.cwd(), preflightFile)}\``,
    '',
    '## Summary',
    `- Total runs: ${total}`,
    `- READY: ${readyCount} (${total > 0 ? ((readyCount / total) * 100).toFixed(1) : '0.0'}%)`,
    `- CONDITIONAL: ${conditionalCount}`,
    `- NOT_READY: ${notReadyCount}`,
    `- Current READY streak: ${currentStreak}`,
    '',
    '## Confidence Trend (last 20 runs)',
    '```',
    ...chartLines,
    '```',
    '',
    '## Recent History (last 30)',
    '| Date | Profile | Decision | Passes | Warns | Fails |',
    '|---|---|---|---|---|---|',
    ...tableEntries.map((e) => {
      const date = (e.generatedAt || '').replace('T', ' ').slice(0, 19)
      return `| ${date} | ${e.profile || '-'} | ${e.decision} | ${e.passCount ?? '-'} | ${e.warnCount ?? 0} | ${e.failCount ?? 0} |`
    }),
    '',
  ].join('\n')

  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, `${md}\n`, 'utf8')

  console.log(`[Preflight:History] Wrote ${historyFile}`)
  console.log(`[Preflight:History] Wrote ${outFile}`)
  console.log(`[Preflight:History] Total=${total} READY=${readyCount} Streak=${currentStreak}`)
}

run().catch((error) => {
  console.error('[Preflight:History] Failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
