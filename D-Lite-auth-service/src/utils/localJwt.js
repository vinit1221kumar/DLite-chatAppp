import jwt from 'jsonwebtoken'

const secret = process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || 'dev-only-secret-change-me'

export function issueLocalTokens(user) {
  const nowSec = Math.floor(Date.now() / 1000)
  const expiresInSec = 60 * 60 // 1h

  const payload = {
    sub: user.id,
    email: user.email,
    user_metadata: {
      username: user.username || null,
    },
    iss: 'd-lite-auth-service',
    iat: nowSec,
  }

  const access_token = jwt.sign(payload, secret, { expiresIn: expiresInSec })
  const refresh_token = jwt.sign({ ...payload, typ: 'refresh' }, secret, { expiresIn: 60 * 60 * 24 * 30 })

  return {
    session: {
      access_token,
      refresh_token,
      expires_in: expiresInSec,
      token_type: 'bearer',
    },
    user: {
      id: user.id,
      email: user.email,
      user_metadata: {
        username: user.username || null,
      },
    },
  }
}

