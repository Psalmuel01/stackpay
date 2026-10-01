-- Webhook fan-out, delivery lifecycle, retries, dead-letter, disablement, replay, ping. Rolled back.
begin;

create or replace function pg_temp.assert(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

do $$
declare
  v_merchant uuid;
  v_all uuid;
  v_paid_only uuid;
  v_delivery record;
  v_outcome text;
  v_id uuid;
  v_replay public.webhook_deliveries;
  v_ping public.webhook_deliveries;
begin
  insert into public.merchant_profiles (wallet_address) values ('ST1HOOK') returning id into v_merchant;
  insert into public.webhook_endpoints (merchant_id, url, secret_ciphertext, secret_prefix)
  values (v_merchant, 'https://example.com/all', 'v1:cipher', 'whsec_ab') returning id into v_all;
  insert into public.webhook_endpoints (merchant_id, url, secret_ciphertext, secret_prefix, enabled_events)
  values (v_merchant, 'https://example.com/paid', 'v1:cipher', 'whsec_cd', array['invoice.paid']) returning id into v_paid_only;
  insert into public.webhook_endpoints (merchant_id, url, secret_ciphertext, secret_prefix, status)
  values (v_merchant, 'https://example.com/off', 'v1:cipher', 'whsec_ef', 'disabled');

  -- Plaintext secrets are rejected; non-https URLs are rejected (localhost allowed for development).
  begin
    insert into public.webhook_endpoints (merchant_id, url, signing_secret) values (v_merchant, 'https://x.test', 'plain');
    raise exception 'plaintext secret stored';
  exception when check_violation then null;
  end;
  begin
    insert into public.webhook_endpoints (merchant_id, url, secret_ciphertext) values (v_merchant, 'http://example.com/hook', 'v1:c');
    raise exception 'http endpoint stored';
  exception when check_violation then null;
  end;

  -- Fan-out happens with the event, respecting event filters and endpoint status.
  insert into public.merchant_events (merchant_id, event_key, type, data) values (v_merchant, 'e1', 'invoice.created', '{}');
  insert into public.merchant_events (merchant_id, event_key, type, data) values (v_merchant, 'e2', 'invoice.paid', '{}');
  perform pg_temp.assert((select count(*) from public.webhook_deliveries where endpoint_id = v_all) = 2, 'catch-all endpoint gets both');
  perform pg_temp.assert((select count(*) from public.webhook_deliveries where endpoint_id = v_paid_only) = 1, 'filtered endpoint gets invoice.paid only');
  perform pg_temp.assert((select count(*) from public.webhook_deliveries where target_url = 'https://example.com/off') = 0, 'disabled endpoint gets nothing');

  -- Claim returns everything needed to sign and send, and leases each delivery once.
  select * into v_delivery from public.claim_webhook_deliveries(1, 60);
  perform pg_temp.assert(v_delivery.url is not null and v_delivery.secret_ciphertext = 'v1:cipher' and v_delivery.event_public_id ~ '^evt_', 'claim payload complete');
  perform pg_temp.assert(v_delivery.attempts = 1, 'attempt counted');
  perform pg_temp.assert((select status = 'delivering' and lease_until > now() from public.webhook_deliveries where id = v_delivery.delivery_id), 'delivery is leased and will not be reclaimed until the lease expires');

  -- Retry schedule: 1m, 5m, 30m, 2h, then dead.
  v_id := v_delivery.delivery_id;
  perform pg_temp.assert(public.record_webhook_attempt(v_id, false, 500, 'server error', 120, true, null, 'oops') = 'retry', 'first failure retries');
  perform pg_temp.assert((select next_attempt_at from public.webhook_deliveries where id = v_id) between now() + interval '59 seconds' and now() + interval '61 seconds', 'first retry after 1 minute');
  foreach v_outcome in array array['retry', 'retry', 'retry', 'dead'] loop
    update public.webhook_deliveries set attempts = attempts + 1 where id = v_id;
    perform pg_temp.assert(public.record_webhook_attempt(v_id, false, 503, 'unavailable', 100, true, null, null) = v_outcome, 'schedule step ' || v_outcome);
  end loop;
  perform pg_temp.assert((select status from public.webhook_deliveries where id = v_id) = 'dead', 'dead-lettered');
  perform pg_temp.assert((select consecutive_failures from public.webhook_endpoints where id = v_all) = 1, 'failure streak counted');

  -- Retry-After is honoured but capped at 2 hours.
  select delivery_id into v_id from public.claim_webhook_deliveries(10, 60) where endpoint_id = v_paid_only;
  perform public.record_webhook_attempt(v_id, false, 429, 'slow down', 50, true, 999999, null);
  perform pg_temp.assert((select next_attempt_at from public.webhook_deliveries where id = v_id) <= now() + interval '2 hours 1 second', 'Retry-After capped');

  -- Success resets the streak.
  update public.webhook_deliveries set status = 'delivering' where id = v_id;
  perform pg_temp.assert(public.record_webhook_attempt(v_id, true, 200, null, 40, false, null, 'ok') = 'succeeded', 'success recorded');

  -- A permanent 4xx fails immediately; five consecutive failures disable the endpoint and notify.
  for i in 1..4 loop
    insert into public.merchant_events (merchant_id, event_key, type, data) values (v_merchant, 'streak' || i, 'invoice.created', '{}');
  end loop;
  for v_delivery in select * from public.claim_webhook_deliveries(10, 60) where endpoint_id = v_all loop
    perform public.record_webhook_attempt(v_delivery.delivery_id, false, 404, 'not found', 30, false, null, null);
  end loop;
  perform pg_temp.assert((select status from public.webhook_endpoints where id = v_all) = 'disabled', 'endpoint disabled after 5 failures');
  perform pg_temp.assert((select disabled_reason from public.webhook_endpoints where id = v_all) = 'too_many_failures', 'disable reason');
  perform pg_temp.assert(exists (select 1 from public.notifications where kind = 'webhook_endpoint.disabled'), 'merchant notified');
  insert into public.merchant_events (merchant_id, event_key, type, data) values (v_merchant, 'after-disable', 'invoice.created', '{}');
  perform pg_temp.assert(not exists (select 1 from public.webhook_deliveries d join public.merchant_events e on e.id = d.event_id where e.event_key = 'after-disable' and d.endpoint_id = v_all), 'no deliveries to a disabled endpoint');

  -- 410 Gone disables immediately.
  insert into public.merchant_events (merchant_id, event_key, type, data) values (v_merchant, 'gone', 'invoice.paid', '{}');
  select delivery_id into v_id from public.claim_webhook_deliveries(10, 60) where endpoint_id = v_paid_only;
  perform pg_temp.assert(public.record_webhook_attempt(v_id, false, 410, 'gone', 10, true, null, null) = 'dead', '410 is final');
  perform pg_temp.assert((select disabled_reason from public.webhook_endpoints where id = v_paid_only) = 'endpoint_gone', '410 disables endpoint');

  -- Replay creates a fresh attempt linked to the original.
  update public.webhook_endpoints set status = 'enabled', consecutive_failures = 0, disabled_reason = null where id = v_all;
  select * into v_replay from public.replay_webhook_delivery(v_merchant, (select public_id from public.webhook_deliveries where status = 'dead' limit 1));
  perform pg_temp.assert(v_replay.status = 'pending' and v_replay.replay_of is not null, 'replay queued');
  perform pg_temp.assert(public.replay_webhook_delivery('00000000-0000-0000-0000-000000000000', v_replay.public_id) is null, 'cannot replay another merchant''s delivery');

  -- Ping goes only to the chosen endpoint.
  select * into v_ping from public.send_webhook_ping(v_merchant, (select public_id from public.webhook_endpoints where id = v_all));
  perform pg_temp.assert(v_ping.endpoint_id = v_all, 'ping targets the endpoint');
  perform pg_temp.assert((select count(*) from public.webhook_deliveries where event = 'stackpay.ping') = 1, 'ping not fanned out');

  -- Crash recovery: an expired lease is reclaimed.
  update public.webhook_deliveries set status = 'delivering', lease_until = now() - interval '1 second' where id = v_ping.id;
  perform pg_temp.assert(exists (select 1 from public.claim_webhook_deliveries(100, 60) where delivery_id = v_ping.id), 'expired lease reclaimed');
end;
$$;

rollback;
