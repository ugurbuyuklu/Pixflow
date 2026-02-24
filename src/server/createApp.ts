import path from 'node:path'
import cors from 'cors'
import express from 'express'
import { validateServerEnv } from './config/validation.js'
import { getDb, initDatabase } from './db/index.js'
import { migrateJsonToSqlite } from './db/migrations.js'
import { requireAuth } from './middleware/auth.js'
import { createAuthRouter } from './routes/auth.js'
import { createAvatarsRouter } from './routes/avatars.js'
import { createCaptionsRouter } from './routes/captions.js'
import { createCompetitorReportRouter } from './routes/competitorReport.js'
import { createComposeRouter } from './routes/compose.js'
import { createFeedbackRouter } from './routes/feedback.js'
import { createGenerateRouter } from './routes/generate.js'
import { createHistoryRouter } from './routes/history.js'
import { createImageRatingsRouter } from './routes/imageRatings.js'
import { createLifetimeRouter } from './routes/lifetime.js'
import { createNotificationsRouter } from './routes/notifications.js'
import { createPresetsRouter } from './routes/presets.js'
import { createProductsRouter } from './routes/products.js'
import { createPromptsRouter } from './routes/prompts.js'
import { createSystemRouter } from './routes/system.js'
import { createTelemetryRouter } from './routes/telemetry.js'
import { createVideosRouter } from './routes/videos.js'
import { ensureBootstrapAdminIfConfigured } from './services/auth.js'
import { scheduleAutoExport } from './services/feedbackExport.js'
import { sendError, sendSuccess } from './utils/http.js'

export interface ServerConfig {
  projectRoot: string
  dataDir: string
  spaDir?: string
}

export function createApp(config: ServerConfig): express.Express {
  const { projectRoot, dataDir, spaDir } = config

  validateServerEnv()
  initDatabase(dataDir)
  migrateJsonToSqlite(getDb(), dataDir)
  ensureBootstrapAdminIfConfigured()

  const exportDir = path.join(projectRoot, 'exports')
  scheduleAutoExport(exportDir)

  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '10mb' }))

  app.use('/uploads', express.static(path.join(projectRoot, 'uploads')))
  app.use('/outputs', express.static(path.join(projectRoot, 'outputs')))
  app.use('/avatars', express.static(path.join(projectRoot, 'avatars')))
  app.use('/avatars_generated', express.static(path.join(projectRoot, 'avatars_generated')))
  app.use('/avatars_uploads', express.static(path.join(projectRoot, 'avatars_uploads')))

  app.get('/health', (_req, res) => {
    sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString() })
  })

  // Public routes.
  app.use('/api/auth', createAuthRouter())
  app.use('/api/products', createProductsRouter())

  // Protected routes.
  app.use('/api/prompts', requireAuth, createPromptsRouter({ projectRoot }))
  app.use('/api/generate', requireAuth, createGenerateRouter({ projectRoot }))
  app.use('/api/history', requireAuth, createHistoryRouter())
  app.use('/api/system', requireAuth, createSystemRouter({ projectRoot }))
  app.use('/api/captions', requireAuth, createCaptionsRouter({ projectRoot }))
  app.use('/api/compose', requireAuth, createComposeRouter({ projectRoot }))
  app.use('/api/lifetime', requireAuth, createLifetimeRouter({ projectRoot }))
  app.use('/api/avatars', requireAuth, createAvatarsRouter({ projectRoot }))
  app.use('/api/videos', requireAuth, createVideosRouter({ projectRoot }))
  app.use('/api/presets', requireAuth, createPresetsRouter())
  app.use('/api/feedback', requireAuth, createFeedbackRouter({ projectRoot }))
  app.use('/api/notifications', requireAuth, createNotificationsRouter())
  app.use('/api/images', requireAuth, createImageRatingsRouter())
  app.use('/api/telemetry', requireAuth, createTelemetryRouter())
  app.use('/api/competitor-report', requireAuth, createCompetitorReportRouter())

  app.get('/api/settings/status', requireAuth, (_req, res) => {
    sendSuccess(res, {
      apiKeys: {
        openai: !!process.env.OPENAI_API_KEY,
        fal: !!process.env.FAL_API_KEY,
        elevenlabs: !!process.env.ELEVENLABS_API_KEY,
        hedra: !!process.env.HEDRA_API_KEY,
      },
      version: '0.2.0',
    })
  })

  if (spaDir) {
    app.use(express.static(spaDir))
    app.get('*', (req, res, next) => {
      if (
        req.path === '/api' ||
        req.path.startsWith('/api/') ||
        req.path.startsWith('/health') ||
        req.path.startsWith('/uploads/') ||
        req.path.startsWith('/outputs/') ||
        req.path.startsWith('/avatars')
      ) {
        return next()
      }
      res.sendFile(path.join(spaDir, 'index.html'))
    })
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return
    const message = error instanceof Error ? error.message : 'Unexpected server error'
    sendError(res, 500, 'Internal server error', 'INTERNAL_SERVER_ERROR', message)
  })

  return app
}
