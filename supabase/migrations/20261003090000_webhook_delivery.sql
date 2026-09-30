-- Signed, durable merchant webhooks (P0-08).
--
-- merchant_events is the outbox. A trigger creates one delivery per matching enabled endpoint in
-- the same transaction as the event, so an event and its deliveries are never out of step. A
-- leased worker sends deliveries with exponential backoff and dead-letters them; endpoints that
-- keep failing are disabled. Signing secrets are stored encrypted (they must be recoverable to
-- sign), never in plaintext.

-- Endpoints -----------------------------------------------------------------------------------
alter table public.webhook_endpoints
  add column if not exists public_id text not null default ('we_' || encode(gen_random_bytes(12), 'hex')),
  add column if not exists description text not null default '',
  add column if not exists enabled_events text[] not null default array['*'],
  add column if not exists status text not null default 'enabled',
  add column if not exists disabled_reason text,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists secret_ciphertext text,
  add column if not exists secret_prefix text;

create unique index if not exists webhook_endpoints_public_id on public.webhook_endpoints (public_id);
create index if not exists idx_webhook_endpoints_merchant on public.webhook_endpoints (merchant_id, created_at desc, id desc);
alter table public.webhook_endpoints add constraint webhook_endpoints_status_check check (status in ('enabled', 'disabled'));
alter table public.webhook_endpoints add constraint webhook_endpoints_https check (url ~ '^https://' or url ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]+)?/') not valid;

-- The scaffold stored plaintext secrets. Clear them and disable those endpoints: their owners must
-- create a new endpoint, which issues an encrypted secret.
alter table public.webhook_endpoints alter column signing_secret drop not null;
update public.webhook_endpoints
set signing_secret = null, status = 'disabled', disabled_reason = 'secret_migration'
where secret_ciphertext is null;
alter table public.webhook_endpoints add constraint webhook_endpoints_no_plaintext_secret check (signing_secret is null);

-- Deliveries ----------------------------------------------------------------------------------
alter table public.webhook_deliveries
  add column if not exists public_id text not null default ('whd_' || encode(gen_random_bytes(12), 'hex')),
  add column if not exists event_id uuid references public.merchant_events(id) on delete restrict,
  add column if not exists replay_of uuid references public.webhook_deliveries(id) on delete set null,
  add column if not exists attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists lease_until timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text,
  add column if not exists duration_ms integer,
  add column if not exists response_excerpt text,
  add column if not exists completed_at timestamptz;

alter table public.webhook_deliveries drop constraint if exists webhook_deliveries_status_check;
alter table public.webhook_deliveries add constraint webhook_deliveries_status_check
  check (status in ('pending', 'delivering', 'succeeded', 'failed', 'dead', 'delivered'));

create unique index if not exists webhook_deliveries_public_id on public.webhook_deliveries (public_id);
create unique index if not exists webhook_deliveries_one_per_endpoint_event
on public.webhook_deliveries (endpoint_id, event_id) where replay_of is null and event_id is not null;
create index if not exists idx_webhook_deliveries_due
on public.webhook_deliveries (next_attempt_at, created_at) where status in ('pending', 'delivering');
create index if not exists idx_webhook_deliveries_merchant on public.webhook_deliveries (merchant_id, created_at desc, id desc);

-- Fan out each event to matching enabled endpoints, atomically with the event.
create or replace function public.fan_out_merchant_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'stackpay.ping' then
    return new; -- test events are delivered only to the endpoint that requested them
  end if;
  insert into public.webhook_deliveries (merchant_id, endpoint_id, event_id, event, status, target_url, request_body)
  select new.merchant_id, e.id, new.id, new.type, 'pending', e.url, '{}'::jsonb
  from public.webhook_endpoints e
  where e.merchant_id = new.merchant_id
    and e.status = 'enabled'
    and e.secret_ciphertext is not null
    and ('*' = any(e.enabled_events) or new.type = any(e.enabled_events))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists merchant_events_fan_out on public.merchant_events;
create trigger merchant_events_fan_out after insert on public.merchant_events
for each row execute function public.fan_out_merchant_event();

-- Lease due deliveries with everything needed to send them.
create or replace function public.claim_webhook_deliveries(p_limit integer, p_lease_seconds integer)
returns table (
  delivery_id uuid, delivery_public_id text, attempts integer, endpoint_id uuid, endpoint_public_id text,
  url text, secret_ciphertext text, event_public_id text, event_type text, event_data jsonb, event_created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with claimed as (
    update public.webhook_deliveries d
    set status = 'delivering', attempts = d.attempts + 1, last_attempt_at = now(),
        lease_until = now() + make_interval(secs => greatest(p_lease_seconds, 15))
    where d.id in (
      select id from public.webhook_deliveries
      where (status = 'pending' and next_attempt_at <= now())
         or (status = 'delivering' and lease_until < now())
      order by next_attempt_at, created_at
      for update skip locked
      limit greatest(least(p_limit, 100), 1)
    )
    returning d.*
  )
  select c.id, c.public_id, c.attempts, e.id, e.public_id, e.url, e.secret_ciphertext,
         ev.public_id, ev.type, ev.data, ev.created_at
  from claimed c
  join public.webhook_endpoints e on e.id = c.endpoint_id
  join public.merchant_events ev on ev.id = c.event_id;
end;
$$;

-- Record an attempt. Outcome is returned: succeeded | retry | dead | failed.
--   * success: done; the endpoint's failure streak resets.
--   * retryable failure: backoff 1m, 5m, 30m, 2h (or Retry-After, capped at 2h), then dead.
--   * permanent failure (for example 4xx): failed immediately.
--   * gone (410): failed, and the endpoint is disabled.
-- Five consecutive dead/failed deliveries disable the endpoint.
create or replace function public.record_webhook_attempt(
  p_delivery_id uuid,
  p_success boolean,
  p_response_status integer,
  p_error text,
  p_duration_ms integer,
  p_retryable boolean,
  p_retry_after_seconds integer,
  p_response_excerpt text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_delivery public.webhook_deliveries;
  v_endpoint public.webhook_endpoints;
  v_delays integer[] := array[60, 300, 1800, 7200];
  v_outcome text;
  v_delay integer;
begin
  select * into v_delivery from public.webhook_deliveries where id = p_delivery_id for update;
  if not found then return 'missing'; end if;
  select * into v_endpoint from public.webhook_endpoints where id = v_delivery.endpoint_id for update;

  if p_success then
    update public.webhook_deliveries
    set status = 'succeeded', response_code = p_response_status, duration_ms = p_duration_ms, last_error = null,
        lease_until = null, completed_at = now(), response_excerpt = left(p_response_excerpt, 200)
    where id = p_delivery_id;
    update public.webhook_endpoints set consecutive_failures = 0 where id = v_endpoint.id;
    return 'succeeded';
  end if;

  if p_retryable and v_delivery.attempts <= array_length(v_delays, 1) and coalesce(p_response_status, 0) <> 410 then
    v_delay := coalesce(least(greatest(p_retry_after_seconds, v_delays[v_delivery.attempts]), 7200), v_delays[v_delivery.attempts]);
    update public.webhook_deliveries
    set status = 'pending', response_code = p_response_status, duration_ms = p_duration_ms, last_error = left(p_error, 500),
        lease_until = null, next_attempt_at = now() + make_interval(secs => v_delay), response_excerpt = left(p_response_excerpt, 200)
    where id = p_delivery_id;
    return 'retry';
  end if;

  v_outcome := case when p_retryable then 'dead' else 'failed' end;
  update public.webhook_deliveries
  set status = v_outcome, response_code = p_response_status, duration_ms = p_duration_ms, last_error = left(p_error, 500),
      lease_until = null, completed_at = now(), response_excerpt = left(p_response_excerpt, 200)
  where id = p_delivery_id;

  update public.webhook_endpoints
  set consecutive_failures = consecutive_failures + 1,
      status = case when p_response_status = 410 or consecutive_failures + 1 >= 5 then 'disabled' else status end,
      disabled_reason = case when p_response_status = 410 then 'endpoint_gone'
                             when consecutive_failures + 1 >= 5 then 'too_many_failures' else disabled_reason end
  where id = v_endpoint.id
  returning * into v_endpoint;

  if v_endpoint.status = 'disabled' then
    insert into public.notifications (merchant_id, source_key, kind, title, body, href, level, metadata)
    values (v_endpoint.merchant_id, 'webhook-disabled:' || v_endpoint.public_id || ':' || now()::date,
      'webhook_endpoint.disabled', 'Webhook endpoint disabled',
      'Deliveries to ' || v_endpoint.url || ' kept failing, so StackPay paused it. Fix the endpoint, then re-enable it and replay missed events.',
      '/developer', 'error', jsonb_build_object('endpoint', v_endpoint.public_id, 'reason', v_endpoint.disabled_reason))
    on conflict (source_key) do nothing;
  end if;
  return v_outcome;
end;
$$;

-- Queue a new attempt for an earlier delivery (after the merchant fixed their endpoint).
create or replace function public.replay_webhook_delivery(p_merchant_id uuid, p_public_id text)
returns public.webhook_deliveries
language plpgsql security definer set search_path = public as $$
declare
  v_original public.webhook_deliveries;
  v_replay public.webhook_deliveries;
begin
  select * into v_original from public.webhook_deliveries where public_id = p_public_id and merchant_id = p_merchant_id;
  if not found or v_original.event_id is null then return null; end if;
  insert into public.webhook_deliveries (merchant_id, endpoint_id, event_id, event, status, target_url, request_body, replay_of)
  select v_original.merchant_id, e.id, v_original.event_id, v_original.event, 'pending', e.url, '{}'::jsonb, v_original.id
  from public.webhook_endpoints e where e.id = v_original.endpoint_id
  returning * into v_replay;
  return v_replay;
end;
$$;

-- Send a test event to one endpoint.
create or replace function public.send_webhook_ping(p_merchant_id uuid, p_endpoint_public_id text)
returns public.webhook_deliveries
language plpgsql security definer set search_path = public as $$
declare
  v_endpoint public.webhook_endpoints;
  v_event public.merchant_events;
  v_delivery public.webhook_deliveries;
begin
  select * into v_endpoint from public.webhook_endpoints where public_id = p_endpoint_public_id and merchant_id = p_merchant_id;
  if not found then return null; end if;
  insert into public.merchant_events (merchant_id, event_key, type, data)
  values (p_merchant_id, 'stackpay.ping:' || gen_random_uuid(), 'stackpay.ping',
    jsonb_build_object('endpoint', v_endpoint.public_id, 'message', 'Test event from StackPay'))
  returning * into v_event;
  insert into public.webhook_deliveries (merchant_id, endpoint_id, event_id, event, status, target_url, request_body)
  values (p_merchant_id, v_endpoint.id, v_event.id, v_event.type, 'pending', v_endpoint.url, '{}'::jsonb)
  returning * into v_delivery;
  return v_delivery;
end;
$$;

-- Access -------------------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.claim_webhook_deliveries(integer,integer)',
    'public.record_webhook_attempt(uuid,boolean,integer,text,integer,boolean,integer,text)',
    'public.replay_webhook_delivery(uuid,text)',
    'public.send_webhook_ping(uuid,text)',
    'public.fan_out_merchant_event()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
