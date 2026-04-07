export async function joinVideoRoom() {
  const error = new Error('Video rooms are disabled in this build.')
  error.code = 'feature/disabled'
  throw error
}

export async function leaveVideoRoom() {
  return
}

export async function sendVideoSignal() {
  return
}

export function subscribeToVideoSignals() {
  return () => undefined
}

export function subscribeToRoomPresence() {
  return () => undefined
}
