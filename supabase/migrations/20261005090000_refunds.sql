-- Refunds (P2-03). A refund is recorded only after its on-chain transfer (merchant -> payer) has
-- been independently verified; the database never marks money as returned on its own.

alter table public.invoices add column if not exists refunded_amount numeric(30, 8) not null default 0;
alter table public.invoices add constraint invoices_refund_bounds check (refunded_amount >= 0 and refunded_amount <= amount) not valid;

alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('draft', 'pending', 'paid', 'expired', 'canceled', 'refunded'));

-- Allow paid -> refunded (full refund). A reorganized payment can still roll back.
create or replace function public.guard_invoice_transition()
returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if (old.status, new.status) in (
    ('draft', 'pending'), ('draft', 'expired'), ('draft', 'canceled'),
    ('expired', 'pending'),
    ('pending', 'paid'), ('pending', 'expired'),
    ('expired', 'paid'),
    ('paid', 'pending'), ('paid', 'expired'),
    ('paid', 'refunded'), ('refunded', 'pending'), ('refunded', 'expired')
  ) then
    return new;
  end if;
  raise exception 'illegal invoice transition % -> %', old.status, new.status using errcode = '23514';
end;
$$;

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('rfd_' || encode(gen_random_bytes(12), 'hex')),
  merchant_id uuid not null references public.merchant_profiles(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  receipt_id uuid not null references public.receipts(id) on delete restrict,
  tx_id text not null unique,
  amount numeric(30, 8) not null check (amount > 0),
  currency text not null check (currency in ('STX', 'sBTC', 'USDCx')),
  recipient text not null,
  reason text not null default '' check (length(reason) <= 200),
  block_height bigint,
  created_at timestamptz not null default now()
);
create index if not exists idx_refunds_invoice on public.refunds (invoice_id, created_at);
create index if not exists idx_refunds_merchant on public.refunds (merchant_id, created_at desc, id desc);
alter table public.refunds enable row level security;
revoke all on public.refunds from public, anon, authenticated;
grant select, insert on public.refunds to service_role;
create policy refunds_service_role on public.refunds for all to service_role using (true) with check (true);

-- Record a verified refund. Outcomes: recorded | exists | not_refundable | exceeds_remaining | conflict.
create or replace function public.record_refund(
  p_merchant_id uuid,
  p_invoice_id uuid,
  p_tx_id text,
  p_amount numeric,
  p_recipient text,
  p_reason text,
  p_block_height bigint
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_invoice public.invoices;
  v_receipt public.receipts;
  v_existing public.refunds;
  v_refund public.refunds;
  v_total numeric;
begin
  select * into v_existing from public.refunds where tx_id = p_tx_id;
  if found then
    if v_existing.invoice_id = p_invoice_id and v_existing.amount = p_amount then
      return jsonb_build_object('outcome', 'exists', 'refund', to_jsonb(v_existing));
    end if;
    return jsonb_build_object('outcome', 'conflict');
  end if;

  -- Serialize refunds per invoice so concurrent refunds cannot exceed the paid amount.
  select * into v_invoice from public.invoices where id = p_invoice_id and merchant_id = p_merchant_id for update;
  if not found or v_invoice.status not in ('paid', 'refunded') then
    return jsonb_build_object('outcome', 'not_refundable');
  end if;
  select * into v_receipt from public.receipts where invoice_id = v_invoice.id and status = 'confirmed';
  if not found or v_receipt.payer_wallet_address is distinct from p_recipient then
    return jsonb_build_object('outcome', 'not_refundable');
  end if;

  v_total := v_invoice.refunded_amount + p_amount;
  if v_total > v_invoice.amount then
    return jsonb_build_object('outcome', 'exceeds_remaining', 'remaining', v_invoice.amount - v_invoice.refunded_amount);
  end if;

  insert into public.refunds (merchant_id, invoice_id, receipt_id, tx_id, amount, currency, recipient, reason, block_height)
  values (p_merchant_id, v_invoice.id, v_receipt.id, p_tx_id, p_amount, v_invoice.currency, p_recipient, coalesce(p_reason, ''), p_block_height)
  returning * into v_refund;

  update public.invoices
  set refunded_amount = v_total,
      status = case when v_total = amount then 'refunded' else status end,
      updated_at = now()
  where id = v_invoice.id
  returning * into v_invoice;

  insert into public.activity_events (merchant_id, entity_type, entity_id, event_type, tx_id, payload, source_key)
  values (p_merchant_id, 'invoice', coalesce(v_invoice.onchain_invoice_id, v_invoice.public_id), 'invoice.refunded', p_tx_id,
    jsonb_build_object('refundId', v_refund.public_id, 'amount', public.format_token_amount(p_amount), 'currency', v_invoice.currency),
    'invoice.refunded:' || p_tx_id)
  on conflict (source_key) where source_key is not null do nothing;

  insert into public.merchant_events (merchant_id, event_key, type, data)
  values (p_merchant_id, 'invoice.refunded:' || p_tx_id, 'invoice.refunded',
    jsonb_build_object('id', v_invoice.public_id, 'invoice_id', v_invoice.onchain_invoice_id, 'status', v_invoice.status,
      'refund', jsonb_build_object('id', v_refund.public_id, 'amount', public.format_token_amount(p_amount), 'currency', v_invoice.currency,
        'tx_id', p_tx_id, 'recipient', p_recipient, 'reason', v_refund.reason),
      'refunded_amount', public.format_token_amount(v_total), 'amount', public.format_token_amount(v_invoice.amount)))
  on conflict (event_key) do nothing;

  return jsonb_build_object('outcome', 'recorded', 'refund', to_jsonb(v_refund), 'invoice_status', v_invoice.status, 'refunded_amount', v_total);
end;
$$;

revoke all on function public.record_refund(uuid,uuid,text,numeric,text,text,bigint) from public, anon, authenticated;
grant execute on function public.record_refund(uuid,uuid,text,numeric,text,text,bigint) to service_role;
