-- TachoGuard database. Run once in Supabase: SQL Editor > New query > paste > Run.
-- It is safe to run again: it only adds what is missing and resets the security rules.
-- Every row belongs to one signed in user and row level security stops anyone else reading or changing it.

-- One row per driver: their hours, breaks, rest, settings and archived weeks (stored as JSON text).
create table if not exists public.tg_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  u          bigint not null default 0,          -- last change time in ms, used to decide which copy is newest
  j          text   not null default '{}',
  updated_at timestamptz not null default now()
);

-- One row per walkaround check, with the main facts in real columns so you can query them.
create table if not exists public.tg_walks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,
  checked_at timestamptz,
  reg        text,
  vehicle    text,
  defects    int     not null default 0,
  dangerous  boolean not null default false,
  j          text    not null,                   -- the full record (every item, notes, history)
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists tg_walks_user_checked on public.tg_walks (user_id, checked_at desc);

-- Size limits. Anyone can create an account, so these stop one account filling the database.
-- A year of records is about 100 KB, so the limits leave plenty of room.
alter table public.tg_state drop constraint if exists tg_state_j_size;
alter table public.tg_state add  constraint tg_state_j_size check (octet_length(j) <= 1000000);  -- a year of entries is about 75-170 KB
alter table public.tg_state drop constraint if exists tg_state_u_pos;
alter table public.tg_state add  constraint tg_state_u_pos  check (u >= 0);
alter table public.tg_walks drop constraint if exists tg_walks_j_size;
alter table public.tg_walks add  constraint tg_walks_j_size check (octet_length(j) <= 65536);  -- a check without photos is 2-4 KB
alter table public.tg_walks drop constraint if exists tg_walks_id_len;
alter table public.tg_walks add  constraint tg_walks_id_len check (char_length(id) between 1 and 64);

-- updated_at is set by the database clock, not the phone's.
create or replace function public.tg_touch() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.tg_touch() from public, anon, authenticated;
drop trigger if exists tg_state_touch on public.tg_state;
create trigger tg_state_touch before insert or update on public.tg_state for each row execute function public.tg_touch();
drop trigger if exists tg_walks_touch on public.tg_walks;
create trigger tg_walks_touch before insert or update on public.tg_walks for each row execute function public.tg_touch();

alter table public.tg_state enable row level security;
alter table public.tg_walks enable row level security;

drop policy if exists "own rows" on public.tg_state;
create policy "own rows" on public.tg_state for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own rows" on public.tg_walks;
create policy "own rows" on public.tg_walks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Only what the app needs. Supabase grants every privilege by default, including TRUNCATE,
-- which ignores row level security, so take everything away and give back just these four.
revoke all on public.tg_state, public.tg_walks from anon, authenticated;
grant select, insert, update, delete on public.tg_state, public.tg_walks to authenticated;

-- New objects in public are not open to anon/authenticated by default; grant each one on purpose.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, public;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on table public.tg_push_keys from anon, authenticated;
