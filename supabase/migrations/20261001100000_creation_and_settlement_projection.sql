-- Atomic, idempotent recording of confirmed invoice creations and withdrawals (P0-02, P0-09).
-- The same functions serve the interactive confirmation path and chain-event recovery, and both
-- write the merchant_events outbox row that drives merchant webhooks.

-- Merchant-supplied correlation data (order id, customer id, …) for reconciliation.
alter table public.invoices add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.invoices add column if not exists creation_source text not null default 'app';

-- Constraints the original schema lacked. NOT VALID: enforced for new and updated rows without
-- rewriting historical data, which must be reviewed before VALIDATE CONSTRAINT.
alter table public.invoices add constraint invoices_currency_check check (currency in ('STX', 'sBTC', 'USDCx')) not valid;
alter table public.invoices add constraint invoices_amount_positive check (amount > 0) not valid;
alter table public.invoices add constraint invoices_metadata_object check (jsonb_typeof(metadata) = 'object') not valid;
alter table public.receipts add constraint receipts_amount_positive check (amount > 0) not valid;
alter table public.settlement_runs add constraint settlement_runs_amount_positive check (amount > 0) not valid;
alter table public.settlement_runs add constraint settlement_runs_currency_check check (currency in ('STX', 'sBTC', 'USDCx')) not valid;

-- Outcome: created | exists | conflict. On created/exists the invoice row is returned.
create or replace function public.record_invoice_creation(
  p_merchant_id uuid,
  p_onchain_invoice_id text,
  p_tx_id text,
  p_amount numeric,
  p_currency text,
  p_description text,
  p_customer_name text,
  p_customer_email text,
  p_recipient text,
  p_expires_at timestamptz,
  p_metadata jsonb,
  p_source text,
  p_activity_type text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_created boolean := false;
begin
  insert into public.invoices (
    merchant_id, onchain_invoice_id, tx_id, status, amount, currency, description,
    customer_name, customer_email, recipient_address, expires_at, metadata, creation_source
  ) values (
    p_merchant_id, p_onchain_invoice_id, p_tx_id, 'pending', p_amount, p_currency, coalesce(p_description, ''),
    coalesce(p_customer_name, ''), coalesce(p_customer_email, ''), p_recipient, p_expires_at,
    coalesce(p_metadata, '{}'::jsonb), coalesce(p_source, 'app')
  )
  on conflict (onchain_invoice_id) do nothing
  returning * into v_invoice;

  if v_invoice.id is not null then
    v_created := true;
  else
    -- A replay must never reset a paid invoice or replace customer or merchant data.
    select * into v_invoice from public.invoices where onchain_invoice_id = p_onchain_invoice_id;
    if v_invoice.tx_id <> p_tx_id or v_invoice.merchant_id <> p_merchant_id then
      return jsonb_build_object('outcome', 'conflict');
    end if;
  end if;

  insert into public.activity_events (merchant_id, entity_type, entity_id, event_type, tx_id, payload, source_key)
  values (
    p_merchant_id, 'invoice', p_onchain_invoice_id, coalesce(p_activity_type, 'invoice.created'), p_tx_id,
    jsonb_build_object('onchainInvoiceId', p_onchain_invoice_id, 'amount', public.format_token_amount(v_invoice.amount),
      'currency', v_invoice.currency, 'source', v_invoice.creation_source),
    'invoice.created:' || p_onchain_invoice_id
  ) on conflict (source_key) where source_key is not null do nothing;

  insert into public.merchant_events (merchant_id, event_key, type, data)
  values (
    p_merchant_id, 'invoice.created:' || p_onchain_invoice_id, 'invoice.created',
    jsonb_build_object(
      'invoice_id', p_onchain_invoice_id, 'tx_id', p_tx_id, 'status', v_invoice.status,
      'amount', public.format_token_amount(v_invoice.amount), 'currency', v_invoice.currency,
      'description', v_invoice.description, 'recipient', v_invoice.recipient_address,
      'expires_at', v_invoice.expires_at, 'metadata', v_invoice.metadata
    )
  ) on conflict (event_key) do nothing;

  return jsonb_build_object('outcome', case when v_created then 'created' else 'exists' end, 'invoice', to_jsonb(v_invoice));
end;
$$;

-- Outcome: created | exists | conflict. On created/exists the settlement run is returned.
create or replace function public.record_settlement(
  p_merchant_id uuid,
  p_tx_id text,
  p_currency text,
  p_amount numeric,
  p_destination text,
  p_executed_at timestamptz,
  p_source text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.settlement_runs;
  v_created boolean := false;
begin
  insert into public.settlement_runs (merchant_id, tx_id, currency, amount, destination, status, executed_at, metadata)
  values (p_merchant_id, p_tx_id, p_currency, p_amount, p_destination, 'completed', coalesce(p_executed_at, now()),
          jsonb_build_object('source', coalesce(p_source, 'app')))
  on conflict (tx_id) do nothing
  returning * into v_run;

  if v_run.id is not null then
    v_created := true;
  else
    select * into v_run from public.settlement_runs where tx_id = p_tx_id;
    if v_run.merchant_id <> p_merchant_id then
      return jsonb_build_object('outcome', 'conflict');
    end if;
  end if;

  insert into public.activity_events (merchant_id, entity_type, entity_id, event_type, tx_id, payload, source_key)
  values (
    p_merchant_id, 'settlement_run', v_run.id::text, 'settlement.completed', p_tx_id,
    jsonb_build_object('txId', p_tx_id, 'currency', v_run.currency, 'amount', public.format_token_amount(v_run.amount),
      'destination', v_run.destination),
    'settlement.completed:' || p_tx_id
  ) on conflict (source_key) where source_key is not null do nothing;

  insert into public.merchant_events (merchant_id, event_key, type, data)
  values (
    p_merchant_id, 'settlement.confirmed:' || p_tx_id, 'settlement.confirmed',
    jsonb_build_object('settlement_id', v_run.id, 'tx_id', p_tx_id, 'currency', v_run.currency,
      'amount', public.format_token_amount(v_run.amount), 'destination', v_run.destination, 'executed_at', v_run.executed_at)
  ) on conflict (event_key) do nothing;

  return jsonb_build_object('outcome', case when v_created then 'created' else 'exists' end, 'settlement', to_jsonb(v_run));
end;
$$;

revoke all on function public.record_invoice_creation(uuid,text,text,numeric,text,text,text,text,text,timestamptz,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.record_invoice_creation(uuid,text,text,numeric,text,text,text,text,text,timestamptz,jsonb,text,text) to service_role;
revoke all on function public.record_settlement(uuid,text,text,numeric,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.record_settlement(uuid,text,text,numeric,text,timestamptz,text) to service_role;
