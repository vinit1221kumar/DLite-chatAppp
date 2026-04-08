import { isSupabaseConfigured, supabase } from '../utils/supabase.js'
import bcrypt from 'bcryptjs'
import { createLocalUser, getLocalUserByEmail } from '../utils/localAuthStore.js'
import { issueLocalTokens } from '../utils/localJwt.js'

const formatAuthResponse = (authData) => ({
  accessToken: authData.session?.access_token || null,
  refreshToken: authData.session?.refresh_token || null,
  expiresIn: authData.session?.expires_in || null,
  tokenType: authData.session?.token_type || null,
  user: authData.user || null,
})

export const signup = async (req, res, next) => {
  try {
    const { email, password, username } = req.body

    // Fallback local auth (dev/demo) when Supabase is unavailable.
    if (!isSupabaseConfigured() || !supabase) {
      const passwordHash = await bcrypt.hash(String(password), 10)
      const user = createLocalUser({ email, username, passwordHash })
      const data = issueLocalTokens(user)
      return res.status(201).json({
        success: true,
        message: 'Signup successful',
        data: formatAuthResponse(data),
      })
    }

    let data
    let error
    try {
      // Supabase creates the user and returns the authenticated session when allowed.
      const result = await supabase.auth.signUp({
        email,
        password,
        options: username
          ? {
              data: {
                username: String(username).trim(),
              },
            }
          : undefined,
      })
      data = result.data
      error = result.error
    } catch (e) {
      // If Supabase is misconfigured/unreachable (common in local Docker), don't block the app.
      const msg = String(e?.message || e)
      if (msg.toLowerCase().includes('fetch failed') || msg.toLowerCase().includes('etimedout') || msg.toLowerCase().includes('enotfound')) {
        const passwordHash = await bcrypt.hash(String(password), 10)
        const user = createLocalUser({ email, username, passwordHash })
        const localData = issueLocalTokens(user)
        return res.status(201).json({
          success: true,
          message: 'Signup successful',
          data: formatAuthResponse(localData),
        })
      }
      throw e
    }

    if (error) {
      error.status = 400
      throw error
    }

    res.status(201).json({
      success: true,
      message: 'Signup successful',
      data: formatAuthResponse(data),
    })
  } catch (error) {
    next(error)
  }
}

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body

    // Fallback local auth (dev/demo) when Supabase is unavailable.
    if (!isSupabaseConfigured() || !supabase) {
      const user = getLocalUserByEmail(email)
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' })
      }

      const ok = await bcrypt.compare(String(password), user.passwordHash)
      if (!ok) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' })
      }

      const data = issueLocalTokens(user)
      return res.json({
        success: true,
        message: 'Login successful',
        data: formatAuthResponse(data),
      })
    }

    let data
    let error
    try {
      const result = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      data = result.data
      error = result.error
    } catch (e) {
      const msg = String(e?.message || e)
      if (msg.toLowerCase().includes('fetch failed') || msg.toLowerCase().includes('etimedout') || msg.toLowerCase().includes('enotfound')) {
        // If Supabase is unreachable, attempt local auth as a fallback.
        const user = getLocalUserByEmail(email)
        if (!user) {
          return res.status(401).json({ success: false, message: 'Invalid email or password' })
        }

        const ok = await bcrypt.compare(String(password), user.passwordHash)
        if (!ok) {
          return res.status(401).json({ success: false, message: 'Invalid email or password' })
        }

        const localData = issueLocalTokens(user)
        return res.json({
          success: true,
          message: 'Login successful',
          data: formatAuthResponse(localData),
        })
      }
      throw e
    }

    if (error) {
      error.status = 401
      throw error
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: formatAuthResponse(data),
    })
  } catch (error) {
    next(error)
  }
}

export const getCurrentUser = async (req, res) => {
  res.json({
    success: true,
    message: 'Current user fetched successfully',
    data: {
      user: req.user,
    },
  })
}

export const requestEmailOtp = async (req, res, next) => {
  try {
    if (!isSupabaseConfigured() || !supabase) {
      return res.status(503).json({
        success: false,
        message: 'OTP is unavailable (Supabase not configured)',
      })
    }

    const email = String(req.body?.email || '').trim()
    if (!email) {
      return res.status(400).json({ success: false, message: 'email is required' })
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Optional: use SUPABASE_SITE_URL in Supabase dashboard too
        emailRedirectTo: req.body?.redirectTo || undefined,
      },
    })

    if (error) {
      error.status = 400
      throw error
    }

    return res.json({
      success: true,
      message: 'OTP sent to your email',
      data: { ok: true },
    })
  } catch (error) {
    next(error)
  }
}

export const verifyEmailOtp = async (req, res, next) => {
  try {
    if (!isSupabaseConfigured() || !supabase) {
      return res.status(503).json({
        success: false,
        message: 'OTP is unavailable (Supabase not configured)',
      })
    }

    const email = String(req.body?.email || '').trim()
    const token = String(req.body?.token || '').trim()
    if (!email || !token) {
      return res.status(400).json({ success: false, message: 'email and token are required' })
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })

    if (error) {
      error.status = 401
      throw error
    }

    return res.json({
      success: true,
      message: 'OTP verified',
      data: formatAuthResponse(data),
    })
  } catch (error) {
    next(error)
  }
}
