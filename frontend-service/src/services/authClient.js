import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'
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
    const msg = payload?.message || payload?.error || payload?.detail || `Request failed (${res.status})`
    const err = new Error(msg)
    err.code = `http/${res.status}`
    throw err
  }
  return payload?.data ?? payload
}

export async function registerWithAuth({ username, email, password }) {
  const { raw, lower } = sanitizeUsername(username)
  if (!lower) {
    const error = new Error('Username is required.')
    error.code = 'auth/username-required'
    throw error
  }
  validateUsernameOrThrow(lower)

  // If Supabase is configured, use it directly so the browser has a real session.
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: String(email || '').trim(),
      password: String(password || ''),
      options: {
        data: { username: raw },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) throw error
    // signUp may return session null when email confirmation is required
    const session = data?.session || null
    const user = session?.user || data?.user || null
    return parseAuthResponse({ accessToken: session?.access_token || null, user })
  }

  // NOTE: Backend currently doesn’t enforce unique usernames. We return friendly client-side hints.
  // For now we generate suggestions locally if signup fails for any reason.
  try {
    const data = await requestJson('/auth/signup', { method: 'POST', body: { email, password, username: raw } })
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
  // Prefer Supabase session-based auth when configured.
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email || '').trim(),
      password: String(password || ''),
    })
    if (error) throw error
    const session = data?.session
    if (!session) {
      const err = new Error('Login failed.')
      err.code = 'auth/invalid-credential'
      throw err
    }
    return parseAuthResponse({ accessToken: session.access_token, user: session.user })
  }

  const data = await requestJson('/auth/login', { method: 'POST', body: { email, password } })
  return parseAuthResponse(data)
}

export async function loginWithGoogle() {
  if (!isSupabaseConfigured() || !supabase) {
    const error = new Error('Google sign-in is not configured.')
    error.code = 'auth/not-configured'
    throw error
  }

  const redirectTo = `${window.location.origin}/auth/callback`
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  if (error) throw error
  // Redirect happens automatically in browser; return a noop snapshot.
  return { token: null, user: null, url: data?.url }
}

export async function logoutFromAuth() {
  if (supabase) {
    await supabase.auth.signOut().catch(() => undefined)
  }
}

export async function getCurrentAuthSnapshot() {
  if (!supabase) {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('d_lite_auth_snapshot') : null
      if (!raw) return { token: null, user: null }
      const parsed = JSON.parse(raw)
      return { token: parsed?.token || null, user: parsed?.user || null }
    } catch {
      return { token: null, user: null }
    }
  }
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session) return { token: null, user: null }
  return parseAuthResponse({ accessToken: session.access_token, user: session.user })
}

export function subscribeToAuthState(handler) {
  if (!supabase) {
    handler(null)
    return () => undefined
  }
  // Emit initial
  supabase.auth.getSession().then(({ data }) => handler(data?.session?.user || null)).catch(() => handler(null))
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    handler(session?.user || null)
  })
  return () => sub?.subscription?.unsubscribe?.()
}

export async function requestLoginOtp(email) {
  const e = String(email || '').trim()
  if (!e) {
    const error = new Error('Email is required.')
    error.code = 'auth/email-required'
    throw error
  }
  await requestJson('/auth/otp/request', { method: 'POST', body: { email: e, redirectTo: `${window.location.origin}/auth/callback` } })
  return { ok: true }
}

export async function verifyLoginOtp({ email, token }) {
  const data = await requestJson('/auth/otp/verify', { method: 'POST', body: { email, token } })
  return parseAuthResponse(data)
}

