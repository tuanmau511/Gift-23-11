-- Run once in the Supabase SQL Editor for this project.
create table if not exists public.birthday_events (
  event_id bigint generated always as identity primary key,
  visitor_id uuid not null,
  type text not null,
  value text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.birthday_admin_sessions (
  token_hash text primary key,
  expires_at timestamptz not null
);

create table if not exists public.birthday_login_attempts (
  client_hash text primary key,
  window_started timestamptz not null default now(),
  attempts integer not null
);

alter table public.birthday_events enable row level security;
alter table public.birthday_admin_sessions enable row level security;
alter table public.birthday_login_attempts enable row level security;

revoke all on public.birthday_events, public.birthday_admin_sessions, public.birthday_login_attempts from public, anon, authenticated;
grant select, insert on public.birthday_events to service_role;
grant select, insert, delete on public.birthday_admin_sessions to service_role;
grant select, delete on public.birthday_login_attempts to service_role;
grant usage, select on sequence public.birthday_events_event_id_seq to service_role;

create or replace function public.birthday_login_attempt(p_client_hash text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare attempt_count integer;
begin
  delete from public.birthday_login_attempts where window_started < now() - interval '1 day';
  delete from public.birthday_admin_sessions where expires_at < now();
  insert into public.birthday_login_attempts as attempts (client_hash, window_started, attempts)
  values (p_client_hash, now(), 1)
  on conflict on constraint birthday_login_attempts_pkey do update
  set window_started = case when attempts.window_started <= now() - interval '15 minutes' then now() else attempts.window_started end,
      attempts = case when attempts.window_started <= now() - interval '15 minutes' then 1 else attempts.attempts + 1 end
  returning attempts.attempts into attempt_count;
  return attempt_count <= 20;
end;
$$;

revoke all on function public.birthday_login_attempt(text) from public, anon, authenticated;
grant execute on function public.birthday_login_attempt(text) to service_role;
