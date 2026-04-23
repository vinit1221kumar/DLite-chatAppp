import { io } from 'socket.io-client'
import { createSocketIoClientOptions, waitForDomReady } from '@/lib/socketIoClientOptions'
import { API_BASE_URL, CHAT_SOCKET_URL } from './appClient'
import { getCurrentAuthSnapshot } from './authClient'

let socketInstance = null
let lastChatSocketAuthKey = ''
const unsubRef = new Map()

function jwtClaimsUserId(token) {
  try {
    const parts = String(token || '').split('.')
    if (parts.length < 2) return null
    const payload = parts[1]
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    const uid = json?.id ?? json?.sub ?? json?.user_id ?? json?.userId
    return uid ? String(uid).trim() : null
  } catch {
    return null
  }
}

async function authedSocketOptions({ userId } = {}) {
  const snapshot = await getCurrentAuthSnapshot().catch(() => null)
  const token = String(snapshot?.token || '').trim()
  const uid = String(userId || snapshot?.user?.id || snapshot?.user?.uid || '').trim()
  if (!uid) {
    return { userId: undefined, token: undefined }
  }
  if (!token) {
    return { userId: uid, token: undefined }
  }
  const tokenUid = jwtClaimsUserId(token)
  if (tokenUid && tokenUid !== uid) {
    throw new Error('Auth token does not match socket userId; sign in again.')
  }
  return { userId: uid, token }
}

function chatSocketAuthKey(auth) {
  const uid = String(auth?.userId || '')
  const tok = String(auth?.token || '')
  return `${uid}|${tok}`
}

function parseChatSocketKey(key) {
  const k = String(key || '')
  const i = k.indexOf('|')
  if (i <= 0) return { uid: '', token: '' }
  return { uid: k.slice(0, i), token: k.slice(i + 1) }
}

async function getSocket({ userId } = {}) {
  const auth = await authedSocketOptions({ userId })
  if (!auth?.userId) {
    if (socketInstance) {
      try {
        socketInstance.removeAllListeners()
        socketInstance.disconnect()
      } catch {
        /* ignore */
      }
      socketInstance = null
    }
    lastChatSocketAuthKey = ''
    throw new Error('Chat socket requires userId')
  }
  if (!auth?.token) {
    throw new Error('Chat socket requires auth token')
  }
  const key = chatSocketAuthKey(auth)
  if (socketInstance && lastChatSocketAuthKey === key) {
    return socketInstance
  }

  const prev = lastChatSocketAuthKey ? parseChatSocketKey(lastChatSocketAuthKey) : { uid: '', token: '' }
  const sameUserTokenRefresh =
    socketInstance && prev.uid && prev.uid === auth.userId && prev.token !== auth.token

  if (sameUserTokenRefresh) {
    try {
      socketInstance.auth = { userId: auth.userId, token: auth.token }
      socketInstance.disconnect()
      socketInstance.connect()
      lastChatSocketAuthKey = key
      return socketInstance
    } catch {
      try {
        socketInstance.removeAllListeners()
        socketInstance.disconnect()
      } catch {
        /* ignore */
      }
      socketInstance = null
      lastChatSocketAuthKey = ''
    }
  }

  if (socketInstance) {
    try {
      socketInstance.removeAllListeners()
      socketInstance.disconnect()
    } catch {
      /* ignore */
    }
    socketInstance = null
  }
  lastChatSocketAuthKey = key
  await waitForDomReady()
  socketInstance = io(
    CHAT_SOCKET_URL,
    createSocketIoClientOptions(auth?.userId ? auth : undefined),
  )
  socketInstance.on('socket_error', (e) => {
    // eslint-disable-next-line no-console
    console.warn('[chat-socket] server error', e)
  })
  return socketInstance
}

function safeUserProfile(userId) {
  const id = String(userId || '').trim()
  return { id, uid: id, username: id || 'User', email: '', photoURL: '' }
}

export function initializeMyPresence() {
  let cancelled = false
  let detach = () => undefined

  ;(async () => {
    const snapshot = await getCurrentAuthSnapshot().catch(() => null)
    const uid = String(snapshot?.user?.id || snapshot?.user?.uid || '').trim()
    if (!uid || cancelled) return

    let s
    try {
      s = await getSocket({ userId: uid })
    } catch {
      return
    }
    if (!s || cancelled) return

    // Make online/offline reliable on tab close / navigation.
    const disconnectNow = () => {
      try {
        s.disconnect()
      } catch {
        /* ignore */
      }
    }

    const onPageHide = () => disconnectNow()
    const onBeforeUnload = () => disconnectNow()

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide)
      window.addEventListener('beforeunload', onBeforeUnload)
    }

    detach = () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide)
        window.removeEventListener('beforeunload', onBeforeUnload)
      }
      disconnectNow()
    }
  })()

  return () => {
    cancelled = true
    detach()
  }
}

export async function getUserProfileById(userId) {
  return safeUserProfile(userId)
}

export async function searchUsersByUsername(_term, _excludeUserId) {
  const term = String(_term || '').trim()
  if (!term) return []
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return []
  const url = new URL(`${API_BASE_URL}/chat/users/search`)
  url.searchParams.set('username', term)
  if (_excludeUserId) url.searchParams.set('exclude', String(_excludeUserId))
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${snapshot.token}` } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) return []
  return json?.users || []
}

export async function listDirectMessages() {
  const myId = String(arguments?.[0] || '').trim()
  const peerId = String(arguments?.[1] || '').trim()
  if (!myId || !peerId) return []
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return []

  const res = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ peerId }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) return []

  const chatId = String(json?.chatId || '').trim()
  if (!chatId) return []
  const rows = await getMessagesByChatId({ chatId, token: snapshot.token })
  return rows.map((m) => ({
    _id: String(m.id || m._id || ''),
    chatId: m.chat_id || m.chatId || chatId,
    senderId: m.sender_id || m.senderId || '',
    content: m.content || '',
    type: m.type || 'text',
    createdAt: m.created_at ? Date.parse(m.created_at) : Number(m.createdAt || Date.now()),
    reactions: m.reactions || {},
    isDeleted: false,
  }))
}

export function subscribeDirectMessages(_userId, chatId, callback) {
  const peerId = String(chatId || '').trim() // legacy UI passes peerId here
  let activeChatId = ''
  let unsub = () => undefined

  ;(async () => {
    const snapshot = await getCurrentAuthSnapshot().catch(() => null)
    if (!snapshot?.token || !peerId) return
    let s
    try {
      s = await getSocket({ userId: _userId })
    } catch {
      return
    }

    const r = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
      body: JSON.stringify({ peerId }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j?.success === false) return
    activeChatId = String(j?.chatId || '').trim()
    if (!activeChatId) return

    s.emit('join_chat', { chatId: activeChatId })
    const handler = (message) => {
      if (!message) return
      const msgChat = String(message.chatId || message.chat_id || '').trim()
      if (msgChat && activeChatId && msgChat !== activeChatId) return
      callback(
        {
          _id: String(message._id || message.id || ''),
          chatId: activeChatId,
          senderId: message.senderId || message.sender_id || '',
          content: message.content || '',
          type: message.type || 'text',
          createdAt: Number(message.createdAt || Date.now()),
          isDeleted: false,
        },
        'added'
      )
    }
    const onUpdated = (p) => {
      const cid = String(p?.chatId || '').trim()
      if (cid !== activeChatId) return
      const m = p?.message || {}
      const id = String(m?._id || m?.id || '').trim()
      if (!id) return
      callback(
        {
          _id: id,
          chatId: activeChatId,
          senderId: m.senderId || m.sender_id || '',
          content: m.content || '',
          type: m.type || 'text',
          createdAt: Number(m.createdAt || m.created_at || Date.now()),
          reactions: m.reactions || undefined,
          isDeleted: Boolean(m.isDeleted || m.is_deleted),
        },
        'changed'
      )
    }
    const onDeleted = (p) => {
      const cid = String(p?.chatId || '').trim()
      if (cid !== activeChatId) return
      const id = String(p?.messageId || p?._id || '').trim()
      if (!id) return
      callback({ _id: id, chatId: activeChatId }, 'removed')
    }
    const onReaction = (p) => {
      const cid = String(p?.chatId || '').trim()
      if (cid !== activeChatId) return
      const id = String(p?.messageId || '').trim()
      if (!id) return
      callback({ _id: id, chatId: activeChatId, reactions: p?.reactions || {} }, 'changed')
    }
    s.on('receive_message', handler)
    s.on('message_updated', onUpdated)
    s.on('message_deleted', onDeleted)
    s.on('reaction_updated', onReaction)
    unsub = () => {
      s.off('receive_message', handler)
      s.off('message_updated', onUpdated)
      s.off('message_deleted', onDeleted)
      s.off('reaction_updated', onReaction)
    }
  })()

  return () => unsub()
}

export async function sendDirectMessage({ chatId, senderId, content, type }) {
  const receiverId = String(arguments?.[0]?.receiverId || arguments?.[0]?.peerId || '').trim()
  const onLocalEvent = typeof arguments?.[0]?.onLocalEvent === 'function' ? arguments[0].onLocalEvent : null
  const providedOptimisticId = String(arguments?.[0]?.optimisticId || '').trim()
  const providedOptimisticCreatedAt = Number(arguments?.[0]?.optimisticCreatedAt || 0)
  const optimisticAlreadyAdded = Boolean(arguments?.[0]?.optimisticAlreadyAdded)
  const initialChatId = String(chatId || arguments?.[0]?.chatId || '').trim()
  const sender = String(senderId || '').trim()
  const text = String(content || '').trim()
  if (!sender || !receiverId || !text) return
  const msgType = String(type || arguments?.[0]?.type || 'text').trim() || 'text'

  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')

  const optimisticId = providedOptimisticId || `tmp-${sender}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const optimisticCreatedAt = providedOptimisticCreatedAt > 0 ? providedOptimisticCreatedAt : Date.now()
  if (onLocalEvent && !optimisticAlreadyAdded) {
    onLocalEvent({
      changeType: 'added',
      message: {
        _id: optimisticId,
        chatId: initialChatId,
        senderId: sender,
        content: text,
        type: msgType,
        createdAt: optimisticCreatedAt,
        isDeleted: false,
        isPending: true,
      },
    })
  }

  // Ensure DM chat exists and both members are linked in Supabase
  const rEnsure = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ peerId: receiverId }),
  })
  const jEnsure = await rEnsure.json().catch(() => ({}))
  if (!rEnsure.ok || jEnsure?.success === false) {
    if (onLocalEvent) {
      onLocalEvent({ changeType: 'removed', message: { _id: optimisticId } })
    }
    throw new Error(jEnsure?.message || 'Could not open chat')
  }
  const realChatId = String(jEnsure?.chatId || '').trim()
  if (!realChatId) {
    if (onLocalEvent) {
      onLocalEvent({ changeType: 'removed', message: { _id: optimisticId } })
    }
    throw new Error('Could not open chat')
  }
  if (onLocalEvent && !initialChatId) {
    const patch = { _id: optimisticId, chatId: realChatId, isPending: true }
    if (!optimisticAlreadyAdded) {
      patch.content = text
      patch.type = msgType
      patch.senderId = sender
      patch.createdAt = optimisticCreatedAt
    }
    onLocalEvent({ changeType: 'changed', message: patch })
  }

  // Persist first (history + canonical ids), then broadcast realtime
  const rSend = await fetch(`${API_BASE_URL}/chat/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ chatId: realChatId, content: text, type: msgType }),
  })
  const jSend = await rSend.json().catch(() => ({}))
  if (!rSend.ok || jSend?.success === false) {
    if (onLocalEvent) {
      onLocalEvent({ changeType: 'removed', message: { _id: optimisticId, chatId: realChatId } })
    }
    throw new Error(jSend?.message || 'Could not send')
  }
  const saved = jSend?.message || {}
  const savedId = String(saved.id || '').trim()

  if (onLocalEvent) {
    const savedMessage = {
      _id: savedId || optimisticId,
      chatId: realChatId,
      senderId: String(saved.sender_id || sender),
      content: String(saved.content || text),
      type: String(saved.type || msgType || 'text'),
      createdAt: saved.created_at ? Date.parse(saved.created_at) : optimisticCreatedAt,
      isDeleted: Boolean(saved.is_deleted),
      isPending: false,
    }
    if (savedId && savedId !== optimisticId) {
      onLocalEvent({ changeType: 'removed', message: { _id: optimisticId, chatId: realChatId } })
      onLocalEvent({ changeType: 'added', message: savedMessage })
    } else {
      onLocalEvent({ changeType: 'changed', message: savedMessage })
    }
  }

  let s
  try {
    s = await getSocket({ userId: sender })
  } catch {
    return
  }
  s.emit('join_chat', { chatId: realChatId })
  s.emit('send_message', {
    chatId: realChatId,
    senderId: sender,
    content: saved.content || text,
    type: saved.type || msgType || 'text',
    _id: savedId || undefined,
    createdAt: saved.created_at ? Date.parse(saved.created_at) : Date.now(),
  })
}

export async function sendDirectMedia() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const onLocalEvent = typeof arguments?.[0]?.onLocalEvent === 'function' ? arguments[0].onLocalEvent : null
  const senderId = String(arguments?.[0]?.senderId || '').trim()
  const receiverId = String(arguments?.[0]?.receiverId || '').trim()
  const file = arguments?.[0]?.file
  if (!senderId || !receiverId || !file) throw new Error('senderId, receiverId, and file are required')

  const optimisticId = `tmp-media-${senderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const optimisticCreatedAt = Date.now()
  if (onLocalEvent) {
    onLocalEvent({
      changeType: 'added',
      message: {
        _id: optimisticId,
        chatId: '',
        senderId,
        content: 'Uploading media…',
        type: String(file?.type || '').startsWith('audio/') ? 'audio' : 'file',
        createdAt: optimisticCreatedAt,
        isDeleted: false,
        isPending: true,
      },
    })
  }

  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`${API_BASE_URL}/chat/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${snapshot.token}` },
    body: fd,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.success === false) {
    if (onLocalEvent) {
      onLocalEvent({ changeType: 'removed', message: { _id: optimisticId } })
    }
    throw new Error(j?.message || 'Could not upload media')
  }
  const url = String(j?.url || '').trim()
  const msgType = String(j?.type || 'file').trim() || 'file'
  if (!url) {
    if (onLocalEvent) {
      onLocalEvent({ changeType: 'removed', message: { _id: optimisticId } })
    }
    throw new Error('Upload returned empty url')
  }
  await sendDirectMessage({
    senderId,
    receiverId,
    content: url,
    type: msgType,
    onLocalEvent,
    optimisticId,
    optimisticCreatedAt,
    optimisticAlreadyAdded: true,
  })
}

export async function editDirectMessage() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const messageId = String(arguments?.[0]?.messageId || '').trim()
  const newContent = String(arguments?.[0]?.newContent || '').trim()
  if (!messageId || !newContent) throw new Error('messageId and newContent are required')
  const res = await fetch(`${API_BASE_URL}/chat/messages/${encodeURIComponent(messageId)}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ content: newContent }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not edit message')
  const msg = json?.message || null
  // Best-effort realtime: broadcast edit to members.
  try {
    const cid = String(msg?.chat_id || msg?.chatId || '').trim()
    const uid = String(snapshot?.user?.id || snapshot?.user?.uid || '').trim()
    if (cid && uid) {
      const s = await getSocket({ userId: uid })
      s.emit('join_chat', { chatId: cid })
      s.emit('message_updated', {
        chatId: cid,
        message: {
          _id: String(msg?.id || messageId),
          chatId: cid,
          senderId: String(msg?.sender_id || ''),
          content: String(msg?.content || ''),
          type: String(msg?.type || 'text'),
          createdAt: msg?.created_at ? Date.parse(msg.created_at) : Date.now(),
        },
      })
    }
  } catch {
    /* ignore */
  }
  return msg
}

export async function deleteDirectMessage() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const messageId = String(arguments?.[0]?.messageId || arguments?.[0] || '').trim()
  if (!messageId) throw new Error('messageId is required')
  const res = await fetch(`${API_BASE_URL}/chat/messages/${encodeURIComponent(messageId)}/delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${snapshot.token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not delete message')
  const msg = json?.message || null
  try {
    const cid = String(msg?.chat_id || msg?.chatId || '').trim()
    const uid = String(snapshot?.user?.id || snapshot?.user?.uid || '').trim()
    if (cid && uid) {
      const s = await getSocket({ userId: uid })
      s.emit('join_chat', { chatId: cid })
      s.emit('message_deleted', { chatId: cid, messageId: String(msg?.id || messageId) })
    }
  } catch {
    /* ignore */
  }
  return msg
}

export async function hideDirectMessageForMe() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return
  const messageId = String(arguments?.[0]?.messageId || arguments?.[0] || '').trim()
  if (!messageId) return
  await fetch(`${API_BASE_URL}/chat/messages/${encodeURIComponent(messageId)}/hide`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${snapshot.token}` },
  }).catch(() => undefined)
}

export async function markDirectThreadRead() {
  // This is a semantic helper used across the UI.
  // Today unread counts are driven by `/chat/dm/recent/read` (chat_settings.last_read_at),
  // so we map this call onto the same API.
  const arg0 = arguments?.[0] || {}
  const threadId = String(arg0?.threadId || arg0?.chatId || '').trim()
  const peerId = String(arg0?.peerId || '').trim()
  if (!threadId && !peerId) return
  await markRecentDirectChatRead(threadId ? { threadId } : { peerId }).catch(() => undefined)
}

export async function exportDirectChatHistory() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const peerId = String(arguments?.[0]?.peerId || '').trim()
  const limit = Number(arguments?.[0]?.limit || 200)
  if (!peerId) throw new Error('peerId is required')
  const r = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ peerId }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.success === false) throw new Error(j?.message || 'Could not open chat')
  const chatId = String(j?.chatId || '').trim()
  const msgs = await getMessagesByChatId({ chatId, token: snapshot.token })
  const clipped = msgs.slice(Math.max(0, msgs.length - limit))
  return { type: 'direct', threadId: chatId, peerId, exportedAt: Date.now(), messages: clipped }
}

export async function importDirectChatHistory() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const peerId = String(arguments?.[0]?.peerId || '').trim()
  const payload = arguments?.[0]?.payload
  if (!peerId || !payload?.messages) throw new Error('peerId and payload.messages are required')
  const r = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ peerId }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.success === false) throw new Error(j?.message || 'Could not open chat')
  const chatId = String(j?.chatId || '').trim()

  for (const m of payload.messages) {
    const content = String(m?.content || '').trim()
    if (!content) continue
    await fetch(`${API_BASE_URL}/chat/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
      body: JSON.stringify({ chatId, content, type: 'text' }),
    }).catch(() => undefined)
  }
  return { ok: true }
}

export async function getMessagesByChatId({ chatId, token }) {
  const res = await fetch(`${API_BASE_URL}/chat/messages/${encodeURIComponent(chatId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Failed to fetch messages')
  return json?.messages || []
}

export async function setUserProfilePhoto() {
  const error = new Error('Profile photo upload is disabled.')
  error.code = 'feature/disabled'
  throw error
}

export async function clearUserProfilePhoto() {
  return
}

// ===== Group chat =====
export async function sendGroupMessage() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const chatId = String(arguments?.[0]?.chatId || arguments?.[0]?.groupId || '').trim()
  const content = String(arguments?.[0]?.content || arguments?.[0]?.message || '').trim()
  const type = String(arguments?.[0]?.type || 'text').trim() || 'text'
  if (!chatId || !content) throw new Error('chatId and content are required')
  const res = await fetch(`${API_BASE_URL}/chat/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ chatId, content, type }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not send')

  // Best-effort realtime broadcast so open group chats update immediately without refresh.
  try {
    const uid = String(snapshot?.user?.id || snapshot?.user?.uid || '').trim()
    if (uid) {
      const s = await getSocket({ userId: uid })
      const saved = json?.message || {}
      s.emit('join_chat', { chatId })
      s.emit('send_message', {
        chatId,
        senderId: uid,
        content: String(saved.content || content),
        type: String(saved.type || type || 'text'),
        _id: saved.id || undefined,
        createdAt: saved.created_at ? Date.parse(saved.created_at) : Date.now(),
      })
    }
  } catch {
    /* best-effort */
  }

  return json?.message
}

export async function listGroupMessages() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return []
  const chatId = String(arguments?.[0]?.chatId || arguments?.[0]?.groupId || arguments?.[0] || '').trim()
  if (!chatId) return []
  const rows = await getMessagesByChatId({ chatId, token: snapshot.token })
  return rows.map((m) => ({
    _id: String(m.id || m._id || ''),
    chatId: m.chat_id || m.chatId || chatId,
    senderId: m.sender_id || m.senderId || '',
    message: m.message || m.content || '',
    content: m.content || '',
    type: m.type || 'text',
    createdAt: m.created_at ? Date.parse(m.created_at) : Number(m.createdAt || Date.now()),
    reactions: m.reactions || {},
    isDeleted: Boolean(m.is_deleted || m.isDeleted),
  }))
}

export function subscribeGroupMessages() {
  const chatId = String(arguments?.[0]?.chatId || arguments?.[0]?.groupId || arguments?.[0] || '').trim()
  const cb = typeof arguments?.[1] === 'function' ? arguments[1] : () => undefined
  let disposed = false
  let detach = () => undefined

  ;(async () => {
    const snapshot = await getCurrentAuthSnapshot().catch(() => null)
    const uid = String(snapshot?.user?.id || '').trim()
    if (!snapshot?.token || !uid || !chatId) return
    let s
    try {
      s = await getSocket({ userId: uid })
    } catch {
      return
    }
    s.emit('join_chat', { chatId })
    const handler = (message) => {
      if (disposed || !message) return
      const msgChat = String(message.chatId || message.chat_id || '').trim()
      if (msgChat && msgChat !== chatId) return
      cb(
        {
          _id: String(message._id || message.id || ''),
          chatId,
          senderId: message.senderId || message.sender_id || '',
          message: message.message || message.content || '',
          content: message.content || '',
          type: message.type || 'text',
          createdAt: Number(message.createdAt || Date.now()),
          isDeleted: false,
        },
        'added'
      )
    }
    s.on('receive_message', handler)
    detach = () => s.off('receive_message', handler)
  })()

  return () => {
    disposed = true
    detach()
  }
}

/** When the realtime service emits group/chat removal, refresh lists (payload: { groupId }). */
export function subscribeGroupDeleted(callback) {
  const cb = typeof callback === 'function' ? callback : () => undefined
  let disposed = false
  let detach = () => undefined

  ;(async () => {
    const snapshot = await getCurrentAuthSnapshot().catch(() => null)
    const uid = String(snapshot?.user?.id || '').trim()
    if (!snapshot?.token || !uid) return
    let s
    try {
      s = await getSocket({ userId: uid })
    } catch {
      return
    }
    const handler = (payload) => {
      if (disposed || !payload) return
      const groupId = String(payload.groupId || payload.chatId || payload.id || '').trim()
      if (!groupId) return
      cb({ groupId })
    }
    s.on('group_deleted', handler)
    s.on('chat_deleted', handler)
    detach = () => {
      s.off('group_deleted', handler)
      s.off('chat_deleted', handler)
    }
  })()

  return () => {
    disposed = true
    detach()
  }
}

export async function listUserGroups() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return []
  const res = await fetch(`${API_BASE_URL}/chat/groups/my`, { headers: { Authorization: `Bearer ${snapshot.token}` } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not load groups')
  return json?.groups || []
}
export async function ensureGroupMembership() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const groupId = String(arguments?.[0]?.groupId || '').trim()
  const groupKey = String(arguments?.[0]?.groupKey || groupId || '').trim()
  if (!groupKey && !groupId) throw new Error('groupId or groupKey is required')
  const res = await fetch(`${API_BASE_URL}/chat/groups/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ groupId: groupId || undefined, groupKey: groupKey || undefined }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not open group')
  return json?.group
}
export async function deleteGroup() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const groupId = String(arguments?.[0]?.groupId || arguments?.[0] || '').trim()
  const memberIds = Array.isArray(arguments?.[0]?.memberIds) ? arguments[0].memberIds.map((id) => String(id || '').trim()).filter(Boolean) : []
  if (!groupId) throw new Error('groupId is required')
  const res = await fetch(`${API_BASE_URL}/chat/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${snapshot.token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not delete group')
  try {
    const uid = String(snapshot?.user?.id || snapshot?.user?.uid || '').trim()
    if (uid) {
      const s = await getSocket({ userId: uid })
      s.emit('group_deleted', { groupId, memberIds })
    }
  } catch {
    /* best-effort */
  }
  return json
}
export async function addGroupMemberByUsername() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const groupId = String(arguments?.[0]?.groupId || '').trim()
  const username = String(arguments?.[0]?.username || '').trim()
  if (!groupId || !username) throw new Error('groupId and username are required')
  const res = await fetch(`${API_BASE_URL}/chat/groups/${encodeURIComponent(groupId)}/members/add-by-username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ username }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not add member')
  const m = json?.member || {}
  const u = m.user || {}
  return {
    id: String(m.userId || u.id || '').trim(),
    userId: String(m.userId || u.id || '').trim(),
    username: u.user_metadata?.username || u.username || '',
    role: m.role || 'member',
  }
}
export async function listGroupMembers() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return []
  const groupId = String(arguments?.[0] || '').trim()
  if (!groupId) return []
  const res = await fetch(`${API_BASE_URL}/chat/groups/${encodeURIComponent(groupId)}/members`, {
    headers: { Authorization: `Bearer ${snapshot.token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not load members')
  const rows = json?.members || []
  return rows.map((m) => {
    const u = m.user || {}
    const id = String(m.userId || u.id || '').trim()
    return {
      id,
      userId: id,
      username: u.user_metadata?.username || u.username || id,
      role: m.role || 'member',
    }
  })
}
export async function leaveGroupMembership() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return
  const groupId = String(arguments?.[0]?.groupId || arguments?.[0] || '').trim()
  const uid = String(snapshot?.user?.id || '').trim()
  if (!groupId || !uid) return
  await fetch(`${API_BASE_URL}/chat/groups/${encodeURIComponent(groupId)}/members/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ userId: uid }),
  }).catch(() => undefined)
}
export async function removeGroupMember() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const groupId = String(arguments?.[0]?.groupId || '').trim()
  const userId = String(arguments?.[0]?.userId || arguments?.[0]?.memberId || '').trim()
  if (!groupId || !userId) throw new Error('groupId and userId are required')
  const res = await fetch(`${API_BASE_URL}/chat/groups/${encodeURIComponent(groupId)}/members/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ userId }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not remove member')
  return json
}
export async function setGroupPhoto() {
  const error = new Error('Group chat is disabled.')
  error.code = 'feature/disabled'
  throw error
}
export async function exportGroupChatHistory() {
  const error = new Error('Export is disabled.')
  error.code = 'feature/disabled'
  throw error
}
export async function importGroupChatHistory() {
  const error = new Error('Import is disabled.')
  error.code = 'feature/disabled'
  throw error
}
export async function markGroupThreadRead() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return
  const threadId = String(arguments?.[0]?.threadId || arguments?.[0]?.chatId || arguments?.[0]?.groupId || arguments?.[0] || '').trim()
  if (!threadId) return
  await fetch(`${API_BASE_URL}/chat/dm/recent/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ threadId }),
  }).catch(() => undefined)
}
export async function toggleGroupReaction() {
  return toggleDmReaction(arguments?.[0] || {})
}
export async function setGroupMemberRole() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const groupId = String(arguments?.[0]?.groupId || '').trim()
  const userId = String(arguments?.[0]?.userId || '').trim()
  const role = String(arguments?.[0]?.role || '').trim()
  if (!groupId || !userId || !role) throw new Error('groupId, userId and role are required')
  const res = await fetch(`${API_BASE_URL}/chat/groups/${encodeURIComponent(groupId)}/members/set-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ userId, role }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not update role')
  return json?.member || json
}
export async function setGroupMuted() {
  return
}
export async function setGroupTyping() {
  return
}
export function subscribeGroupTyping() {
  return () => undefined
}
export async function pinGroupMessage() {
  return
}
export async function unpinGroupMessage() {
  return
}
export function subscribePinnedGroupMessages() {
  return () => undefined
}
export async function deleteGroupMessage() {
  return
}
export async function toggleDmReaction() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const arg0 = arguments?.[0] || {}
  const messageId = String(arg0.messageId || arg0.message_id || '').trim()
  const emoji = String(arg0.emoji || arguments?.[1] || '').trim()
  if (!messageId || !emoji) throw new Error('messageId and emoji are required')
  const res = await fetch(`${API_BASE_URL}/chat/reactions/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ messageId, emoji }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not react')
  // If API provides chatId + reactions snapshot, broadcast it.
  try {
    const cid = String(json?.chatId || '').trim()
    const mid = String(json?.messageId || messageId).trim()
    const uid = String(snapshot?.user?.id || snapshot?.user?.uid || '').trim()
    if (cid && mid && uid && json?.reactions) {
      const s = await getSocket({ userId: uid })
      s.emit('join_chat', { chatId: cid })
      s.emit('reaction_updated', { chatId: cid, messageId: mid, reactions: json.reactions })
    }
  } catch {
    /* ignore */
  }
  return json
}
export async function setDmTyping() {
  const peerId = String(arguments?.[0]?.peerId || '').trim()
  const isTyping = Boolean(arguments?.[0]?.isTyping)
  const snapshot = await getCurrentAuthSnapshot().catch(() => null)
  const uid = String(snapshot?.user?.id || '').trim()
  if (!uid || !peerId) return
  let s
  try {
    s = await getSocket({ userId: uid })
  } catch {
    return
  }
  // We reuse peerId as "chatId" in legacy UI; server expects actual chatId.
  const r = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ peerId }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.success === false) return
  const chatId = String(j?.chatId || '').trim()
  if (!chatId) return
  s.emit(isTyping ? 'typing' : 'stop_typing', { chatId, senderId: uid })
}
export function subscribeDmTyping() {
  const peerId = String(arguments?.[1] || '').trim()
  const cb =
    typeof arguments?.[2] === 'function'
      ? arguments[2]
      : typeof arguments?.[3] === 'function'
        ? arguments[3]
        : () => undefined
  let disposed = false
  let detach = () => {}

  ;(async () => {
    const snapshot = await getCurrentAuthSnapshot().catch(() => null)
    const uid = String(snapshot?.user?.id || '').trim()
    if (!snapshot?.token || !uid || !peerId) return
    let s
    try {
      s = await getSocket({ userId: uid })
    } catch {
      return
    }
    const r = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
      body: JSON.stringify({ peerId }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j?.success === false) return
    const chatId = String(j?.chatId || '').trim()
    if (!chatId) return
    s.emit('join_chat', { chatId })

    const onTyping = (p) => {
      if (disposed) return
      if (String(p?.chatId || '').trim() !== chatId) return
      cb({ senderId: p?.senderId, isTyping: true })
    }
    const onStop = (p) => {
      if (disposed) return
      if (String(p?.chatId || '').trim() !== chatId) return
      cb({ senderId: p?.senderId, isTyping: false })
    }
    s.on('typing', onTyping)
    s.on('stop_typing', onStop)
    detach = () => {
      try {
        s.off('typing', onTyping)
        s.off('stop_typing', onStop)
      } catch {
        /* ignore */
      }
    }
  })()

  return () => {
    disposed = true
    detach()
  }
}
export async function pinDmMessage() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const peerId = String(arguments?.[0]?.peerId || '').trim()
  const messageId = String(arguments?.[0]?.messageId || '').trim()
  if (!peerId || !messageId) throw new Error('peerId and messageId are required')
  const r = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ peerId }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.success === false) throw new Error(j?.message || 'Could not open chat')
  const chatId = String(j?.chatId || '').trim()
  const res = await fetch(`${API_BASE_URL}/chat/pins/${encodeURIComponent(chatId)}/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ messageId }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not pin message')
  return true
}
export async function unpinDmMessage() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')
  const peerId = String(arguments?.[0]?.peerId || '').trim()
  const messageId = String(arguments?.[0]?.messageId || '').trim()
  if (!peerId || !messageId) throw new Error('peerId and messageId are required')
  const r = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ peerId }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.success === false) throw new Error(j?.message || 'Could not open chat')
  const chatId = String(j?.chatId || '').trim()
  const res = await fetch(`${API_BASE_URL}/chat/pins/${encodeURIComponent(chatId)}/unpin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ messageId }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not unpin message')
  return true
}
export function subscribePinnedDmMessages() {
  const peerId = String(arguments?.[1] || '').trim()
  const cb = typeof arguments?.[2] === 'function' ? arguments?.[2] : () => undefined
  let disposed = false
  ;(async () => {
    const snapshot = await getCurrentAuthSnapshot().catch(() => null)
    if (!snapshot?.token || !peerId) return
    const r = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
      body: JSON.stringify({ peerId }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j?.success === false) return
    const chatId = String(j?.chatId || '').trim()
    const res = await fetch(`${API_BASE_URL}/chat/pins/${encodeURIComponent(chatId)}`, {
      headers: { Authorization: `Bearer ${snapshot.token}` },
    })
    const json = await res.json().catch(() => ({}))
    if (disposed) return
    if (!res.ok || json?.success === false) return
    cb(json?.pins || [])
  })()
  return () => {
    disposed = true
  }
}
export function subscribeRecentDirectChats(_userId, callback) {
  const cb = typeof callback === 'function' ? callback : () => undefined
  let disposed = false
  let timer = null
  const INTERVAL_MS = 8000
  const INTERVAL_BACKGROUND_MS = 45000

  function dedupeRecentChats(items) {
    const rows = Array.isArray(items) ? items : []
    const byKey = new Map()
    for (const chat of rows) {
      // DMs should be unique per peer (backend may accidentally create multiple threads).
      const key = String(chat?.peerId || chat?.peer_id || chat?.peer?.id || chat?.threadId || chat?.chatId || chat?.id || '').trim()
      if (!key) continue
      const prev = byKey.get(key)
      if (!prev) {
        byKey.set(key, chat)
        continue
      }
      const ta = new Date(chat?.lastAt || chat?.updatedAt || 0).getTime()
      const tb = new Date(prev?.lastAt || prev?.updatedAt || 0).getTime()
      byKey.set(key, ta >= tb ? chat : prev)
    }
    return [...byKey.values()]
  }

  const load = async () => {
    const snapshot = await getCurrentAuthSnapshot().catch(() => null)
    if (!snapshot?.token) return cb([])
    const res = await fetch(`${API_BASE_URL}/chat/dm/recent`, { headers: { Authorization: `Bearer ${snapshot.token}` } })
    const json = await res.json().catch(() => ({}))
    if (disposed) return
    if (!res.ok || json?.success === false) {
      // eslint-disable-next-line no-console
      console.warn('[recent-dm] load failed', { status: res.status, message: json?.message })
      return cb([])
    }
    cb(dedupeRecentChats(json?.chats || []))
  }

  const schedule = () => {
    if (timer) clearInterval(timer)
    if (disposed) return
    const ms =
      typeof document !== 'undefined' && document.hidden ? INTERVAL_BACKGROUND_MS : INTERVAL_MS
    timer = setInterval(load, ms)
  }

  const onVisibility = () => {
    if (disposed) return
    if (typeof document !== 'undefined' && !document.hidden) {
      load().catch(() => undefined)
    }
    schedule()
  }

  ;(async () => {
    await load()
    if (disposed) return
    schedule()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
  })()

  return () => {
    disposed = true
    if (timer) clearInterval(timer)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
}
export function subscribeUserPresence(_userId, callback) {
  const peerId = String(arguments?.[0] || '').trim()
  const cb = typeof callback === 'function' ? callback : () => undefined
  let disposed = false

  ;(async () => {
    const snapshot = await getCurrentAuthSnapshot().catch(() => null)
    const uid = String(snapshot?.user?.id || snapshot?.user?.uid || '').trim()
    if (!peerId) return cb({ online: false, lastSeen: null })
    if (!uid || !snapshot?.token) return cb({ online: false, lastSeen: null })

    let s
    try {
      s = await getSocket({ userId: uid })
    } catch {
      return cb({ online: false, lastSeen: null })
    }
    const handler = (payload) => {
      if (disposed) return
      if (!payload || String(payload.userId || '').trim() !== peerId) return
      const status = String(payload.status || '').toLowerCase()
      const lastSeen =
        payload.lastSeen ||
        payload.last_seen ||
        payload.last_seen_at ||
        payload.lastSeenAt ||
        null
      cb({ online: status === 'online', lastSeen: lastSeen || null })
    }
    s.on('user_status', handler)
    cb({ online: false, lastSeen: null })

    // Best-effort: ask server for current status / lastSeen (if supported).
    try {
      s.emit('get_user_status', { userId: peerId })
    } catch {
      // ignore
    }

    // Best-effort: fetch presence snapshot (if API route exists).
    try {
      const res = await fetch(`${API_BASE_URL}/chat/presence/${encodeURIComponent(peerId)}`, {
        headers: { Authorization: `Bearer ${snapshot.token}` },
      })
      const json = await res.json().catch(() => ({}))
      const p = json?.presence || json?.data || json
      if (!disposed && res.ok && p) {
        const status = String(p.status || p.state || '').toLowerCase()
        const lastSeen = p.last_seen || p.lastSeen || p.last_seen_at || p.lastSeenAt || null
        cb({ online: status === 'online' || status === 'active', lastSeen: lastSeen || null })
      }
    } catch {
      // ignore
    }
    const off = () => s.off('user_status', handler)
    const prevUnsub = unsubRef.get(cb)
    if (prevUnsub) prevUnsub()
    unsubRef.set(cb, off)
  })()

  return () => {
    disposed = true
    const off = unsubRef.get(cb)
    if (off) off()
    unsubRef.delete(cb)
  }
}
export async function markRecentDirectChatRead() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return
  const arg0 = arguments?.[0]
  const arg1 = arguments?.[1]

  const arg0IsObject = arg0 && typeof arg0 === 'object' && !Array.isArray(arg0)
  const threadIdRaw = String(
    (arg0IsObject ? arg0?.threadId || arg0?.chatId : arg0) || arg1 || ''
  ).trim()
  const peerId = String(
    (arg0IsObject ? arg0?.peerId : '') || ''
  ).trim()

  let threadId = threadIdRaw
  if (!threadId && peerId) {
    // Resolve DM threadId/chatId from peerId (same API used elsewhere).
    const r = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
      body: JSON.stringify({ peerId }),
    }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok || j?.success === false) return
    threadId = String(j?.chatId || '').trim()
  }

  if (!threadId) return
  await fetch(`${API_BASE_URL}/chat/dm/recent/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ threadId }),
  }).catch(() => undefined)
}
export async function deleteRecentDirectChat() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return
  const arg0 = arguments?.[0]
  const arg0IsObject = arg0 && typeof arg0 === 'object' && !Array.isArray(arg0)
  const threadId = String((arg0IsObject ? arg0?.threadId || arg0?.chatId : arg0) || '').trim()
  const peerId = String(arg0IsObject ? arg0?.peerId || '' : '').trim()
  if (!threadId && !peerId) return
  const res = await fetch(`${API_BASE_URL}/chat/dm/recent/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ ...(threadId ? { threadId } : {}), ...(peerId ? { peerId } : {}), hidden: true }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || 'Could not delete recent chat')
  }
}
export async function setRecentDirectChatArchived() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return
  const arg0 = arguments?.[0] || {}
  const threadId = String(arg0?.threadId || arg0?.chatId || '').trim()
  const peerId = String(arg0?.peerId || '').trim()
  const archived = Boolean(arg0?.archived)
  if (!threadId && !peerId) return
  const res = await fetch(`${API_BASE_URL}/chat/dm/recent/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ ...(threadId ? { threadId } : {}), ...(peerId ? { peerId } : {}), archived }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || 'Could not update archive setting')
  }
}
export async function setRecentDirectChatLocked() {
  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) return
  const arg0 = arguments?.[0] || {}
  const threadId = String(arg0?.threadId || arg0?.chatId || '').trim()
  const peerId = String(arg0?.peerId || '').trim()
  const locked = Boolean(arg0?.locked)
  if (!threadId && !peerId) return
  const res = await fetch(`${API_BASE_URL}/chat/dm/recent/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ ...(threadId ? { threadId } : {}), ...(peerId ? { peerId } : {}), locked }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || 'Could not update lock setting')
  }
}
export async function setMyPresence() {
  const snapshot = await getCurrentAuthSnapshot().catch(() => null)
  const uid = String(snapshot?.user?.id || snapshot?.user?.uid || '').trim()
  if (!uid) return

  const arg0 = arguments?.[0] || {}
  const status = String(arg0?.status || arg0?.state || '').toLowerCase()

  if (status === 'offline') {
    try {
      if (socketInstance) socketInstance.disconnect()
    } catch {
      /* ignore */
    }
    return
  }

  // Default: ensure we are connected so realtime-service can persist presence.
  try {
    await getSocket({ userId: uid })
  } catch {
    /* ignore */
  }
}

