import { io, Socket } from 'socket.io-client'
import { CALL_SOCKET_URL } from '@/services/appClient'
import { getCurrentAuthSnapshot } from '@/services/authClient'
import { AnswerPayload, IceCandidatePayload, OfferPayload } from '@/types/call'

type CallSocket = Socket

let socketInstance: CallSocket | null = null
let callSocketKey: string | null = null

async function ensureCallSocket(userId: string): Promise<CallSocket> {
  const snap = await getCurrentAuthSnapshot().catch(() => null)
  const token = String(snap?.token || '')
  const key = `${userId}|${token}`

  if (socketInstance && callSocketKey === key) {
    return socketInstance
  }

  if (socketInstance) {
    try {
      socketInstance.removeAllListeners()
      socketInstance.disconnect()
    } catch {
      /* ignore */
    }
    socketInstance = null
    callSocketKey = null
  }

  callSocketKey = key
  const auth: Record<string, string> = { userId }
  if (token) auth.token = token

  socketInstance = io(CALL_SOCKET_URL, {
    autoConnect: true,
    transports: ['websocket'],
    auth,
  })
  return socketInstance
}

export async function startCall(params: {
  callerId: string
  calleeId: string
  offer: RTCSessionDescriptionInit
  mode: 'audio' | 'video'
}) {
  const { callerId, calleeId, offer, mode } = params
  const socket = await ensureCallSocket(callerId)
  socket.emit('call_user', {
    toUserId: calleeId,
    callType: mode,
    offer,
  })
}

export function listenForIncomingCall(userId: string, onIncoming: (payload: OfferPayload | null) => void) {
  let disposed = false
  let detach: () => void = () => undefined

  ;(async () => {
    try {
      const socket = await ensureCallSocket(userId)
      if (disposed) return

      const handler = (payload: any) => {
        if (!payload) return onIncoming(null)
        onIncoming({
          fromUserId: String(payload.fromUserId || ''),
          mode: payload.callType === 'video' ? 'video' : 'audio',
          type: 'offer',
          sdp: payload.offer?.sdp || '',
          createdAt: Date.now(),
        } as any)
      }

      socket.on('call_user', handler)
      detach = () => {
        socket.off('call_user', handler)
      }
    } catch {
      /* ignore */
    }
  })()

  return () => {
    disposed = true
    detach()
  }
}

export async function acceptCall(params: { userId: string; callerId: string; answer: RTCSessionDescriptionInit }) {
  const socket = await ensureCallSocket(params.userId)
  socket.emit('accept_call', { callId: undefined, answer: params.answer })
}

export async function rejectCall(params: { userId: string; callerId: string }) {
  const socket = await ensureCallSocket(params.userId)
  socket.emit('reject_call', { callId: undefined, reason: 'rejected' })
}

export function listenForAnswer(_userId: string, _onAnswer: (payload: AnswerPayload | null) => void) {
  return () => undefined
}

export function listenForRejection(_userId: string, _onRejected: (payload: { byUserId: string; createdAt: number } | null) => void) {
  return () => undefined
}

export async function publishIceCandidate(_params: { targetUserId: string; fromUserId: string; candidate: IceCandidatePayload }) {
  return
}

export function listenForIceCandidates(_params: { userId: string; fromUserId: string; onCandidate: (payload: IceCandidatePayload) => void }) {
  return () => undefined
}

export async function clearIceCandidates(_userId?: string, _fromUserId?: string) {
  return
}

export async function endCall(params: { userId: string; peerUserId?: string | null }) {
  const socket = await ensureCallSocket(params.userId)
  socket.emit('end_call', { callId: undefined, reason: 'ended' })
}

export async function hasActiveIncomingOffer() {
  return false
}
