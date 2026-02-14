import { getToken } from './auth'

const ENV_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '')
let _baseUrl = ENV_BASE_URL

type ApiEnvelope<T> = {
  success?: boolean
  data?: T
  error?: string
  details?: string
}

export async function initApi(): Promise<void> {
  if (_baseUrl) return
  _baseUrl = ''
}

export function apiUrl(path: string): string {
  return `${_baseUrl}${path}`
}

export function assetUrl(path: string): string {
  if (
    !path ||
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
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

export function unwrapApiData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as ApiEnvelope<T>).data as T
  }
  return payload as T
}

export function getApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const p = payload as ApiEnvelope<unknown>
  if (typeof p.details === 'string' && p.details.trim()) return p.details
  if (typeof p.error === 'string' && p.error.trim()) return p.error
  return fallback
}
