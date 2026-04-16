-- ============================================================================
-- D-Lite Chat Application PostgreSQL Schema
-- ============================================================================
-- This schema is designed for Supabase PostgreSQL.
-- It supports:
-- - user profiles
-- - direct chats
-- - group chats
-- - chat messages
-- - chat membership
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  username text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Local auth fallback users (only used when AUTH_MODE=local or Supabase auth
-- is intentionally bypassed). Password hashes are stored here so local auth
-- survives server restarts without relying on in-memory dictionaries.
-- ============================================================================
create table if not exists public.local_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  name text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (chat_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  type text not null default 'text' check (type in ('text', 'image', 'video', 'file', 'audio')),
  created_at timestamptz not null default now()
);

-- Message read receipts (per-user per-message)
create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz default now(),
  primary key (message_id, user_id)
);

-- Presence (one row per user)
create table if not exists public.presence (
  user_id uuid not null references public.users(id) on delete cascade,
  status text default 'offline' check (status in ('online', 'offline')),
  last_seen timestamptz default now(),
  primary key (user_id)
);

-- Typing indicator (per-user per-chat)
create table if not exists public.typing_status (
  user_id uuid not null references public.users(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  is_typing boolean default false,
  updated_at timestamptz default now(),
  primary key (user_id, chat_id)
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists idx_chats_created_by on public.chats(created_by);
create index if not exists idx_chats_type on public.chats(type);

create index if not exists idx_group_members_chat_id on public.group_members(chat_id);
create index if not exists idx_group_members_user_id on public.group_members(user_id);

create index if not exists idx_messages_chat_id_created_at
  on public.messages(chat_id, created_at desc);

create index if not exists idx_messages_sender_id on public.messages(sender_id);
create index if not exists idx_messages_created_at on public.messages(created_at desc);

create index if not exists idx_message_reads_user_id on public.message_reads(user_id);
create index if not exists idx_message_reads_read_at on public.message_reads(read_at desc);

create index if not exists idx_presence_status on public.presence(status);
create index if not exists idx_presence_last_seen on public.presence(last_seen desc);

create index if not exists idx_typing_status_chat_id on public.typing_status(chat_id);
create index if not exists idx_typing_status_updated_at on public.typing_status(updated_at desc);
