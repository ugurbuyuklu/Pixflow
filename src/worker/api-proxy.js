const DEFAULT_PROXY_PREFIXES = [
  '/api',
  '/health',
  '/uploads',
  '/outputs',
  '/avatars',
  '/avatars_generated',
  '/avatars_uploads',
]
const DEFAULT_UPSTREAM_TIMEOUT_MS = 610_000
const CORS_METHODS = 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS'
const CORS_HEADERS = 'Authorization,Content-Type,X-Requested-With'

function parseCsv(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseProxyPrefixes(raw) {
  if (!raw || typeof raw !== 'string') return DEFAULT_PROXY_PREFIXES
  const parsed = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith('/') ? item : `/${item}`))
  return parsed.length > 0 ? parsed : DEFAULT_PROXY_PREFIXES
}

function shouldProxyPath(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function resolveAllowedOrigin(origin, rawAllowedOrigins) {
  if (!origin) return null
  const allowed = parseCsv(rawAllowedOrigins)
  if (allowed.length === 0) return origin
  if (allowed.includes('*')) return origin
  return allowed.includes(origin) ? origin : null
}

function parseTimeoutMs(rawTimeout) {
  const parsed = Number(rawTimeout)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_UPSTREAM_TIMEOUT_MS
  return parsed
}

function includesEventStream(rawValue) {
  return typeof rawValue === 'string' && rawValue.toLowerCase().includes('text/event-stream')
}

function withCorsHeaders(response, allowedOrigin, isSse) {
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
  headers.set('X-Pixflow-Gateway', 'cloudflare-worker')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function json(status, body, allowedOrigin) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Pixflow-Gateway': 'cloudflare-worker',
  })
  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin)
    headers.set('Access-Control-Allow-Methods', CORS_METHODS)
    headers.set('Access-Control-Allow-Headers', CORS_HEADERS)
    headers.set('Vary', 'Origin')
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
  })
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url)
    const origin = request.headers.get('Origin')
    const allowedOrigin = resolveAllowedOrigin(origin, env.ALLOWED_ORIGINS)
    const proxyPrefixes = parseProxyPrefixes(env.PROXY_PATH_PREFIXES)
    const upstreamTimeoutMs = parseTimeoutMs(env.UPSTREAM_TIMEOUT_MS)
    const clientExpectsSse = includesEventStream(request.headers.get('accept'))

    if (request.method === 'OPTIONS') {
      if (origin && !allowedOrigin) {
        return json(
          403,
          {
            success: false,
            error: 'Origin is not allowed',
          },
          null,
        )
      }
      const preflightHeaders = new Headers({
        'X-Pixflow-Gateway': 'cloudflare-worker',
      })
      if (allowedOrigin) {
        preflightHeaders.set('Access-Control-Allow-Origin', allowedOrigin)
        preflightHeaders.set('Access-Control-Allow-Methods', CORS_METHODS)
        preflightHeaders.set('Access-Control-Allow-Headers', CORS_HEADERS)
        preflightHeaders.set('Access-Control-Max-Age', '86400')
        preflightHeaders.set('Vary', 'Origin')
      }
      return new Response(null, { status: 204, headers: preflightHeaders })
    }

    if (origin && !allowedOrigin) {
      return json(
        403,
        {
          success: false,
          error: 'Origin is not allowed',
        },
        null,
      )
    }

    if (!shouldProxyPath(requestUrl.pathname, proxyPrefixes)) {
      return json(
        404,
        {
          success: false,
          error: 'Route is not handled by API gateway',
          details: {
            path: requestUrl.pathname,
          },
        },
        allowedOrigin,
      )
    }

    const backendOriginRaw = env.BACKEND_ORIGIN
    if (!backendOriginRaw) {
      return json(
        500,
        {
          success: false,
          error: 'BACKEND_ORIGIN is not configured',
        },
        allowedOrigin,
      )
    }

    const backendOrigin = backendOriginRaw.endsWith('/') ? backendOriginRaw.slice(0, -1) : backendOriginRaw

    const proxyUrl = `${backendOrigin}${requestUrl.pathname}${requestUrl.search}`
    const upstreamHeaders = new Headers(request.headers)
    upstreamHeaders.delete('host')
    upstreamHeaders.set('x-forwarded-host', requestUrl.host)
    upstreamHeaders.set('x-forwarded-proto', requestUrl.protocol.replace(':', ''))
    if (clientExpectsSse) {
      upstreamHeaders.set('accept', 'text/event-stream')
      upstreamHeaders.set('cache-control', 'no-cache')
    }

    const upstreamRequest = new Request(proxyUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'follow',
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), upstreamTimeoutMs)

    try {
      const upstreamResponse = await fetch(upstreamRequest, {
        signal: controller.signal,
      })
      const upstreamIsSse = includesEventStream(upstreamResponse.headers.get('content-type'))
      return withCorsHeaders(upstreamResponse, allowedOrigin, clientExpectsSse || upstreamIsSse)
    } catch (error) {
      const isTimeout = controller.signal.aborted
      return json(
        isTimeout ? 504 : 502,
        {
          success: false,
          error: isTimeout ? `Gateway upstream timeout after ${upstreamTimeoutMs}ms` : 'Gateway upstream fetch failed',
          details: error instanceof Error ? error.message : String(error),
        },
        allowedOrigin,
      )
    } finally {
      clearTimeout(timeoutId)
    }
  },
}
