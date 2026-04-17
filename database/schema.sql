-- ============================================================================
-- D-Lite (Supabase) canonical schema + RLS
-- ============================================================================
-- Assumptions:
-- - Authentication is handled by Supabase Auth (`auth.users`)
-- - `public.users` is a profile table keyed by `auth.users.id`
-- - Server-side operations use `service_role` key via PostgREST
-- - Clients use their Supabase access token + anon key and are protected by RLS
-- ============================================================================

create extension if not exists "pgcrypto";

-- =========================================
-- USERS (profile table linked to auth.users)
-- =========================================
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  -- Username may be set at signup (metadata) or later; allow null initially.
  username text unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- =========================================
-- CHATS
-- =========================================
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct','group')),
  name text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =========================================
-- GROUP MEMBERS
-- =========================================
create table if not exists public.group_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

-- =========================================
-- MESSAGES
-- =========================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  type text not null default 'text' check (type in ('text','image','video','file','audio')),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =========================================
-- MESSAGE REACTIONS
-- =========================================
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- =========================================
-- PINNED MESSAGES (per user per chat)
-- =========================================
create table if not exists public.pinned_messages (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chat_id, user_id, message_id)
);

-- =========================================
-- CHAT SETTINGS (per user per chat)
-- Used for "Recent chats" (archived/locked/hidden + last_read_at)
-- =========================================
create table if not exists public.chat_settings (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  archived boolean not null default false,
  locked boolean not null default false,
  hidden boolean not null default false,
  last_read_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

-- =========================================
-- MESSAGE READS
-- =========================================
create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz default now(),
  primary key (message_id, user_id)
);

-- =========================================
-- TYPING STATUS
-- =========================================
create table if not exists public.typing_status (
  user_id uuid not null references public.users(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  is_typing boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, chat_id)
);

-- =========================================
-- PRESENCE
-- =========================================
create table if not exists public.presence (
  user_id uuid primary key references public.users(id) on delete cascade,
  status text not null default 'offline' check (status in ('online','offline')),
  last_seen timestamptz not null default now()
);

-- =========================================
-- INDEXES
-- =========================================
create index if not exists idx_group_members_user_id on public.group_members(user_id);
create index if not exists idx_group_members_chat_id on public.group_members(chat_id);

create index if not exists idx_messages_chat_id_created_at on public.messages(chat_id, created_at desc);
create index if not exists idx_messages_sender_id on public.messages(sender_id);
create index if not exists idx_messages_not_deleted on public.messages(chat_id, created_at desc) where is_deleted = false;

create index if not exists idx_reactions_message_id on public.message_reactions(message_id);
create index if not exists idx_pins_chat_id on public.pinned_messages(chat_id);
create index if not exists idx_chat_settings_user_id on public.chat_settings(user_id);
create index if not exists idx_chat_settings_chat_id on public.chat_settings(chat_id);

create index if not exists idx_reads_user_id on public.message_reads(user_id);
create index if not exists idx_reads_read_at on public.message_reads(read_at desc);

create index if not exists idx_typing_chat_id on public.typing_status(chat_id);
create index if not exists idx_typing_updated_at on public.typing_status(updated_at desc);

create index if not exists idx_presence_status on public.presence(status);
create index if not exists idx_presence_last_seen on public.presence(last_seen desc);

-- =========================================
-- AUTO CREATE USER PROFILE ON SIGNUP
-- =========================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.users (id, email, username, avatar_url)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'username',''),
    nullif(new.raw_user_meta_data->>'avatar_url','')
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =========================================
-- ENABLE RLS
-- =========================================
alter table public.users enable row level security;
alter table public.chats enable row level security;
alter table public.group_members enable row level security;
alter table public.message_reactions enable row level security;
alter table public.pinned_messages enable row level security;
alter table public.chat_settings enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.typing_status enable row level security;
alter table public.presence enable row level security;

-- =========================================
-- COLUMN PRIVILEGES (avoid leaking email)
-- =========================================
revoke all on table public.users from anon, authenticated;
grant select (id, username, avatar_url, created_at) on table public.users to authenticated;

-- =========================================
-- USERS POLICIES
-- =========================================
create policy "Users can view own profile"
on public.users
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.users
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can search directory"
on public.users
for select
to authenticated
using (true);

-- =========================================
-- CHATS POLICIES
-- =========================================
-- NOTE: Avoid referencing RLS-protected tables from their own policies directly
-- (it can cause "infinite recursion detected in policy"). We use a SECURITY DEFINER
-- helper for membership checks.

create or replace function public.is_chat_member(_chat_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.chat_id = _chat_id
      and gm.user_id = _user_id
  );
$$;

revoke all on function public.is_chat_member(uuid, uuid) from public;
grant execute on function public.is_chat_member(uuid, uuid) to authenticated;

create policy "Users can view chats"
on public.chats
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1 where public.is_chat_member(chats.id, auth.uid())
  )
);

create policy "Users can create chats"
on public.chats
for insert
to authenticated
with check (created_by = auth.uid());

-- =========================================
-- GROUP MEMBERS POLICIES
-- =========================================
create policy "Users can view members"
on public.group_members
for select
to authenticated
using (
  public.is_chat_member(group_members.chat_id, auth.uid())
);

create policy "Creator can add members"
on public.group_members
for insert
to authenticated
with check (
  exists (
    select 1 from public.chats c
    where c.id = chat_id
      and c.created_by = auth.uid()
  )
);

-- =========================================
-- MESSAGES POLICIES
-- =========================================
create policy "Insert messages"
on public.messages
for insert
to authenticated
with check (auth.uid() = sender_id);

create policy "Read messages"
on public.messages
for select
to authenticated
using (
  public.is_chat_member(messages.chat_id, auth.uid())
);

create policy "Delete own messages"
on public.messages
for delete
to authenticated
using (auth.uid() = sender_id);

-- Allow soft-delete (update) by sender only
create policy "Update own messages"
on public.messages
for update
to authenticated
using (auth.uid() = sender_id)
with check (auth.uid() = sender_id);

-- =========================================
-- REACTIONS POLICIES
-- =========================================
create policy "React in member chats"
on public.message_reactions
for all
to authenticated
using (
  exists (
    select 1 from public.messages m
    where m.id = message_reactions.message_id
      and public.is_chat_member(m.chat_id, auth.uid())
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.messages m
    where m.id = message_reactions.message_id
      and public.is_chat_member(m.chat_id, auth.uid())
  )
);

-- =========================================
-- PINS POLICIES
-- =========================================
create policy "Pin in member chats"
on public.pinned_messages
for all
to authenticated
using (public.is_chat_member(pinned_messages.chat_id, auth.uid()) and auth.uid() = user_id)
with check (public.is_chat_member(pinned_messages.chat_id, auth.uid()) and auth.uid() = user_id);

-- =========================================
-- CHAT SETTINGS POLICIES
-- =========================================
create policy "Chat settings read"
on public.chat_settings
for select
to authenticated
using (auth.uid() = user_id and public.is_chat_member(chat_settings.chat_id, auth.uid()));

create policy "Chat settings write"
on public.chat_settings
for insert
to authenticated
with check (auth.uid() = user_id and public.is_chat_member(chat_settings.chat_id, auth.uid()));

create policy "Chat settings update"
on public.chat_settings
for update
to authenticated
using (auth.uid() = user_id and public.is_chat_member(chat_settings.chat_id, auth.uid()))
with check (auth.uid() = user_id and public.is_chat_member(chat_settings.chat_id, auth.uid()));

-- =========================================
-- MESSAGE READS POLICIES
-- =========================================
create policy "Insert reads"
on public.message_reads
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Read receipts"
on public.message_reads
for select
to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_reads.message_id
      and public.is_chat_member(m.chat_id, auth.uid())
  )
);

-- =========================================
-- TYPING STATUS POLICIES
-- =========================================
create policy "Typing update"
on public.typing_status
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Typing read"
on public.typing_status
for select
to authenticated
using (
  public.is_chat_member(typing_status.chat_id, auth.uid())
);

-- =========================================
-- PRESENCE POLICIES
-- =========================================
create policy "Presence update"
on public.presence
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Presence read"
on public.presence
for select
to authenticated
using (
  exists (
    select 1
    from public.group_members gm
    where gm.user_id = auth.uid()
      and public.is_chat_member(gm.chat_id, presence.user_id)
  )
);

