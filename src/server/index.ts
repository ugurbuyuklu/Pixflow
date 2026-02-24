import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createApp } from './createApp.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const PROJECT_ROOT = path.resolve(__dirname, '../..')
const DATA_DIR = path.join(PROJECT_ROOT, 'data')
const PORT = process.env.PORT || 3001

const webDir = path.join(PROJECT_ROOT, 'dist/web')
const spaDir = fs.existsSync(webDir) ? webDir : undefined

const app = createApp({ projectRoot: PROJECT_ROOT, dataDir: DATA_DIR, spaDir })

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason)
})

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
  console.log(`Generate prompts: POST http://localhost:${PORT}/api/prompts/generate`)
  console.log(`Batch generate: POST http://localhost:${PORT}/api/generate/batch`)
  console.log(`History: GET http://localhost:${PORT}/api/history`)
})

server.setTimeout(600_000)
server.keepAliveTimeout = 620_000
server.headersTimeout = 621_000
