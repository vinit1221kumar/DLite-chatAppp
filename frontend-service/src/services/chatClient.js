import { io } from 'socket.io-client'
import { API_BASE_URL, CHAT_SOCKET_URL } from './appClient'
import { getCurrentAuthSnapshot } from './authClient'

let socketInstance = null
const unsubRef = new Map()

async function authedSocketOptions({ userId } = {}) {
  const snapshot = await getCurrentAuthSnapshot().catch(() => null)
  const token = snapshot?.token || ''
  const uid = String(userId || snapshot?.user?.id || snapshot?.user?.uid || '').trim()
  return {
    userId: uid || undefined,
    token: token || undefined,
  }
}

async function getSocket({ userId } = {}) {
  if (socketInstance) return socketInstance
  const auth = await authedSocketOptions({ userId })
  socketInstance = io(CHAT_SOCKET_URL, {
    autoConnect: true,
    transports: ['websocket'],
    auth: auth?.userId ? auth : undefined,
  })
  return socketInstance
}

function safeUserProfile(userId) {
  const id = String(userId || '').trim()
  return { id, uid: id, username: id || 'User', email: '', photoURL: '' }
}

export function initializeMyPresence() {
  let cancelled = false
  ;(async () => {
    const snapshot = await getCurrentAuthSnapshot().catch(() => null)
    const uid = String(snapshot?.user?.id || snapshot?.user?.uid || '').trim()
    if (!uid || cancelled) return
    await getSocket({ userId: uid })
  })()
  return () => {
    cancelled = true
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
    const s = await getSocket({ userId: _userId })

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
    s.on('receive_message', handler)
    unsub = () => s.off('receive_message', handler)
  })()

  return () => unsub()
}

export async function sendDirectMessage({ chatId, senderId, content }) {
  const receiverId = String(arguments?.[0]?.receiverId || arguments?.[0]?.peerId || '').trim()
  const sender = String(senderId || '').trim()
  const text = String(content || '').trim()
  if (!sender || !receiverId || !text) return

  const snapshot = await getCurrentAuthSnapshot()
  if (!snapshot?.token) throw new Error('Not authenticated')

  // Ensure DM chat exists and both members are linked in Supabase
  const rEnsure = await fetch(`${API_BASE_URL}/chat/dm/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ peerId: receiverId }),
  })
  const jEnsure = await rEnsure.json().catch(() => ({}))
  if (!rEnsure.ok || jEnsure?.success === false) throw new Error(jEnsure?.message || 'Could not open chat')
  const realChatId = String(jEnsure?.chatId || '').trim()
  if (!realChatId) throw new Error('Could not open chat')

  // Persist first (history + canonical ids), then broadcast realtime
  const rSend = await fetch(`${API_BASE_URL}/chat/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ chatId: realChatId, content: text, type: 'text' }),
  })
  const jSend = await rSend.json().catch(() => ({}))
  if (!rSend.ok || jSend?.success === false) throw new Error(jSend?.message || 'Could not send')
  const saved = jSend?.message || {}

  const s = await getSocket({ userId: sender })
  s.emit('join_chat', { chatId: realChatId })
  s.emit('send_message', {
    chatId: realChatId,
    senderId: sender,
    content: saved.content || text,
    type: saved.type || 'text',
    _id: saved.id || undefined,
    createdAt: saved.created_at ? Date.parse(saved.created_at) : Date.now(),
  })
}

export async function sendDirectMedia() {
  const error = new Error('Media messages are disabled.')
  error.code = 'feature/disabled'
  throw error
}

export async function editDirectMessage() {
  const error = new Error('Editing messages is disabled.')
  error.code = 'feature/disabled'
  throw error
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
  return json?.message
}

export async function hideDirectMessageForMe() {
  return
}

export async function markDirectThreadRead() {
  return
}

export async function exportDirectChatHistory() {
  const error = new Error('Export is disabled.')
  error.code = 'feature/disabled'
  throw error
}

export async function importDirectChatHistory() {
  const error = new Error('Import is disabled.')
  error.code = 'feature/disabled'
  throw error
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

// ===== Stubs for legacy UI (non-breaking) =====
export async function sendGroupMessage() {
  const error = new Error('Group chat is disabled.')
  error.code = 'feature/disabled'
  throw error
}
export async function listGroupMessages() {
  return []
}
export function subscribeGroupMessages() {
  return () => undefined
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
  const groupKey = String(arguments?.[0]?.groupId || arguments?.[0]?.groupKey || '').trim()
  if (!groupKey) throw new Error('groupId is required')
  const res = await fetch(`${API_BASE_URL}/chat/groups/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ groupKey }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not open group')
  return json?.group
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
  return json?.member
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
  return json?.members || []
}
export async function leaveGroupMembership() {
  return
}
export async function removeGroupMember() {
  return
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
  return
}
export async function toggleGroupReaction() {
  return
}
export async function setGroupMemberRole() {
  return
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
  const messageId = String(arguments?.[0]?.messageId || arguments?.[0] || '').trim()
  const emoji = String(arguments?.[0]?.emoji || arguments?.[1] || '').trim()
  if (!messageId || !emoji) throw new Error('messageId and emoji are required')
  const res = await fetch(`${API_BASE_URL}/chat/reactions/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${snapshot.token}` },
    body: JSON.stringify({ messageId, emoji }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.success === false) throw new Error(json?.message || 'Could not react')
  return json
}
export async function setDmTyping() {
  return
}
export function subscribeDmTyping() {
  return () => undefined
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
  callback([])
  return () => undefined
}
export function subscribeUserPresence(_userId, callback) {
  const peerId = String(arguments?.[0] || '').trim()
  const cb = typeof callback === 'function' ? callback : () => undefined
  let disposed = false

  ;(async () => {
    const snapshot = await getCurrentAuthSnapshot().catch(() => null)
    const uid = String(snapshot?.user?.id || snapshot?.user?.uid || '').trim()
    const s = await getSocket({ userId: uid })
    const handler = (payload) => {
      if (disposed) return
      if (!payload || String(payload.userId || '').trim() !== peerId) return
      const status = String(payload.status || '').toLowerCase()
      cb({ online: status === 'online', lastSeen: null })
    }
    s.on('user_status', handler)
    cb({ online: false, lastSeen: null })
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
  return
}
export async function deleteRecentDirectChat() {
  return
}
export async function setRecentDirectChatArchived() {
  return
}
export async function setRecentDirectChatLocked() {
  return
}
export async function setMyPresence() {
  return
}

