-- Only the server's service role can access challenges and opaque sessions.
create table public.wallet_auth_challenges (
  id text primary key,
  wallet_address text not null,
  message text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed boolean not null default false
);
create index wallet_auth_challenges_wallet_created on public.wallet_auth_challenges(wallet_address, created_at);
create table public.wallet_sessions (
  token_hash text primary key,
  wallet_address text not null,
  expires_at timestamptz not null
);
alter table public.wallet_auth_challenges enable row level security;
alter table public.wallet_sessions enable row level security;
revoke all on public.wallet_auth_challenges, public.wallet_sessions from anon, authenticated;
grant all on public.wallet_auth_challenges, public.wallet_sessions to service_role;

-- Serialize issuance per wallet to enforce the limit even across server instances.
create function public.issue_wallet_challenge(p_id text, p_wallet text, p_message text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_wallet, 0));
  if (select count(*) from wallet_auth_challenges where wallet_address = p_wallet and created_at > now() - interval '1 minute') >= 10 then
    return false;
  end if;
  insert into wallet_auth_challenges(id, wallet_address, message, expires_at)
  values (p_id, p_wallet, p_message, now() + interval '5 minutes');
  return true;
end;
$$;

-- Challenge consumption and session creation are one transaction. Replays lose.
create function public.consume_wallet_challenge(p_id text, p_token_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_wallet text;
begin
  update wallet_auth_challenges set consumed = true
  where id = p_id and consumed = false and expires_at > now()
  returning wallet_address into v_wallet;
  if v_wallet is null then return false; end if;
  insert into wallet_sessions(token_hash, wallet_address, expires_at)
  values (p_token_hash, v_wallet, now() + interval '8 hours');
  return true;
end;
$$;
revoke all on function public.issue_wallet_challenge(text, text, text) from public, anon, authenticated;
revoke all on function public.consume_wallet_challenge(text, text) from public, anon, authenticated;
grant execute on function public.issue_wallet_challenge(text, text, text) to service_role;
grant execute on function public.consume_wallet_challenge(text, text) to service_role;
