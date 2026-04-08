# D-LITE Backend Contract (HTTP + Socket.IO)

This document snapshots the **current backend contract** that the Python rewrite must preserve.

## API Gateway (port 4000)
- **GET `/`**: returns gateway banner + service prefixes
- **GET `/health`**: `{ success: true, service: "api-gateway", status: "ok" }`
- **Proxy prefixes** (prefix stripped before forwarding):
  - `/auth/**` → auth-service
  - `/chat/**` → chat-service
  - `/call/**` → call-service
  - `/media/**` → media-service

## Auth service (port 4001; behind gateway `/auth`)
- **GET `/health`**
- **POST `/signup`**
  - Body: `{ email, password, username? }`
  - Response: `{ success, message, data: { accessToken, refreshToken, expiresIn, tokenType, user } }`
- **POST `/login`**
  - Body: `{ email, password }`
  - Response: same shape as `/signup`
- **POST `/otp/request`**
  - Body: `{ email, redirectTo? }`
- **POST `/otp/verify`**
  - Body: `{ email, token }`
- **GET `/me`**
  - Header: `Authorization: Bearer <token>`

## Chat service (port 4002; behind gateway `/chat`)
- **GET `/health`**
- **GET `/messages/:chatId`**
  - Header: `Authorization: Bearer <token>`
  - Response: `{ success, chatId, messages: [...] }`

### Chat Socket.IO events
- **Handshake** expects `userId` in `auth.userId` or `query.userId`
- Rooms:
  - `user:<userId>`
  - `chat:<chatId>`
- Client → server:
  - `join_chat` `{ chatId }`
  - `send_message` `{ chatId, senderId?, content, type? }`
  - `typing` `{ chatId, senderId? }`
  - `stop_typing` `{ chatId, senderId? }`
- Server → client:
  - `receive_message` `<message row>`
  - `user_status` `{ userId, status: "online"|"offline" }`
  - `socket_error` `{ message }`

## Call service (port 4003; behind gateway `/call`)
- **GET `/health`**

### Call Socket.IO events
- **Handshake** requires `userId` in `auth.userId` or `query.userId`
- Rooms:
  - `user:<userId>`
- Client → server:
  - `call_user` `{ callId?, toUserId, callType, offer }`
  - `accept_call` `{ callId, answer }`
  - `reject_call` `{ callId, reason? }`
  - `ice_candidate` `{ callId, toUserId, candidate }`
  - `end_call` `{ callId, reason? }`
- Server → client:
  - `connected` `{ userId, socketId }`
  - `call_user` `{ callId, fromUserId, callType, offer }`
  - `accept_call` `{ callId, fromUserId, callType, answer }`
  - `reject_call` `{ callId, fromUserId, reason? }`
  - `ice_candidate` `{ callId, fromUserId, candidate }`
  - `end_call` `{ callId, fromUserId, reason? }`
  - `socket_error` `{ message }`

## Media service (port 4004; behind gateway `/media`)
- **GET `/health`**
- **POST `/upload`** (multipart form field `file`)
- **DELETE `/delete`** JSON `{ publicId, resourceType? }`

## Backup worker
- Periodic job: read Supabase `messages` table → upsert Mongo collection `message_backups`

