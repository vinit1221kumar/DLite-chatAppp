import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

const looksLikePlaceholder = (value) => {
  if (!value) return true
  const v = String(value).trim()
  if (!v) return true
  if (v.includes('your-project-id') || v.includes('your-supabase-anon-key')) return true
  // Common placeholders people paste while testing.
  if (v.includes('xxxx.supabase.co') || v.includes('example.supabase.co')) return true
  // Truncated keys like "eyJ......"
  if (/\.\.\./.test(v) || /\.{5,}/.test(v)) return true
  return false
}

export const isSupabaseConfigured = () => Boolean(!looksLikePlaceholder(supabaseUrl) && !looksLikePlaceholder(supabaseAnonKey))

// The anon key is enough for normal client-style auth flows such as signup/login/getUser.
export const supabase = isSupabaseConfigured() ? createClient(supabaseUrl, supabaseAnonKey) : null
