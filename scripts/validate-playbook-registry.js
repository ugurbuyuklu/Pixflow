#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

function fail(message) {
  console.error(`[PlaybookRegistry] ${message}`)
  process.exit(1)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

const filePath = path.join(process.cwd(), 'docs', 'ops', 'playbook-registry.json')
if (!fs.existsSync(filePath)) fail(`missing file: ${filePath}`)

let data
try {
  data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
} catch (error) {
  fail(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
}

if (!data || typeof data !== 'object') fail('root must be an object')
const allowedRootKeys = new Set(['$schema', 'version', 'updatedAt', 'playbooks'])
for (const key of Object.keys(data)) {
  if (!allowedRootKeys.has(key)) fail(`unexpected root key: ${key}`)
}
if (data.$schema !== './playbook-registry.schema.json') {
  fail('root.$schema must be "./playbook-registry.schema.json"')
}
if (!isNonEmptyString(data.version)) fail('root.version must be non-empty string')
if (!isNonEmptyString(data.updatedAt)) fail('root.updatedAt must be non-empty string')
if (!Array.isArray(data.playbooks) || data.playbooks.length === 0) fail('root.playbooks must be a non-empty array')

const providers = new Set()
const ids = new Set()

for (const [index, item] of data.playbooks.entries()) {
  const p = `playbooks[${index}]`
  if (!item || typeof item !== 'object') fail(`${p} must be an object`)
  const allowedPlaybookKeys = new Set(['provider', 'id', 'version', 'ownerTeam', 'ownerOncall', 'runbookPath'])
  for (const key of Object.keys(item)) {
    if (!allowedPlaybookKeys.has(key)) fail(`${p} unexpected key: ${key}`)
  }
  if (!isNonEmptyString(item.provider)) fail(`${p}.provider must be non-empty string`)
  if (!isNonEmptyString(item.id)) fail(`${p}.id must be non-empty string`)
  if (!isNonEmptyString(item.version)) fail(`${p}.version must be non-empty string`)
  if (!isNonEmptyString(item.ownerTeam)) fail(`${p}.ownerTeam must be non-empty string`)
  if (!isNonEmptyString(item.ownerOncall)) fail(`${p}.ownerOncall must be non-empty string`)
  if (!isNonEmptyString(item.runbookPath)) fail(`${p}.runbookPath must be non-empty string`)
  if (!item.runbookPath.startsWith('docs/ops/runbooks/')) fail(`${p}.runbookPath must be under docs/ops/runbooks/`)

  const runbookAbsolute = path.join(process.cwd(), item.runbookPath)
  if (!fs.existsSync(runbookAbsolute)) fail(`${p}.runbookPath target missing: ${item.runbookPath}`)

  if (providers.has(item.provider)) fail(`duplicate provider mapping: ${item.provider}`)
  if (ids.has(item.id)) fail(`duplicate playbook id: ${item.id}`)
  providers.add(item.provider)
  ids.add(item.id)
}

if (!providers.has('none')) fail('missing fallback provider mapping: none')

console.log('[PlaybookRegistry] Validation passed')
