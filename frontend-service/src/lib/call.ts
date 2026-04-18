import { io, Socket } from 'socket.io-client'
import { createSocketIoClientOptions, waitForDomReady } from '@/lib/socketIoClientOptions'
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

  await waitForDomReady()
  socketInstance = io(CALL_SOCKET_URL, createSocketIoClientOptions(auth))
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
    offer: offer.type && offer.sdp ? { type: offer.type, sdp: offer.sdp } : offer,
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
        if (!payload) {
          onIncoming(null)
          return
        }
        const offerObj = payload.offer || {}
        const sdp = String(offerObj.sdp || '')
        const type = offerObj.type as RTCSdpType | undefined
        if (!sdp || !type) return
        onIncoming({
          fromUserId: String(payload.fromUserId || ''),
          mode: payload.callType === 'video' ? 'video' : 'audio',
          type: 'offer',
          sdp,
          createdAt: Date.now(),
        } as OfferPayload)
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

export function listenForAnswer(
  userId: string,
  onAnswer: (payload: AnswerPayload | null) => void,
  filter?: { fromUserId?: string }
) {
  let disposed = false
  let detach: () => void = () => undefined

  ;(async () => {
    try {
      const socket = await ensureCallSocket(userId)
      if (disposed) return

      const handler = (payload: any) => {
        if (!payload) return
        const fromUserId = String(payload.fromUserId || '')
        if (filter?.fromUserId && fromUserId !== filter.fromUserId) return
        const ans = payload.answer || {}
        const sdp = String(ans.sdp || '')
        const type = ans.type as RTCSdpType | undefined
        if (!sdp || !type) return
        onAnswer({
          fromUserId,
          type,
          sdp,
          createdAt: Date.now(),
        })
      }

      socket.on('call_answer', handler)
      detach = () => {
        socket.off('call_answer', handler)
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

export function listenForRejection(
  userId: string,
  onRejected: (payload: { byUserId: string; createdAt: number } | null) => void,
  filter?: { fromUserId?: string }
) {
  let disposed = false
  let detach: () => void = () => undefined

  ;(async () => {
    try {
      const socket = await ensureCallSocket(userId)
      if (disposed) return

      const handler = (payload: any) => {
        if (!payload) return
        const fromUserId = String(payload.fromUserId || '')
        if (filter?.fromUserId && fromUserId !== filter.fromUserId) return
        onRejected({ byUserId: fromUserId, createdAt: Date.now() })
      }

      socket.on('call_rejected', handler)
      detach = () => {
        socket.off('call_rejected', handler)
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

export function listenForCallEnded(
  userId: string,
  onEnded: (payload: { fromUserId: string; reason: string } | null) => void,
  filter?: { fromUserId?: string }
) {
  let disposed = false
  let detach: () => void = () => undefined

  ;(async () => {
    try {
      const socket = await ensureCallSocket(userId)
      if (disposed) return

      const handler = (payload: any) => {
        if (!payload) return
        const fromUserId = String(payload.fromUserId || '')
        if (filter?.fromUserId && fromUserId !== filter.fromUserId) return
        onEnded({
          fromUserId,
          reason: String(payload.reason || 'ended'),
        })
      }

      socket.on('call_ended', handler)
      detach = () => {
        socket.off('call_ended', handler)
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
  const a = params.answer
  socket.emit('accept_call', {
    toUserId: params.callerId,
    answer: a?.type && a?.sdp ? { type: a.type, sdp: a.sdp } : a,
  })
}

export async function rejectCall(params: { userId: string; callerId: string }) {
  const socket = await ensureCallSocket(params.userId)
  socket.emit('reject_call', { toUserId: params.callerId, reason: 'rejected' })
}

export async function publishIceCandidate(params: {
  targetUserId: string
  fromUserId: string
  candidate: IceCandidatePayload
}) {
  const { targetUserId, fromUserId, candidate } = params
  const socket = await ensureCallSocket(fromUserId)
  socket.emit('ice_candidate', {
    toUserId: targetUserId,
    candidate: {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
      usernameFragment: candidate.usernameFragment ?? null,
    },
  })
}

export function listenForIceCandidates(params: {
  userId: string
  fromUserId: string
  onCandidate: (payload: IceCandidatePayload) => void
}) {
  const { userId, fromUserId, onCandidate } = params
  let disposed = false
  let detach: () => void = () => undefined

  ;(async () => {
    try {
      const socket = await ensureCallSocket(userId)
      if (disposed) return

        const handler = (payload: any) => {
        if (!payload) return
        const fid = String(payload.fromUserId || '')
        if (fid !== fromUserId) return
        const c = payload.candidate || {}
        const cand = String(c.candidate ?? '')
        if (!cand) return
        onCandidate({
          fromUserId: fid,
          candidate: cand,
          sdpMid: c.sdpMid ?? null,
          sdpMLineIndex: c.sdpMLineIndex ?? null,
          usernameFragment: c.usernameFragment ?? null,
          createdAt: Date.now(),
        })
      }

      socket.on('call_ice_candidate', handler)
      detach = () => {
        socket.off('call_ice_candidate', handler)
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

export async function clearIceCandidates(_userId?: string, _fromUserId?: string) {
  return
}

export async function endCall(params: { userId: string; peerUserId?: string | null }) {
  const socket = await ensureCallSocket(params.userId)
  const peer = params.peerUserId?.trim()
  if (peer) {
    socket.emit('end_call', { toUserId: peer, reason: 'ended' })
  }
}

export async function hasActiveIncomingOffer() {
  return false
}
