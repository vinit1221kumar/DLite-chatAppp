const GATEWAY_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'

function sanitizeUsername(value) {
  const raw = String(value || '').trim()
  const lower = raw.toLowerCase()
  return { raw, lower }
}

function validateUsernameOrThrow(usernameLower) {
  const u = String(usernameLower || '')
  const ok = /^[a-z0-9_]{3,20}$/.test(u)
  if (!ok) {
    const error = new Error('Invalid username')
    error.code = 'auth/invalid-username'
    throw error
  }
}

function parseAuthResponse(data) {
  const accessToken = data?.accessToken || data?.access_token || null
  const user = data?.user || null
  // D-LITE frontend expects `user.username` for display. Supabase user may not have it.
  return {
    token: accessToken,
    user: user
      ? {
          id: user.id,
          uid: user.id,
          email: user.email || '',
          username: user.user_metadata?.username || user.email?.split('@')[0] || 'User',
          photoURL: user.user_metadata?.avatar_url || '',
        }
      : null,
  }
}

async function requestJson(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${GATEWAY_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok || payload?.success === false) {
    const msg = payload?.message || payload?.error || `Request failed (${res.status})`
    const err = new Error(msg)
    err.code = `http/${res.status}`
    throw err
  }
  return payload?.data ?? payload
}

// Username uniqueness is enforced in Supabase by storing it in user_metadata.
// If you want strict global uniqueness, enforce it with a unique table/constraint in Supabase.
export async function registerWithAuth({ username, email, password }) {
  const { raw, lower } = sanitizeUsername(username)
  if (!lower) {
    const error = new Error('Username is required.')
    error.code = 'auth/username-required'
    throw error
  }
  validateUsernameOrThrow(lower)

  // NOTE: Backend currently doesn’t enforce unique usernames. We return friendly client-side hints.
  // For now we generate suggestions locally if signup fails for any reason.
  try {
    const data = await requestJson('/auth/signup', { method: 'POST', body: { email, password } })
    const parsed = parseAuthResponse(data)
    return parsed
  } catch (e) {
    if (String(e?.message || '').toLowerCase().includes('username')) {
      e.code = 'auth/username-taken'
      e.suggestions = [`${lower}_01`, `${lower}_02`, `${lower}_03`]
    }
    throw e
  }
}

export async function loginWithAuth({ email, password }) {
  const data = await requestJson('/auth/login', { method: 'POST', body: { email, password } })
  return parseAuthResponse(data)
}

export async function loginWithGoogle() {
  const error = new Error('Google sign-in via backend is not implemented yet.')
  error.code = 'auth/operation-not-allowed'
  throw error
}

export async function logoutFromAuth() {
  return
}

export async function getCurrentAuthSnapshot() {
  return { token: null, user: null }
}

export function subscribeToAuthState(handler) {
  handler(null)
  return () => undefined
}

