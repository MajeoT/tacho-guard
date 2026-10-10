-- TachoGuard database. Run once in Supabase: SQL Editor > New query > paste > Run.
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

alter table public.tg_state enable row level security;
alter table public.tg_walks enable row level security;

drop policy if exists "own rows" on public.tg_state;
create policy "own rows" on public.tg_state for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own rows" on public.tg_walks;
create policy "own rows" on public.tg_walks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.tg_state, public.tg_walks from anon;
grant select, insert, update, delete on public.tg_state, public.tg_walks to authenticated;
