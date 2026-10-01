-- Audience-bound sessions, revoke-all, rate limiting, retention. Rolled back.
begin;

create or replace function pg_temp.assert(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

do $$
begin
  perform public.issue_wallet_challenge('aud-1', 'wallet-aud', 'message');
  perform pg_temp.assert(public.consume_wallet_challenge('aud-1', 'session-aud', 'https://stackpay.test|testnet'), 'consumed with audience');
  perform pg_temp.assert((select audience from public.wallet_sessions where token_hash = 'session-aud') = 'https://stackpay.test|testnet', 'audience stored');
  perform pg_temp.assert(not public.consume_wallet_challenge('aud-1', 'session-aud-2', 'https://stackpay.test|testnet'), 'replay rejected');

  begin
    perform public.issue_wallet_challenge('aud-2', 'wallet-aud', 'message');
    perform public.consume_wallet_challenge('aud-2', 'session-no-aud', '');
    raise exception 'empty audience accepted';
  exception when invalid_parameter_value then null;
  end;

  perform public.issue_wallet_challenge('aud-3', 'wallet-aud', 'message');
  perform public.consume_wallet_challenge('aud-3', 'session-aud-3', 'https://stackpay.test|testnet');
  perform pg_temp.assert(public.revoke_wallet_sessions('wallet-aud') = 2, 'revoke-all removes every session');
  perform pg_temp.assert((select count(*) from public.wallet_sessions where wallet_address = 'wallet-aud') = 0, 'no sessions left');

  for i in 1..3 loop
    perform pg_temp.assert(public.take_rate_limit('ip:1.2.3.4', 3, 60), 'within limit ' || i);
  end loop;
  perform pg_temp.assert(not public.take_rate_limit('ip:1.2.3.4', 3, 60), 'over limit rejected');
  perform pg_temp.assert(public.take_rate_limit('ip:5.6.7.8', 3, 60), 'buckets are independent');
  update public.rate_limit_buckets set window_started_at = now() - interval '2 minutes' where bucket_key = 'ip:1.2.3.4';
  perform pg_temp.assert(public.take_rate_limit('ip:1.2.3.4', 3, 60), 'window resets');

  insert into public.wallet_sessions (token_hash, wallet_address, expires_at, audience) values ('expired', 'w', now() - interval '1 minute', 'a');
  perform pg_temp.assert((public.purge_expired_auth_rows()->>'sessions')::int >= 1, 'expired sessions purged');

  perform pg_temp.assert(not has_function_privilege('anon', 'public.take_rate_limit(text,integer,integer)', 'EXECUTE'), 'clients cannot use the limiter');
end;
$$;

rollback;
