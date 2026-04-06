import { supabase } from '../config/supabase.js'

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token is required',
      })
    }

    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      })
    }

    req.user = data.user
    next()
  } catch (error) {
    next(error)
  }
}

