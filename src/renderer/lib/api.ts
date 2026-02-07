import { getToken } from './auth'

let _baseUrl = ''

export async function initApi(): Promise<void> {
  try {
    if (window.api?.getServerPort) {
      const port = await window.api.getServerPort()
      _baseUrl = `http://localhost:${port}`
    }
  } catch (err) {
    console.error('[API] Failed to get server port, using proxy fallback:', err)
  }
}

export function apiUrl(path: string): string {
  return `${_baseUrl}${path}`
}

export function assetUrl(path: string): string {
  if (!path || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
    return path
  }
  return `${_baseUrl}${path}`
}

export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...options, headers })
}
