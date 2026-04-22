const DEFAULT_API = 'https://dlite-core.onrender.com'
const DEFAULT_SOCKET = 'https://dlite-chatapp.onrender.com'

/**
 * Core-backend origin only (no path). Fixes common misconfig:
 * - Trailing slashes
 * - Value set to `.../chat` while code already prefixes paths with `/chat/...` (would call `/chat/chat/...`)
 */
export function normalizeCoreBackendBase(raw) {
  let s = String(raw ?? '').trim()
  if (!s) return DEFAULT_API
  s = s.replace(/\/+$/g, '')
  if (s.toLowerCase().endsWith('/chat')) {
    s = s.slice(0, -'/chat'.length).replace(/\/+$/g, '')
  }
  return s || DEFAULT_API
}

/** Socket.IO origin: no path, no trailing slash (engine uses `/socket.io` internally). */
export function normalizeSocketBase(raw, fallback = DEFAULT_SOCKET) {
  let s = String(raw ?? '').trim().replace(/\/+$/g, '')
  if (!s) return fallback
  const lower = s.toLowerCase()
  if (lower.endsWith('/socket.io')) {
    s = s.slice(0, -'/socket.io'.length).replace(/\/+$/g, '')
  }
  return s || fallback
}

export const API_BASE_URL = normalizeCoreBackendBase(process.env.NEXT_PUBLIC_API_BASE_URL)
export const CHAT_SOCKET_URL = normalizeSocketBase(process.env.NEXT_PUBLIC_CHAT_SOCKET_URL)
export const CALL_SOCKET_URL = normalizeSocketBase(
  process.env.NEXT_PUBLIC_CALL_SOCKET_URL || process.env.NEXT_PUBLIC_CHAT_SOCKET_URL,
)

export function createAuthConfigError() {
  const error = new Error('Authentication is not configured.')
  error.code = 'auth/not-configured'
  return error
}
