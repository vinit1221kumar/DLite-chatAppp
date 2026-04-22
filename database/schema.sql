-- ============================================================================
-- D-Lite (Supabase) canonical schema + RLS
-- ============================================================================
-- ===== OLD SCHEMA (baseline) =====
-- The original schema included core chat tables (users/chats/group_members/messages/...).
-- ===== NEW SCHEMA (additions) =====
-- New tables are appended below with a "NEW SCHEMA" header.
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
-- HIDDEN MESSAGES (per user per message)
-- NEW SCHEMA: required for "delete for me"
-- =========================================
create table if not exists public.hidden_messages (
  user_id uuid not null references public.users(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, chat_id, message_id)
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
-- ============================================================================
-- ONE-TIME DATA FIX (optional, but recommended before adding uniqueness)
-- ============================================================================
-- If your database already has duplicate chats with the same (type, name),
-- creating the unique index below will fail. This block deduplicates by keeping
-- the newest chat (by created_at) per (type, name), and repoints dependent rows.
--
-- Safe to run multiple times (no-ops when no duplicates exist).
-- ============================================================================
do $$
declare
  moved_count bigint;
begin
  -- Build a mapping of duplicate chat_ids -> keep_chat_id
  create temporary table if not exists _chat_dedupe_map (
    old_chat_id uuid primary key,
    keep_chat_id uuid not null
  ) on commit drop;

  insert into _chat_dedupe_map (old_chat_id, keep_chat_id)
  with ranked as (
    select
      c.id as chat_id,
      c.type,
      c.name,
      c.created_at,
      first_value(c.id) over (partition by c.type, c.name order by c.created_at desc, c.id desc) as keep_id,
      count(*) over (partition by c.type, c.name) as cnt
    from public.chats c
    where c.name is not null
  )
  select r.chat_id, r.keep_id
  from ranked r
  where r.cnt > 1
    and r.chat_id <> r.keep_id
  on conflict (old_chat_id) do nothing;

  get diagnostics moved_count = row_count;
  if moved_count = 0 then
    return;
  end if;

  -- group_members: avoid PK conflicts when merging into keep_chat_id
  delete from public.group_members gm
  using _chat_dedupe_map m
  where gm.chat_id = m.old_chat_id
    and exists (
      select 1 from public.group_members gm2
      where gm2.chat_id = m.keep_chat_id
        and gm2.user_id = gm.user_id
    );
  update public.group_members gm
  set chat_id = m.keep_chat_id
  from _chat_dedupe_map m
  where gm.chat_id = m.old_chat_id;

  -- chat_settings: avoid PK conflicts
  delete from public.chat_settings cs
  using _chat_dedupe_map m
  where cs.chat_id = m.old_chat_id
    and exists (
      select 1 from public.chat_settings cs2
      where cs2.chat_id = m.keep_chat_id
        and cs2.user_id = cs.user_id
    );
  update public.chat_settings cs
  set chat_id = m.keep_chat_id
  from _chat_dedupe_map m
  where cs.chat_id = m.old_chat_id;

  -- typing_status: avoid PK conflicts
  delete from public.typing_status ts
  using _chat_dedupe_map m
  where ts.chat_id = m.old_chat_id
    and exists (
      select 1 from public.typing_status ts2
      where ts2.chat_id = m.keep_chat_id
        and ts2.user_id = ts.user_id
    );
  update public.typing_status ts
  set chat_id = m.keep_chat_id
  from _chat_dedupe_map m
  where ts.chat_id = m.old_chat_id;

  -- pinned_messages: avoid PK conflicts
  delete from public.pinned_messages pm
  using _chat_dedupe_map m
  where pm.chat_id = m.old_chat_id
    and exists (
      select 1 from public.pinned_messages pm2
      where pm2.chat_id = m.keep_chat_id
        and pm2.user_id = pm.user_id
        and pm2.message_id = pm.message_id
    );
  update public.pinned_messages pm
  set chat_id = m.keep_chat_id
  from _chat_dedupe_map m
  where pm.chat_id = m.old_chat_id;

  -- hidden_messages: avoid PK conflicts
  delete from public.hidden_messages hm
  using _chat_dedupe_map m
  where hm.chat_id = m.old_chat_id
    and exists (
      select 1 from public.hidden_messages hm2
      where hm2.chat_id = m.keep_chat_id
        and hm2.user_id = hm.user_id
        and hm2.message_id = hm.message_id
    );
  update public.hidden_messages hm
  set chat_id = m.keep_chat_id
  from _chat_dedupe_map m
  where hm.chat_id = m.old_chat_id;

  -- messages: safe to repoint (message PK stays same)
  update public.messages msg
  set chat_id = m.keep_chat_id
  from _chat_dedupe_map m
  where msg.chat_id = m.old_chat_id;

  -- Finally remove the duplicate chat rows themselves.
  delete from public.chats c
  using _chat_dedupe_map m
  where c.id = m.old_chat_id;
end $$;

-- Enforce deterministic chat keys:
-- - DMs: `core-backend` stores a deterministic `_dm_key()` in `chats.name`
-- - Groups: `core-backend` can also look up by `name` when it uses a key-like value
-- Without uniqueness, duplicate threads lead to unread/presence/membership inconsistencies.
--
-- IMPORTANT:
-- Supabase PostgREST "upsert" / `on_conflict=...` requires a UNIQUE CONSTRAINT (or a non-partial unique index it can target).
-- A partial unique index (WHERE ...) cannot be reliably targeted and can cause:
--   42P10: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- We therefore enforce uniqueness via a real constraint on (type, name).
-- To keep it safe on existing databases, we backfill NULL names first.
update public.chats
set name = id::text
where name is null;

alter table public.chats
  alter column name set not null;

alter table public.chats
  add constraint chats_type_name_unique unique (type, name);

drop index if exists public.idx_chats_type_name_unique;

create index if not exists idx_group_members_user_id on public.group_members(user_id);
create index if not exists idx_group_members_chat_id on public.group_members(chat_id);

create index if not exists idx_messages_chat_id_created_at on public.messages(chat_id, created_at desc);
create index if not exists idx_messages_sender_id on public.messages(sender_id);
create index if not exists idx_messages_not_deleted on public.messages(chat_id, created_at desc) where is_deleted = false;

-- Unread-style filters: chat_id + sender_id + created_at (neq sender scans)
create index if not exists idx_messages_chat_sender_created_at on public.messages(chat_id, sender_id, created_at desc);

create index if not exists idx_reactions_message_id on public.message_reactions(message_id);
create index if not exists idx_pins_chat_id on public.pinned_messages(chat_id);
create index if not exists idx_chat_settings_user_id on public.chat_settings(user_id);
create index if not exists idx_chat_settings_chat_id on public.chat_settings(chat_id);
create index if not exists idx_hidden_messages_user_chat on public.hidden_messages(user_id, chat_id);

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
alter table public.hidden_messages enable row level security;

-- =========================================
-- COLUMN PRIVILEGES (avoid leaking email)
-- =========================================
grant usage on schema public to anon, authenticated;

revoke all on table public.users from anon, authenticated;
grant select (id, username, avatar_url, created_at) on table public.users to authenticated;

-- Allow authenticated clients to query/write through RLS-protected tables.
-- RLS still controls row access; these grants only remove Postgres-level permission errors.
grant select, insert, update, delete on table public.chats to authenticated;
grant select, insert, update, delete on table public.group_members to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.message_reactions to authenticated;
grant select, insert, update, delete on table public.pinned_messages to authenticated;
grant select, insert, update, delete on table public.chat_settings to authenticated;
grant select, insert, update, delete on table public.hidden_messages to authenticated;
grant select, insert, update, delete on table public.message_reads to authenticated;
grant select, insert, update, delete on table public.typing_status to authenticated;
grant select, insert, update, delete on table public.presence to authenticated;

-- =========================================
-- USERS POLICIES
-- =========================================
drop policy if exists "Users can view own profile" on public.users;
create policy "Users can view own profile"
on public.users
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
on public.users
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can search directory" on public.users;
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

-- Read chat metadata without triggering RLS recursion.
create or replace function public.chat_meta(_chat_id uuid)
returns table(type text, name text, created_by uuid)
language sql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select c.type, c.name, c.created_by
  from public.chats c
  where c.id = _chat_id
  limit 1;
$$;

revoke all on function public.chat_meta(uuid) from public;
grant execute on function public.chat_meta(uuid) to authenticated;

create or replace function public.is_chat_creator(_chat_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select exists (
    select 1 from public.chats c
    where c.id = _chat_id
      and c.created_by = _user_id
  );
$$;

revoke all on function public.is_chat_creator(uuid, uuid) from public;
grant execute on function public.is_chat_creator(uuid, uuid) to authenticated;

-- DM helper: is `_user_id` one of the two participants for this direct chat id?
create or replace function public.is_direct_chat_participant(_chat_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select exists (
    select 1
    from public.chats c
    where c.id = _chat_id
      and c.type = 'direct'
      and c.name like 'dm:%:%'
      and _user_id::text in (split_part(c.name, ':', 2), split_part(c.name, ':', 3))
  );
$$;

revoke all on function public.is_direct_chat_participant(uuid, uuid) from public;
grant execute on function public.is_direct_chat_participant(uuid, uuid) to authenticated;

-- DM helper: allow inserting membership rows only for the two DM participants.
create or replace function public.is_direct_chat_pair(_chat_id uuid, _a uuid, _b uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
  select exists (
    select 1
    from public.chats c
    where c.id = _chat_id
      and c.type = 'direct'
      and c.name like 'dm:%:%'
      and _a::text in (split_part(c.name, ':', 2), split_part(c.name, ':', 3))
      and _b::text in (split_part(c.name, ':', 2), split_part(c.name, ':', 3))
  );
$$;

revoke all on function public.is_direct_chat_pair(uuid, uuid, uuid) from public;
grant execute on function public.is_direct_chat_pair(uuid, uuid, uuid) to authenticated;

drop policy if exists "Users can view chats" on public.chats;
create policy "Users can view chats"
on public.chats
for select
to authenticated
using (
  created_by = auth.uid()
  or (
    chats.type = 'direct'
    and chats.name like 'dm:%:%'
    and auth.uid()::text in (split_part(chats.name, ':', 2), split_part(chats.name, ':', 3))
  )
  or exists (
    select 1 where public.is_chat_member(chats.id, auth.uid())
  )
);

drop policy if exists "Users can create chats" on public.chats;
create policy "Users can create chats"
on public.chats
for insert
to authenticated
with check (created_by = auth.uid());

-- =========================================
-- GROUP MEMBERS POLICIES
-- =========================================
drop policy if exists "Users can view members" on public.group_members;
create policy "Users can view members"
on public.group_members
for select
to authenticated
using (
  public.is_chat_member(group_members.chat_id, auth.uid())
);

drop policy if exists "Users can insert memberships" on public.group_members;
create policy "Users can insert memberships"
on public.group_members
for insert
to authenticated
with check (
  -- user can always insert their own membership row (self-join)
  auth.uid() = user_id
  and (
    -- already a member (idempotent / merge inserts)
    public.is_chat_member(group_members.chat_id, auth.uid())
    -- creator can add themselves (groups)
    or public.is_chat_creator(group_members.chat_id, auth.uid())
    -- DM participants can self-join based on deterministic dm:<a>:<b> key
    or public.is_direct_chat_participant(group_members.chat_id, auth.uid())
  )
  -- additionally, allow inserting the other participant row only for DMs (so one side can link both)
  or (
    public.is_direct_chat_pair(group_members.chat_id, auth.uid(), user_id)
  )
);

drop policy if exists "Users can update memberships" on public.group_members;
create policy "Users can update memberships"
on public.group_members
for update
to authenticated
using (
  -- allow self updates only (role changes should be server-side/service-role)
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);
-- =========================================
-- MESSAGES POLICIES
-- =========================================
drop policy if exists "Insert messages" on public.messages;
create policy "Insert messages"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and (
    public.is_chat_member(chat_id, auth.uid())
    or public.is_direct_chat_participant(messages.chat_id, auth.uid())
  )
);

drop policy if exists "Read messages" on public.messages;
create policy "Read messages"
on public.messages
for select
to authenticated
using (
  public.is_chat_member(messages.chat_id, auth.uid())
  or public.is_direct_chat_participant(messages.chat_id, auth.uid())
);

drop policy if exists "Delete own messages" on public.messages;
create policy "Delete own messages"
on public.messages
for delete
to authenticated
using (auth.uid() = sender_id);

-- Allow soft-delete (update) by sender only
drop policy if exists "Update own messages" on public.messages;
create policy "Update own messages"
on public.messages
for update
to authenticated
using (auth.uid() = sender_id)
with check (auth.uid() = sender_id);

-- =========================================
-- REACTIONS POLICIES
-- =========================================
drop policy if exists "React in member chats" on public.message_reactions;
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
drop policy if exists "Pin in member chats" on public.pinned_messages;
create policy "Pin in member chats"
on public.pinned_messages
for all
to authenticated
using (public.is_chat_member(pinned_messages.chat_id, auth.uid()) and auth.uid() = user_id)
with check (public.is_chat_member(pinned_messages.chat_id, auth.uid()) and auth.uid() = user_id);

-- =========================================
-- CHAT SETTINGS POLICIES
-- =========================================
drop policy if exists "Chat settings read" on public.chat_settings;
create policy "Chat settings read"
on public.chat_settings
for select
to authenticated
using (auth.uid() = user_id and public.is_chat_member(chat_settings.chat_id, auth.uid()));

drop policy if exists "Chat settings write" on public.chat_settings;
create policy "Chat settings write"
on public.chat_settings
for insert
to authenticated
with check (auth.uid() = user_id and public.is_chat_member(chat_settings.chat_id, auth.uid()));

drop policy if exists "Chat settings update" on public.chat_settings;
create policy "Chat settings update"
on public.chat_settings
for update
to authenticated
using (auth.uid() = user_id and public.is_chat_member(chat_settings.chat_id, auth.uid()))
with check (auth.uid() = user_id and public.is_chat_member(chat_settings.chat_id, auth.uid()));

-- =========================================
-- MESSAGE READS POLICIES
-- =========================================
drop policy if exists "Insert reads" on public.message_reads;
create policy "Insert reads"
on public.message_reads
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Read receipts" on public.message_reads;
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
drop policy if exists "Typing update" on public.typing_status;
create policy "Typing update"
on public.typing_status
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Typing read" on public.typing_status;
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
drop policy if exists "Presence update" on public.presence;
create policy "Presence update"
on public.presence
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Presence read" on public.presence;
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

-- =========================================
-- HIDDEN MESSAGES POLICIES (delete for me)
-- NEW SCHEMA: required for PostgREST with user JWT (no service_role)
-- =========================================
drop policy if exists "hidden_messages insert own rows" on public.hidden_messages;
create policy "hidden_messages insert own rows"
on public.hidden_messages
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.is_chat_member(hidden_messages.chat_id, auth.uid())
);

drop policy if exists "hidden_messages read own rows" on public.hidden_messages;
create policy "hidden_messages read own rows"
on public.hidden_messages
for select
to authenticated
using (auth.uid() = user_id);

