-- TachoGuard phone notifications. Already applied to the live project; kept here so it can be rebuilt.
-- Run after schema.sql. The edge function is in supabase/functions/tg-push/index.ts.
-- pg_cron and pg_net must be enabled (Database > Extensions).

create table if not exists public.tg_push_subs (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null, p256dh text not null, auth text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint),
  constraint tg_push_subs_size check (octet_length(endpoint) <= 2000 and octet_length(p256dh) <= 200 and octet_length(auth) <= 100)
);
create table if not exists public.tg_reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null, fire_at timestamptz not null,
  title text not null default 'TachoGuard', body text not null default '', sent_at timestamptz,
  primary key (user_id, key),
  constraint tg_reminders_size check (char_length(key) <= 80 and char_length(title) <= 80 and char_length(body) <= 300)
);
create index if not exists tg_reminders_due on public.tg_reminders (fire_at) where sent_at is null;
-- One row, read only by the edge function (service role): the notification key pair and the secret the timer sends.
create table if not exists public.tg_push_keys (
  id int primary key check (id = 1), public_key text, private_key text, cron_secret text not null
);
alter table public.tg_push_subs enable row level security;
alter table public.tg_reminders enable row level security;
alter table public.tg_push_keys enable row level security;   -- no policy: nobody but the service role can read it
create policy "own rows" on public.tg_push_subs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows" on public.tg_reminders for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.tg_push_subs, public.tg_reminders, public.tg_push_keys from anon, authenticated;
grant select, insert, update, delete on public.tg_push_subs, public.tg_reminders to authenticated;
insert into public.tg_push_keys (id, cron_secret) values (1, encode(extensions.gen_random_bytes(24), 'hex')) on conflict (id) do nothing;

-- The last app version the edge function has seen, so it can tell phones once when a new one goes live.
alter table public.tg_push_keys add column if not exists last_version text;
-- Once a minute: if any reminder is due, wake the edge function. Every 5 minutes it is woken anyway to look for a new app version.
create or replace function public.tg_push_tick() returns void language plpgsql security definer set search_path = '' as 'begin if exists (select 1 from public.tg_reminders where sent_at is null and fire_at <= now() and fire_at > now() - interval ''30 minutes'') or extract(minute from now())::int % 5 = 0 then perform net.http_post(url := ''https://ixtyqcfbsqmvoaaptmtc.supabase.co/functions/v1/tg-push'', headers := jsonb_build_object(''Content-Type'', ''application/json'', ''x-cron-secret'', (select cron_secret from public.tg_push_keys where id = 1)), body := ''{"cron":true}''::jsonb); end if; end';
revoke execute on function public.tg_push_tick() from public, anon, authenticated;
select cron.schedule('tg-push-tick', '* * * * *', 'select public.tg_push_tick()');
