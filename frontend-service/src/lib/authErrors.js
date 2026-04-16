export function toAuthErrorMessage(error, mode = 'generic') {
  const code = error?.code || ''
  const message = error?.message || ''

  if (code === 'auth/not-configured') {
    return 'Authentication is not configured. Frontend can run, but sign-in is disabled until required environment values are set.'
  }

  if (code === 'auth/invalid-api-key') {
    return 'Auth config is missing or invalid. Fill the required environment values and restart the dev server.'
  }

  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in is disabled. Enable the Google provider in your auth console.'
  }

  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized for sign-in. Add your domain to the authorized domains list in your auth provider.'
  }

  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked by the browser. Allow popups for this site and try again.'
  }

  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in popup was closed before completing authentication.'
  }

  if (code === 'auth/cancelled-popup-request') {
    return 'Google sign-in popup request was cancelled. Try again.'
  }

  if (code === 'auth/network-request-failed') {
    return 'Network error while contacting the auth provider. Check your internet connection and try again.'
  }

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    if (mode === 'login') return 'Invalid email or password.'
    return 'Authentication failed. Please check your credentials.'
  }

  if (code === 'auth/email-already-in-use') {
    return 'This email is already registered. Try logging in instead.'
  }

  if (code === 'auth/weak-password') {
    return 'Password is too weak. Use at least 6 characters.'
  }

  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a bit and try again.'
  }

  if (code === 'auth/username-required') {
    return 'Username is required.'
  }

  if (code === 'auth/invalid-username') {
    return 'Username must be 3–20 characters and use only letters, numbers, or underscores.'
  }

  if (code === 'auth/username-taken') {
    return 'This username is already taken.'
  }

  if (code === 'auth/email-required') {
    return 'Email is required.'
  }

  if (mode === 'google') return 'Google sign-in failed. Please try again.'
  if (mode === 'register' || mode === 'login') {
    // Backend validation errors often come back as HTTP 400 with `detail` text.
    // Preserve that real message so the user knows what to fix.
    if (message) return message
    return mode === 'register' ? 'Registration failed. Please try again.' : 'Login failed. Please try again.'
  }

  return 'Authentication failed. Please try again.'
}
