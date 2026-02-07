#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const cwd = process.cwd()
const alertFile = path.join(cwd, 'nightly-alert.json')
const webhookFile = path.join(cwd, 'nightly-alert-webhook.txt')
const stateFile = path.join(cwd, 'logs', 'alert-dedup-state.json')
const windowHours = Number(process.env.PIXFLOW_ALERT_DEDUP_WINDOW_HOURS || 6)
const windowMs = windowHours * 60 * 60 * 1000

if (!fs.existsSync(alertFile)) {
  console.log('[AlertDedup] No alert payload found; skipping.')
  process.exit(0)
}

const payload = JSON.parse(fs.readFileSync(alertFile, 'utf8'))
const signatureInput = `${payload.top_failing_provider || 'none'}|${payload.guardrail_reason || 'none'}|${payload.error_summary || 'none'}`
const signature = crypto.createHash('sha256').update(signatureInput).digest('hex').slice(0, 16)

let state = { lastSignature: '', lastAlertedAt: '', suppressedCount: 0 }
try {
  state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
} catch {}

const now = Date.now()
const lastAlertedMs = state.lastAlertedAt ? new Date(state.lastAlertedAt).getTime() : 0
const withinWindow = (now - lastAlertedMs) < windowMs
const sameSignature = state.lastSignature === signature

if (sameSignature && withinWindow) {
  state.suppressedCount = (state.suppressedCount || 0) + 1
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  fs.writeFileSync(stateFile, JSON.stringify(state))
  fs.writeFileSync(webhookFile, '')
  console.log(`[AlertDedup] Suppressed duplicate alert (signature=${signature}, suppressed=${state.suppressedCount})`)
} else {
  const previousSuppressed = state.suppressedCount || 0
  if (previousSuppressed > 0) {
    payload.dedup_note = sameSignature
      ? `${previousSuppressed} similar alert(s) were suppressed in the previous window`
      : `${previousSuppressed} alert(s) with different signature were suppressed before this change`
    fs.writeFileSync(alertFile, JSON.stringify(payload))
  }
  state = {
    lastSignature: signature,
    lastAlertedAt: new Date().toISOString(),
    suppressedCount: 0,
  }
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  fs.writeFileSync(stateFile, JSON.stringify(state))
  console.log(`[AlertDedup] New/expired alert signature; allowing webhook (signature=${signature})`)
}
