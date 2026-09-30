-- Session hardening (P0-01 follow-up): audience-bound sessions, revoke-all, a shared
-- fixed-window rate limiter, and retention cleanup for authentication rows.

-- Sessions are bound to the app origin + network that issued them. Sessions issued before this
-- migration have no audience and are no longer accepted; merchants simply sign in again.
alter table public.wallet_sessions add column if not exists audience text;
alter table public.wallet_sessions add column if not exists created_at timestamptz not null default now();
create index if not exists wallet_sessions_wallet on public.wallet_sessions (wallet_address);
create index if not exists wallet_sessions_expires on public.wallet_sessions (expires_at);

create or replace function public.consume_wallet_challenge(p_id text, p_token_hash text, p_audience text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_wallet text;
begin
  if coalesce(p_audience, '') = '' then
    raise exception 'session audience is required' using errcode = '22023';
  end if;
  update wallet_auth_challenges set consumed = true
  where id = p_id and consumed = false and expires_at > now()
  returning wallet_address into v_wallet;
  if v_wallet is null then return false; end if;
  insert into wallet_sessions(token_hash, wallet_address, expires_at, audience)
  values (p_token_hash, v_wallet, now() + interval '8 hours', p_audience);
  return true;
end;
$$;

-- Sign out of every session for a wallet (for example after a suspected compromise).
create or replace function public.revoke_wallet_sessions(p_wallet text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  delete from wallet_sessions where wallet_address = p_wallet;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Fixed-window rate limiter shared by all server instances. Returns true when the request is allowed.
create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  hits integer not null
);
alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from public, anon, authenticated;
grant all on public.rate_limit_buckets to service_role;

create or replace function public.take_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hits integer;
begin
  insert into rate_limit_buckets (bucket_key, window_started_at, hits)
  values (p_key, now(), 1)
  on conflict (bucket_key) do update
  set hits = case when rate_limit_buckets.window_started_at <= now() - make_interval(secs => p_window_seconds)
                  then 1 else rate_limit_buckets.hits + 1 end,
      window_started_at = case when rate_limit_buckets.window_started_at <= now() - make_interval(secs => p_window_seconds)
                               then now() else rate_limit_buckets.window_started_at end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- Retention: drop expired challenges, sessions, and stale rate-limit windows.
create or replace function public.purge_expired_auth_rows()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_challenges integer; v_sessions integer; v_buckets integer;
begin
  delete from wallet_auth_challenges where expires_at < now() - interval '1 day';
  get diagnostics v_challenges = row_count;
  delete from wallet_sessions where expires_at < now();
  get diagnostics v_sessions = row_count;
  delete from rate_limit_buckets where window_started_at < now() - interval '1 day';
  get diagnostics v_buckets = row_count;
  return jsonb_build_object('challenges', v_challenges, 'sessions', v_sessions, 'rate_limit_buckets', v_buckets);
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.consume_wallet_challenge(text,text,text)',
    'public.revoke_wallet_sessions(text)',
    'public.take_rate_limit(text,integer,integer)',
    'public.purge_expired_auth_rows()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
