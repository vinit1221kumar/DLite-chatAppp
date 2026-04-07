import { io, Socket } from 'socket.io-client'
import { CALL_SOCKET_URL } from '@/services/appClient'
import { AnswerPayload, IceCandidatePayload, OfferPayload } from '@/types/call'

type CallSocket = Socket

let socketInstance: CallSocket | null = null

function getSocket(userId: string): CallSocket {
  if (socketInstance) return socketInstance
  socketInstance = io(CALL_SOCKET_URL, {
    autoConnect: true,
    transports: ['websocket'],
    auth: { userId },
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
  const socket = getSocket(callerId)
  socket.emit('call_user', {
    toUserId: calleeId,
    callType: mode,
    offer,
  })
}

export function listenForIncomingCall(userId: string, onIncoming: (payload: OfferPayload | null) => void) {
  const socket = getSocket(userId)
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
  return () => socket.off('call_user', handler)
}

export async function acceptCall(params: { userId: string; callerId: string; answer: RTCSessionDescriptionInit }) {
  const socket = getSocket(params.userId)
  socket.emit('accept_call', { callId: undefined, answer: params.answer })
}

export async function rejectCall(params: { userId: string; callerId: string }) {
  const socket = getSocket(params.userId)
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
  const socket = getSocket(params.userId)
  socket.emit('end_call', { callId: undefined, reason: 'ended' })
}

export async function hasActiveIncomingOffer() {
  return false
}

