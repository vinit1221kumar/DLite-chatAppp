export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000'
export const CHAT_SOCKET_URL = process.env.NEXT_PUBLIC_CHAT_SOCKET_URL || 'http://localhost:4002'
export const CALL_SOCKET_URL = process.env.NEXT_PUBLIC_CALL_SOCKET_URL || 'http://localhost:4003'

export function createAuthConfigError() {
  const error = new Error('Authentication is not configured.')
  error.code = 'auth/not-configured'
  return error
}

