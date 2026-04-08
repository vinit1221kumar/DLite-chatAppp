const usersByEmail = new Map()
const usersByUsername = new Map()

export function getLocalUserByEmail(email) {
  if (!email) return null
  return usersByEmail.get(String(email).toLowerCase()) || null
}

export function createLocalUser({ email, username, passwordHash }) {
  const normalizedEmail = String(email).toLowerCase()
  const normalizedUsername = username ? String(username).trim().toLowerCase() : null

  if (usersByEmail.has(normalizedEmail)) {
    const err = new Error('User already registered')
    err.status = 409
    throw err
  }

  if (normalizedUsername && usersByUsername.has(normalizedUsername)) {
    const err = new Error('Username already taken')
    err.status = 409
    throw err
  }

  const user = {
    id: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    email: normalizedEmail,
    username: username ? String(username).trim() : null,
    passwordHash,
    createdAt: new Date().toISOString(),
  }

  usersByEmail.set(normalizedEmail, user)
  if (normalizedUsername) usersByUsername.set(normalizedUsername, user)

  return user
}

