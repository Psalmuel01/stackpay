-- Run against a disposable database after applying the wallet-session migration.
-- The transaction rolls back all test data.
begin;
do $$
begin
  if not public.issue_wallet_challenge('one', 'wallet-one', 'message') then raise exception 'issuance failed'; end if;
  if not public.consume_wallet_challenge('one', 'session-one') then raise exception 'consumption failed'; end if;
  if public.consume_wallet_challenge('one', 'session-replay') then raise exception 'replay accepted'; end if;
  if (select count(*) from public.wallet_sessions where token_hash in ('session-one', 'session-replay')) <> 1 then raise exception 'unexpected sessions'; end if;
  perform public.issue_wallet_challenge('expired', 'wallet-two', 'message');
  update public.wallet_auth_challenges set expires_at = now() - interval '1 second' where id = 'expired';
  if public.consume_wallet_challenge('expired', 'expired-session') then raise exception 'expired challenge accepted'; end if;
  for i in 1..10 loop
    if not public.issue_wallet_challenge('limit-' || i, 'wallet-limit', 'message') then raise exception 'early rate limit'; end if;
  end loop;
  if public.issue_wallet_challenge('limit-11', 'wallet-limit', 'message') then raise exception 'rate limit bypassed'; end if;
  if has_table_privilege('anon', 'public.wallet_sessions', 'SELECT') then raise exception 'anonymous session access'; end if;
  if has_function_privilege('authenticated', 'public.consume_wallet_challenge(text,text)', 'EXECUTE') then raise exception 'client RPC access'; end if;
  if not has_function_privilege('service_role', 'public.consume_wallet_challenge(text,text)', 'EXECUTE') then raise exception 'missing service role access'; end if;
  perform public.issue_wallet_challenge('concurrent', 'wallet-concurrent', 'message');
end;
$$;

rollback;
