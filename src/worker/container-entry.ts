import { Container, getContainer } from '@cloudflare/containers'

interface Env {
  PIXFLOW_BACKEND: DurableObjectNamespace
  PROXY_PATH_PREFIXES?: string
  ALLOWED_ORIGINS?: string
  JWT_SECRET?: string
  OPENAI_API_KEY?: string
  FAL_API_KEY?: string
  KLING_API_KEY?: string
  HEDRA_API_KEY?: string
  ELEVENLABS_API_KEY?: string
  PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP?: string
  PIXFLOW_BOOTSTRAP_ADMIN_EMAIL?: string
  PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD?: string
  PIXFLOW_BOOTSTRAP_ADMIN_NAME?: string
  PIXFLOW_AUTH_MODE?: string
}

// ---- Container Durable Object ----

export class PixflowBackend extends Container<Env> {
  defaultPort = 3001
  sleepAfter = '2h'

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const vars: Record<string, string> = {
      PORT: '3001',
      NODE_ENV: 'production',
      FFMPEG_PATH: '/usr/bin/ffmpeg',
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium',
    }
    if (env.JWT_SECRET) vars.JWT_SECRET = env.JWT_SECRET
    if (env.OPENAI_API_KEY) vars.OPENAI_API_KEY = env.OPENAI_API_KEY
    if (env.FAL_API_KEY) vars.FAL_API_KEY = env.FAL_API_KEY
    if (env.KLING_API_KEY) vars.KLING_API_KEY = env.KLING_API_KEY
    if (env.HEDRA_API_KEY) vars.HEDRA_API_KEY = env.HEDRA_API_KEY
    if (env.ELEVENLABS_API_KEY) vars.ELEVENLABS_API_KEY = env.ELEVENLABS_API_KEY
    if (env.PIXFLOW_AUTH_MODE) vars.PIXFLOW_AUTH_MODE = env.PIXFLOW_AUTH_MODE
    if (env.PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP) {
      vars.PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP = env.PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP
      if (env.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL) vars.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL = env.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL
      if (env.PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD)
        vars.PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD = env.PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD
      if (env.PIXFLOW_BOOTSTRAP_ADMIN_NAME) vars.PIXFLOW_BOOTSTRAP_ADMIN_NAME = env.PIXFLOW_BOOTSTRAP_ADMIN_NAME
    }
    this.envVars = vars
  }

  override onStart() {
    console.log('[PixflowBackend] Container started')
  }

  override onStop() {
    console.log('[PixflowBackend] Container stopped')
  }

  override onError(error: unknown) {
    console.error('[PixflowBackend] Container error:', error)
    throw error
  }
}

// ---- CORS / path-filter helpers (ported from api-proxy.js) ----

const UPSTREAM_TIMEOUT_MS = 610_000
const DEFAULT_PROXY_PREFIXES = [
  '/api',
  '/health',
  '/uploads',
  '/outputs',
  '/avatars',
  '/avatars_generated',
  '/avatars_uploads',
]
const CORS_METHODS = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS'
const CORS_HEADERS = 'Authorization,Content-Type,X-Requested-With'

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseProxyPrefixes(raw: string | undefined): string[] {
  if (!raw) return DEFAULT_PROXY_PREFIXES
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith('/') ? s : `/${s}`))
  return parsed.length > 0 ? parsed : DEFAULT_PROXY_PREFIXES
}

function shouldProxy(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function resolveAllowedOrigin(origin: string | null, raw: string | undefined): string | null {
  if (!origin) return null
  const allowed = parseCsv(raw)
  if (allowed.length === 0) return origin
  if (allowed.includes('*')) return origin
  return allowed.includes(origin) ? origin : null
}

function includesEventStream(value: string | null): boolean {
  return typeof value === 'string' && value.toLowerCase().includes('text/event-stream')
}

function withCors(response: Response, allowedOrigin: string | null, isSse: boolean): Response {
  const headers = new Headers(response.headers)
  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin)
    headers.set('Access-Control-Allow-Methods', CORS_METHODS)
    headers.set('Access-Control-Allow-Headers', CORS_HEADERS)
  }
  if (isSse) {
    headers.set('Cache-Control', 'no-cache, no-transform')
    headers.set('X-Accel-Buffering', 'no')
  }
  headers.set('Vary', headers.get('Vary') ? `${headers.get('Vary')}, Origin` : 'Origin')
  headers.set('X-Pixflow-Gateway', 'cloudflare-container')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function json(status: number, body: unknown, allowedOrigin: string | null): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', 'X-Pixflow-Gateway': 'cloudflare-container' })
  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin)
    headers.set('Access-Control-Allow-Methods', CORS_METHODS)
    headers.set('Access-Control-Allow-Headers', CORS_HEADERS)
    headers.set('Vary', 'Origin')
  }
  return new Response(JSON.stringify(body), { status, headers })
}

// ---- Worker fetch handler ----

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')
    const allowedOrigin = resolveAllowedOrigin(origin, env.ALLOWED_ORIGINS)
    const prefixes = parseProxyPrefixes(env.PROXY_PATH_PREFIXES)
    const clientExpectsSse = includesEventStream(request.headers.get('accept'))

    if (request.method === 'OPTIONS') {
      if (origin && !allowedOrigin) {
        return json(403, { success: false, error: 'Origin is not allowed' }, null)
      }
      const h = new Headers({ 'X-Pixflow-Gateway': 'cloudflare-container' })
      if (allowedOrigin) {
        h.set('Access-Control-Allow-Origin', allowedOrigin)
        h.set('Access-Control-Allow-Methods', CORS_METHODS)
        h.set('Access-Control-Allow-Headers', CORS_HEADERS)
        h.set('Access-Control-Max-Age', '86400')
        h.set('Vary', 'Origin')
      }
      return new Response(null, { status: 204, headers: h })
    }

    if (origin && !allowedOrigin) {
      return json(403, { success: false, error: 'Origin is not allowed' }, null)
    }

    if (!shouldProxy(url.pathname, prefixes)) {
      return json(
        404,
        { success: false, error: 'Route is not handled by API gateway', details: { path: url.pathname } },
        allowedOrigin,
      )
    }

    const container = getContainer(env.PIXFLOW_BACKEND, 'main')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

    try {
      const proxied = new Request(request, { signal: controller.signal })
      const upstream = await container.fetch(proxied)
      const upstreamIsSse = includesEventStream(upstream.headers.get('content-type'))
      return withCors(upstream, allowedOrigin, clientExpectsSse || upstreamIsSse)
    } catch (error) {
      const isTimeout = controller.signal.aborted
      return json(
        isTimeout ? 504 : 502,
        {
          success: false,
          error: isTimeout
            ? `Gateway upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`
            : 'Container upstream fetch failed',
          details: error instanceof Error ? error.message : String(error),
        },
        allowedOrigin,
      )
    } finally {
      clearTimeout(timeoutId)
    }
  },
}
