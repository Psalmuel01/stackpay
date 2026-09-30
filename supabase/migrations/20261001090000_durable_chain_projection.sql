-- Durable, deterministic projection of chain events (P0-02).
--
-- Invariants:
--   * A chain event is identified by (phase, contract, block hash, tx id, event index), not by
--     receipt id. Redelivery of the same event is a no-op; a reapply after rollback is new work.
--   * Every projection of a payment (invoice state, receipt, activity, notification, outbox event)
--     happens in one transaction, so a crash never leaves a half-applied payment.
--   * A rollback never deletes evidence: the receipt is kept and marked orphaned.
--   * Invoice status changes are compare-and-set, so wall-clock expiry cannot overwrite a payment.

-- Receipts become the confirmed-payment ledger, with explicit chain identity and reversal state.
alter table public.receipts
  add column if not exists status text not null default 'confirmed',
  add column if not exists block_hash text,
  add column if not exists block_height bigint,
  add column if not exists orphaned_at timestamptz;

alter table public.receipts
  add constraint receipts_status_check check (status in ('confirmed', 'orphaned'));

-- An invoice is paid exactly once on-chain, so at most one confirmed receipt may exist for it.
create unique index if not exists receipts_one_confirmed_per_invoice
on public.receipts (invoice_id)
where status = 'confirmed';

-- Idempotent activity inserts.
alter table public.activity_events add column if not exists source_key text;
create unique index if not exists activity_events_source_key
on public.activity_events (source_key)
where source_key is not null;

-- Merchant-facing event outbox. Written in the same transaction as the state it describes;
-- webhook delivery fans out from here.
create table if not exists public.merchant_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete restrict,
  event_key text not null unique,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_merchant_events_merchant_created
on public.merchant_events (merchant_id, created_at desc);

-- Durable inbox of chain events awaiting projection.
create table if not exists public.chain_event_inbox (
  id bigserial primary key,
  event_key text not null unique,
  phase text not null check (phase in ('apply', 'rollback')),
  contract_id text not null,
  event_name text not null,
  block_hash text not null,
  block_height bigint,
  tx_id text not null,
  event_index integer not null check (event_index >= 0),
  invoice_onchain_id text,
  receipt_onchain_id text,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'dead')),
  outcome text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_chain_event_inbox_due
on public.chain_event_inbox (next_attempt_at, id)
where status in ('pending', 'processing');

create index if not exists idx_chain_event_inbox_identity
on public.chain_event_inbox (contract_id, block_hash, tx_id, event_index);

-- Enqueue an event. Returns the inbox id when there is (new or renewed) work, null for a duplicate.
-- An apply that was already processed is re-queued only if a rollback of the same event arrived
-- after it (apply → rollback → reapply of the same block).
create or replace function public.enqueue_chain_event(
  p_phase text,
  p_contract_id text,
  p_event_name text,
  p_block_hash text,
  p_block_height bigint,
  p_tx_id text,
  p_event_index integer,
  p_invoice_onchain_id text,
  p_receipt_onchain_id text,
  p_data jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := p_phase || ':' || p_contract_id || ':' || p_block_hash || ':' || p_tx_id || ':' || p_event_index;
  v_id bigint;
  v_existing public.chain_event_inbox;
begin
  insert into public.chain_event_inbox (
    event_key, phase, contract_id, event_name, block_hash, block_height, tx_id, event_index,
    invoice_onchain_id, receipt_onchain_id, data
  ) values (
    v_key, p_phase, p_contract_id, p_event_name, p_block_hash, p_block_height, p_tx_id, p_event_index,
    p_invoice_onchain_id, p_receipt_onchain_id, coalesce(p_data, '{}'::jsonb)
  )
  on conflict (event_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select * into v_existing from public.chain_event_inbox where event_key = v_key for update;

  if p_phase = 'apply'
     and v_existing.status in ('processed', 'dead')
     and exists (
       select 1 from public.chain_event_inbox r
       where r.phase = 'rollback'
         and r.contract_id = p_contract_id and r.block_hash = p_block_hash
         and r.tx_id = p_tx_id and r.event_index = p_event_index
         and r.id > v_existing.id
     ) then
    -- Move the event to the back of the queue so it is ordered after the rollback it follows.
    update public.chain_event_inbox
    set id = nextval('public.chain_event_inbox_id_seq'), status = 'pending', outcome = null, attempts = 0,
        lease_until = null, last_error = null, processed_at = null,
        next_attempt_at = now(), received_at = now(),
        block_height = coalesce(p_block_height, block_height), data = coalesce(p_data, data)
    where id = v_existing.id
    returning id into v_id;
    return v_id;
  end if;

  return null;
end;
$$;

-- Lease up to p_limit due events in arrival order. Expired leases (crashed workers) are reclaimed.
create or replace function public.claim_chain_events(p_limit integer, p_lease_seconds integer)
returns setof public.chain_event_inbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.chain_event_inbox e
  set status = 'processing',
      attempts = e.attempts + 1,
      lease_until = now() + make_interval(secs => greatest(p_lease_seconds, 5))
  where e.id in (
    select id from public.chain_event_inbox
    where (status = 'pending' and next_attempt_at <= now())
       or (status = 'processing' and lease_until < now())
    order by id
    for update skip locked
    limit greatest(least(p_limit, 100), 1)
  )
  returning e.*;
end;
$$;

create or replace function public.complete_chain_event(p_id bigint, p_outcome text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chain_event_inbox
  set status = 'processed', outcome = p_outcome, lease_until = null, last_error = null,
      processed_at = now()
  where id = p_id;
$$;

-- Record a failure. Retries back off exponentially (30s, 1m, 2m, … capped at 1h) until
-- p_max_attempts, after which the event is dead-lettered for manual reconciliation.
create or replace function public.fail_chain_event(p_id bigint, p_error text, p_max_attempts integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.chain_event_inbox;
begin
  select * into v_event from public.chain_event_inbox where id = p_id for update;
  if not found then
    return 'missing';
  end if;
  if v_event.attempts >= p_max_attempts then
    update public.chain_event_inbox
    set status = 'dead', last_error = left(p_error, 500), lease_until = null, processed_at = now()
    where id = p_id;
    return 'dead';
  end if;
  update public.chain_event_inbox
  set status = 'pending', last_error = left(p_error, 500), lease_until = null,
      next_attempt_at = now()
        + make_interval(secs => least(3600, 30 * power(2, greatest(v_event.attempts - 1, 0))::integer))
  where id = p_id;
  return 'retry';
end;
$$;

create or replace function public.format_token_amount(p_amount numeric)
returns text
language sql
immutable
as $$
  select case when p_amount = trunc(p_amount) then trunc(p_amount)::text
              else rtrim(rtrim(p_amount::text, '0'), '.') end;
$$;

-- Atomically project a verified payment. Callers must verify the transaction against the chain
-- first. Outcomes: processed | duplicate | missing_invoice | superseded | conflict.
create or replace function public.project_invoice_payment(
  p_inbox_id bigint,
  p_invoice_onchain_id text,
  p_receipt_onchain_id text,
  p_tx_id text,
  p_payer text,
  p_paid_at timestamptz,
  p_block_hash text,
  p_block_height bigint
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_receipt public.receipts;
  v_inbox public.chain_event_inbox;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_generation text := coalesce(p_block_hash, p_tx_id);
begin
  -- A rollback of this exact event that arrived later wins, whatever order workers run in.
  if p_inbox_id is not null then
    select * into v_inbox from public.chain_event_inbox where id = p_inbox_id;
    if found and exists (
      select 1 from public.chain_event_inbox r
      where r.phase = 'rollback' and r.id > v_inbox.id
        and r.contract_id = v_inbox.contract_id and r.block_hash = v_inbox.block_hash
        and r.tx_id = v_inbox.tx_id and r.event_index = v_inbox.event_index
    ) then
      return 'superseded';
    end if;
  end if;

  select * into v_invoice from public.invoices where onchain_invoice_id = p_invoice_onchain_id for update;
  if not found then
    return 'missing_invoice';
  end if;

  select * into v_receipt from public.receipts where onchain_receipt_id = p_receipt_onchain_id for update;

  if found and v_receipt.status = 'confirmed' then
    if v_receipt.tx_id = p_tx_id and v_receipt.invoice_id = v_invoice.id then
      return 'duplicate';
    end if;
    return 'conflict';
  end if;

  if exists (
    select 1 from public.receipts
    where invoice_id = v_invoice.id and status = 'confirmed' and onchain_receipt_id is distinct from p_receipt_onchain_id
  ) then
    return 'conflict';
  end if;

  if v_receipt.id is null then
    insert into public.receipts (
      merchant_id, invoice_id, receipt_key, onchain_receipt_id, tx_id, payer_wallet_address,
      amount, currency, paid_at, status, block_hash, block_height
    ) values (
      v_invoice.merchant_id, v_invoice.id, p_receipt_onchain_id, p_receipt_onchain_id, p_tx_id, p_payer,
      v_invoice.amount, v_invoice.currency, v_paid_at, 'confirmed', p_block_hash, p_block_height
    );
  else
    if v_receipt.invoice_id <> v_invoice.id then
      return 'conflict';
    end if;
    update public.receipts
    set status = 'confirmed', orphaned_at = null, tx_id = p_tx_id, payer_wallet_address = p_payer,
        paid_at = v_paid_at, block_hash = p_block_hash, block_height = p_block_height
    where id = v_receipt.id;
  end if;

  update public.invoices
  set status = 'paid', paid_at = v_paid_at, updated_at = now()
  where id = v_invoice.id and status <> 'paid';

  insert into public.activity_events (merchant_id, entity_type, entity_id, event_type, tx_id, payload, source_key)
  values (
    v_invoice.merchant_id, 'invoice', p_invoice_onchain_id, 'invoice.paid', p_tx_id,
    jsonb_build_object('onchainInvoiceId', p_invoice_onchain_id, 'receiptId', p_receipt_onchain_id),
    'invoice.paid:' || p_receipt_onchain_id || ':' || v_generation
  ) on conflict (source_key) where source_key is not null do nothing;

  insert into public.notifications (merchant_id, source_key, kind, title, body, href, level, metadata)
  values (
    v_invoice.merchant_id,
    'invoice-paid:' || p_receipt_onchain_id || ':' || v_generation,
    'invoice.paid', 'Invoice paid',
    public.format_token_amount(v_invoice.amount) || ' ' || v_invoice.currency || ' received for invoice '
      || case when length(p_invoice_onchain_id) > 14 then left(p_invoice_onchain_id, 10) || '...' else p_invoice_onchain_id end || '.',
    '/pay/' || p_invoice_onchain_id, 'success',
    jsonb_build_object('invoiceId', p_invoice_onchain_id, 'receiptId', p_receipt_onchain_id, 'txId', p_tx_id,
      'payerWalletAddress', p_payer, 'amount', public.format_token_amount(v_invoice.amount), 'currency', v_invoice.currency)
  ) on conflict (source_key) do nothing;

  insert into public.merchant_events (merchant_id, event_key, type, data)
  values (
    v_invoice.merchant_id,
    'invoice.paid:' || p_receipt_onchain_id || ':' || v_generation,
    'invoice.paid',
    jsonb_build_object(
      'invoice_id', p_invoice_onchain_id, 'receipt_id', p_receipt_onchain_id, 'tx_id', p_tx_id,
      'payer', p_payer, 'amount', public.format_token_amount(v_invoice.amount), 'currency', v_invoice.currency,
      'paid_at', v_paid_at, 'block_hash', p_block_hash, 'block_height', p_block_height
    )
  ) on conflict (event_key) do nothing;

  return 'processed';
end;
$$;

-- Atomically reverse a payment whose block was rolled back. Outcomes: reverted | noop.
create or replace function public.revert_invoice_payment(
  p_inbox_id bigint,
  p_receipt_onchain_id text,
  p_tx_id text,
  p_block_hash text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.receipts;
  v_invoice public.invoices;
  v_next_status text;
begin
  select * into v_receipt from public.receipts where onchain_receipt_id = p_receipt_onchain_id for update;
  if not found or v_receipt.status <> 'confirmed' or v_receipt.tx_id <> p_tx_id
     or (p_block_hash is not null and v_receipt.block_hash is not null and v_receipt.block_hash <> p_block_hash) then
    return 'noop';
  end if;

  select * into v_invoice from public.invoices where id = v_receipt.invoice_id for update;
  v_next_status := case when v_invoice.expires_at is not null and v_invoice.expires_at <= now()
                        then 'expired' else 'pending' end;

  update public.receipts set status = 'orphaned', orphaned_at = now() where id = v_receipt.id;
  update public.invoices
  set status = v_next_status, paid_at = null, updated_at = now()
  where id = v_invoice.id and status = 'paid';

  insert into public.activity_events (merchant_id, entity_type, entity_id, event_type, tx_id, payload, source_key)
  values (
    v_invoice.merchant_id, 'invoice', v_invoice.onchain_invoice_id, 'invoice.payment_reverted', p_tx_id,
    jsonb_build_object('onchainInvoiceId', v_invoice.onchain_invoice_id, 'receiptId', p_receipt_onchain_id),
    'invoice.payment_reverted:' || p_receipt_onchain_id || ':' || coalesce(v_receipt.block_hash, p_tx_id)
  ) on conflict (source_key) where source_key is not null do nothing;

  insert into public.notifications (merchant_id, source_key, kind, title, body, href, level, metadata)
  values (
    v_invoice.merchant_id,
    'invoice-reverted:' || p_receipt_onchain_id || ':' || coalesce(v_receipt.block_hash, p_tx_id),
    'invoice.payment_reverted', 'Payment reversed by the network',
    'The block containing the payment for invoice ' || v_invoice.onchain_invoice_id
      || ' was rolled back. The invoice is ' || v_next_status || ' again until the payment reconfirms.',
    '/pay/' || v_invoice.onchain_invoice_id, 'warning',
    jsonb_build_object('invoiceId', v_invoice.onchain_invoice_id, 'receiptId', p_receipt_onchain_id, 'txId', p_tx_id)
  ) on conflict (source_key) do nothing;

  insert into public.merchant_events (merchant_id, event_key, type, data)
  values (
    v_invoice.merchant_id,
    'invoice.payment_reverted:' || p_receipt_onchain_id || ':' || coalesce(v_receipt.block_hash, p_tx_id),
    'invoice.payment_reverted',
    jsonb_build_object('invoice_id', v_invoice.onchain_invoice_id, 'receipt_id', p_receipt_onchain_id,
      'tx_id', p_tx_id, 'block_hash', v_receipt.block_hash, 'status', v_next_status)
  ) on conflict (event_key) do nothing;

  return 'reverted';
end;
$$;

-- Compare-and-set expiry: only still-pending invoices past their expiry change state, in one
-- statement, so a payment committed concurrently is never overwritten.
create or replace function public.expire_due_invoices(p_merchant_id uuid)
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
    where status = 'pending'
      and expires_at is not null
      and expires_at <= now()
      and (p_merchant_id is null or merchant_id = p_merchant_id)
    returning id, merchant_id, onchain_invoice_id
  ), events as (
    insert into public.merchant_events (merchant_id, event_key, type, data)
    select merchant_id, 'invoice.expired:' || onchain_invoice_id, 'invoice.expired',
           jsonb_build_object('invoice_id', onchain_invoice_id)
    from expired
    on conflict (event_key) do nothing
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

-- Access: server (service role) only.
alter table public.merchant_events enable row level security;
alter table public.chain_event_inbox enable row level security;
revoke all on public.merchant_events, public.chain_event_inbox from public, anon, authenticated;
grant select, insert, update on public.merchant_events, public.chain_event_inbox to service_role;
grant usage on sequence public.chain_event_inbox_id_seq to service_role;
create policy merchant_events_service_role on public.merchant_events
for all to service_role using (true) with check (true);
create policy chain_event_inbox_service_role on public.chain_event_inbox
for all to service_role using (true) with check (true);

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.enqueue_chain_event(text,text,text,text,bigint,text,integer,text,text,jsonb)',
    'public.claim_chain_events(integer,integer)',
    'public.complete_chain_event(bigint,text)',
    'public.fail_chain_event(bigint,text,integer)',
    'public.project_invoice_payment(bigint,text,text,text,text,timestamptz,text,bigint)',
    'public.revert_invoice_payment(bigint,text,text,text)',
    'public.expire_due_invoices(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
