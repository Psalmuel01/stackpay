-- Versioned API foundation (P0-06, P0-07, P0-04 state machine).
--
-- * Invoices get a stable public id (inv_…) and an explicit lifecycle:
--     draft ──(customer creates it on-chain at checkout)──▶ pending ──▶ paid
--     draft ──▶ canceled (merchant, off-chain only)       pending/draft ──▶ expired
--   A draft is an off-chain payment request; no status here implies money moved.
-- * API keys: high-entropy secrets stored only as SHA-256 hashes, scoped, bound to the
--   deployment's environment (test/live), revocable, with last-used tracking.
-- * Idempotency keys: durable claims with request hashes and stored responses.
-- * Audit log for security-relevant actions.

-- Random public ids without pgcrypto: hosted Supabase installs pgcrypto in the "extensions" schema,
-- which is not on the migration search_path. Two v4 UUIDs (core since PostgreSQL 13) supply 96 random
-- bits as 24 lowercase hex characters; the version/variant nibbles are skipped.
create or replace function public.random_public_id(p_prefix text)
returns text
language sql
volatile
set search_path = pg_catalog
as $$
  select p_prefix
    || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    || substr(replace(gen_random_uuid()::text, '-', ''), 21, 12)
$$;

-- Invoice lifecycle ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists public_id text not null default public.random_public_id('inv_');
create unique index if not exists invoices_public_id on public.invoices (public_id);

alter table public.invoices alter column onchain_invoice_id drop not null;
alter table public.invoices alter column tx_id drop not null;
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('draft', 'pending', 'paid', 'expired', 'canceled'));
-- Anything past draft must be anchored to an on-chain invoice.
alter table public.invoices add constraint invoices_onchain_when_not_draft
  check (status in ('draft', 'canceled') or (status = 'expired' and onchain_invoice_id is null) or onchain_invoice_id is not null) not valid;

alter table public.invoices add column if not exists canceled_at timestamptz;
create index if not exists idx_invoices_merchant_created_id on public.invoices (merchant_id, created_at desc, id desc);

-- Legal transitions, enforced for every writer. Chain evidence (paid) may arrive for an invoice
-- that wall-clock expiry already marked expired, so expired → paid is allowed; paid → pending is
-- only a rollback of a reorganized block.
create or replace function public.guard_invoice_transition()
returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if (old.status, new.status) in (
    ('draft', 'pending'), ('draft', 'expired'), ('draft', 'canceled'),
    ('expired', 'pending'),
    ('pending', 'paid'), ('pending', 'expired'),
    ('expired', 'paid'),
    ('paid', 'pending'), ('paid', 'expired')
  ) then
    return new;
  end if;
  raise exception 'illegal invoice transition % -> %', old.status, new.status using errcode = '23514';
end;
$$;

drop trigger if exists invoices_transition_guard on public.invoices;
create trigger invoices_transition_guard
before update of status on public.invoices
for each row execute function public.guard_invoice_transition();

-- Drafts expire too; pending invoices expire by wall clock until chain evidence says otherwise.
create or replace function public.expire_due_invoices(p_merchant_id uuid, p_onchain_invoice_id text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.invoices
    set status = 'expired', updated_at = now()
    where status in ('draft', 'pending')
      and expires_at is not null
      and expires_at <= now()
      and (p_merchant_id is null or merchant_id = p_merchant_id)
      and (p_onchain_invoice_id is null or onchain_invoice_id = p_onchain_invoice_id)
    returning id, merchant_id, public_id, onchain_invoice_id
  ), events as (
    insert into public.merchant_events (merchant_id, event_key, type, data)
    select merchant_id, 'invoice.expired:' || public_id, 'invoice.expired',
           jsonb_build_object('id', public_id, 'invoice_id', onchain_invoice_id)
    from expired
    on conflict (event_key) do nothing
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

-- Create an API draft invoice (payment request) with its invoice.created event, atomically.
create or replace function public.create_draft_invoice(
  p_merchant_id uuid,
  p_amount numeric,
  p_currency text,
  p_description text,
  p_customer_name text,
  p_customer_email text,
  p_recipient text,
  p_expires_at timestamptz,
  p_metadata jsonb
) returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  insert into public.invoices (
    merchant_id, status, amount, currency, description, customer_name, customer_email,
    recipient_address, expires_at, metadata, creation_source
  ) values (
    p_merchant_id, 'draft', p_amount, p_currency, coalesce(p_description, ''), coalesce(p_customer_name, ''),
    coalesce(p_customer_email, ''), p_recipient, p_expires_at, coalesce(p_metadata, '{}'::jsonb), 'api'
  ) returning * into v_invoice;

  insert into public.merchant_events (merchant_id, event_key, type, data)
  values (p_merchant_id, 'invoice.created:' || v_invoice.public_id, 'invoice.created',
    jsonb_build_object('id', v_invoice.public_id, 'status', 'draft', 'amount', public.format_token_amount(p_amount),
      'currency', p_currency, 'description', v_invoice.description, 'expires_at', p_expires_at, 'metadata', v_invoice.metadata));
  return v_invoice;
end;
$$;

-- Cancel a draft. Invoices already created on-chain cannot be canceled off-chain.
create or replace function public.cancel_draft_invoice(p_merchant_id uuid, p_public_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where public_id = p_public_id and merchant_id = p_merchant_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if v_invoice.status = 'canceled' then return jsonb_build_object('outcome', 'canceled', 'invoice', to_jsonb(v_invoice)); end if;
  if v_invoice.status <> 'draft' then return jsonb_build_object('outcome', 'not_cancelable', 'status', v_invoice.status); end if;
  update public.invoices set status = 'canceled', canceled_at = now(), updated_at = now()
  where id = v_invoice.id returning * into v_invoice;
  insert into public.merchant_events (merchant_id, event_key, type, data)
  values (p_merchant_id, 'invoice.canceled:' || p_public_id, 'invoice.canceled', jsonb_build_object('id', p_public_id, 'status', 'canceled'))
  on conflict (event_key) do nothing;
  return jsonb_build_object('outcome', 'canceled', 'invoice', to_jsonb(v_invoice));
end;
$$;

-- Bind a draft to the on-chain invoice a customer created for it at checkout. The chain invoice
-- must match the draft's merchant, amount, and currency. Idempotent for the same chain invoice.
-- Outcome: attached | already_attached | not_found | mismatch | conflict
create or replace function public.attach_draft_invoice(
  p_public_id text,
  p_merchant_id uuid,
  p_onchain_invoice_id text,
  p_tx_id text,
  p_amount numeric,
  p_currency text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where public_id = p_public_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if v_invoice.onchain_invoice_id is not null then
    if v_invoice.onchain_invoice_id = p_onchain_invoice_id then
      return jsonb_build_object('outcome', 'already_attached', 'invoice', to_jsonb(v_invoice));
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;
  if v_invoice.merchant_id <> p_merchant_id or v_invoice.amount <> p_amount or v_invoice.currency <> p_currency then
    return jsonb_build_object('outcome', 'mismatch');
  end if;
  if v_invoice.status = 'canceled' then
    -- The customer created the chain invoice anyway; record it so the payment is not lost.
    return jsonb_build_object('outcome', 'mismatch');
  end if;

  update public.invoices
  set onchain_invoice_id = p_onchain_invoice_id, tx_id = p_tx_id, status = 'pending',
      expires_at = coalesce(p_expires_at, expires_at), updated_at = now()
  where id = v_invoice.id
  returning * into v_invoice;

  insert into public.activity_events (merchant_id, entity_type, entity_id, event_type, tx_id, payload, source_key)
  values (v_invoice.merchant_id, 'invoice', p_onchain_invoice_id, 'invoice.created', p_tx_id,
    jsonb_build_object('onchainInvoiceId', p_onchain_invoice_id, 'publicId', p_public_id,
      'amount', public.format_token_amount(v_invoice.amount), 'currency', v_invoice.currency, 'source', 'api'),
    'invoice.created:' || p_onchain_invoice_id)
  on conflict (source_key) where source_key is not null do nothing;

  insert into public.merchant_events (merchant_id, event_key, type, data)
  values (v_invoice.merchant_id, 'invoice.pending:' || p_public_id, 'invoice.pending',
    jsonb_build_object('id', p_public_id, 'invoice_id', p_onchain_invoice_id, 'tx_id', p_tx_id, 'status', 'pending',
      'amount', public.format_token_amount(v_invoice.amount), 'currency', v_invoice.currency,
      'expires_at', v_invoice.expires_at, 'metadata', v_invoice.metadata))
  on conflict (event_key) do nothing;

  return jsonb_build_object('outcome', 'attached', 'invoice', to_jsonb(v_invoice));
end;
$$;

-- Every invoice event carries the invoice's public id, whichever function wrote it.
create or replace function public.stamp_invoice_event_id()
returns trigger language plpgsql as $$
declare v_public_id text;
begin
  if new.type like 'invoice.%' and not (new.data ? 'id') and new.data ? 'invoice_id' then
    select public_id into v_public_id from public.invoices where onchain_invoice_id = new.data->>'invoice_id';
    if v_public_id is not null then
      new.data := new.data || jsonb_build_object('id', v_public_id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists merchant_events_stamp_invoice_id on public.merchant_events;
create trigger merchant_events_stamp_invoice_id before insert on public.merchant_events
for each row execute function public.stamp_invoice_event_id();

-- API keys -----------------------------------------------------------------------------------
create table if not exists public.api_keys (
  id text primary key default public.random_public_id('key_'),
  merchant_id uuid not null references public.merchant_profiles(id) on delete restrict,
  name text not null default '' check (length(name) <= 80),
  environment text not null check (environment in ('test', 'live')),
  key_prefix text not null,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (cardinality(scopes) > 0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz
);
create index if not exists idx_api_keys_merchant on public.api_keys (merchant_id, created_at desc);

-- Resolve a presented key hash to an active key, recording use (at most once a minute).
create or replace function public.authenticate_api_key(p_key_hash text)
returns table (key_id text, merchant_id uuid, environment text, scopes text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.api_keys k
  set last_used_at = now()
  where k.key_hash = p_key_hash
    and k.revoked_at is null
    and (k.expires_at is null or k.expires_at > now())
    and (k.last_used_at is null or k.last_used_at < now() - interval '1 minute');

  return query
  select k.id, k.merchant_id, k.environment, k.scopes
  from public.api_keys k
  where k.key_hash = p_key_hash
    and k.revoked_at is null
    and (k.expires_at is null or k.expires_at > now());
end;
$$;

-- Audit log ----------------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigserial primary key,
  merchant_id uuid references public.merchant_profiles(id) on delete restrict,
  actor_type text not null check (actor_type in ('wallet', 'api_key', 'system')),
  actor_id text not null,
  action text not null,
  target_type text,
  target_id text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_merchant on public.audit_log (merchant_id, created_at desc);

create or replace function public.protect_audit_log()
returns trigger language plpgsql as $$
begin
  raise exception 'audit log entries are append-only' using errcode = '23514';
end;
$$;
drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only before update or delete on public.audit_log
for each row execute function public.protect_audit_log();

-- Idempotency ---------------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  id bigserial primary key,
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  environment text not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 255),
  route text not null,
  request_hash text not null,
  state text not null default 'in_progress' check (state in ('in_progress', 'completed')),
  response_status integer,
  response_body jsonb,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (merchant_id, environment, idempotency_key)
);
create index if not exists idx_idempotency_expires on public.idempotency_keys (expires_at);

-- Claim a key. Returns {state: new|replay|mismatch|in_progress, id, status, body}.
-- * new: caller owns the lease and must complete or release it.
-- * replay: the stored response for an identical earlier request.
-- * mismatch: same key reused for a different route or request body.
-- * in_progress: another request with this key holds a live lease.
create or replace function public.begin_idempotent_request(
  p_merchant_id uuid,
  p_environment text,
  p_key text,
  p_route text,
  p_request_hash text,
  p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.idempotency_keys;
begin
  delete from public.idempotency_keys
  where merchant_id = p_merchant_id and environment = p_environment and idempotency_key = p_key and expires_at <= now();

  insert into public.idempotency_keys (merchant_id, environment, idempotency_key, route, request_hash, locked_until)
  values (p_merchant_id, p_environment, p_key, p_route, p_request_hash, now() + make_interval(secs => p_lease_seconds))
  on conflict (merchant_id, environment, idempotency_key) do nothing
  returning * into v_row;
  if v_row.id is not null then
    return jsonb_build_object('state', 'new', 'id', v_row.id);
  end if;

  select * into v_row from public.idempotency_keys
  where merchant_id = p_merchant_id and environment = p_environment and idempotency_key = p_key
  for update;

  if v_row.route <> p_route or v_row.request_hash <> p_request_hash then
    return jsonb_build_object('state', 'mismatch');
  end if;
  if v_row.state = 'completed' then
    return jsonb_build_object('state', 'replay', 'status', v_row.response_status, 'body', v_row.response_body);
  end if;
  if v_row.locked_until > now() then
    return jsonb_build_object('state', 'in_progress');
  end if;
  -- A previous holder crashed; take over its lease.
  update public.idempotency_keys set locked_until = now() + make_interval(secs => p_lease_seconds) where id = v_row.id;
  return jsonb_build_object('state', 'new', 'id', v_row.id);
end;
$$;

create or replace function public.complete_idempotent_request(p_id bigint, p_status integer, p_body jsonb)
returns void language sql security definer set search_path = public as $$
  update public.idempotency_keys
  set state = 'completed', response_status = p_status, response_body = p_body, locked_until = null
  where id = p_id and state = 'in_progress';
$$;

-- Release a claim after a transient failure so the client can retry with the same key.
create or replace function public.release_idempotent_request(p_id bigint)
returns void language sql security definer set search_path = public as $$
  delete from public.idempotency_keys where id = p_id and state = 'in_progress';
$$;

create or replace function public.purge_expired_idempotency_keys()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  delete from public.idempotency_keys where expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Access -------------------------------------------------------------------------------------
alter table public.api_keys enable row level security;
alter table public.audit_log enable row level security;
alter table public.idempotency_keys enable row level security;
revoke all on public.api_keys, public.audit_log, public.idempotency_keys from public, anon, authenticated;
grant select, insert, update on public.api_keys to service_role;
grant select, insert on public.audit_log to service_role;
grant usage on sequence public.audit_log_id_seq to service_role;
grant all on public.idempotency_keys to service_role;
grant usage on sequence public.idempotency_keys_id_seq to service_role;
create policy api_keys_service_role on public.api_keys for all to service_role using (true) with check (true);
create policy audit_log_service_role on public.audit_log for all to service_role using (true) with check (true);
create policy idempotency_keys_service_role on public.idempotency_keys for all to service_role using (true) with check (true);

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.expire_due_invoices(uuid,text)',
    'public.create_draft_invoice(uuid,numeric,text,text,text,text,text,timestamptz,jsonb)',
    'public.cancel_draft_invoice(uuid,text)',
    'public.attach_draft_invoice(text,uuid,text,text,numeric,text,timestamptz)',
    'public.authenticate_api_key(text)',
    'public.begin_idempotent_request(uuid,text,text,text,text,integer)',
    'public.complete_idempotent_request(bigint,integer,jsonb)',
    'public.release_idempotent_request(bigint)',
    'public.purge_expired_idempotency_keys()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
