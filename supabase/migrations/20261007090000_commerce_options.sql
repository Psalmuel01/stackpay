-- Commerce options (P2-02): a post-payment return URL, and link -> invoice correlation.
-- Return URLs are https only; they are a convenience for the payer, never proof of payment.

alter table public.invoices add column if not exists success_url text
  check (success_url is null or (length(success_url) <= 2048 and success_url ~ '^https://[^/@\s]+(/\S*)?$'));
alter table public.payment_links add column if not exists success_url text
  check (success_url is null or (length(success_url) <= 2048 and success_url ~ '^https://[^/@\s]+(/\S*)?$'));

drop function if exists public.create_draft_invoice(uuid, numeric, text, text, text, text, text, timestamptz, jsonb);

create or replace function public.create_draft_invoice(
  p_merchant_id uuid,
  p_amount numeric,
  p_currency text,
  p_description text,
  p_customer_name text,
  p_customer_email text,
  p_recipient text,
  p_expires_at timestamptz,
  p_metadata jsonb,
  p_success_url text default null
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
    recipient_address, expires_at, metadata, creation_source, success_url
  ) values (
    p_merchant_id, 'draft', p_amount, p_currency, coalesce(p_description, ''), coalesce(p_customer_name, ''),
    coalesce(p_customer_email, ''), p_recipient, p_expires_at, coalesce(p_metadata, '{}'::jsonb), 'api', p_success_url
  ) returning * into v_invoice;

  insert into public.merchant_events (merchant_id, event_key, type, data)
  values (p_merchant_id, 'invoice.created:' || v_invoice.public_id, 'invoice.created',
    jsonb_build_object('id', v_invoice.public_id, 'status', 'draft', 'amount', public.format_token_amount(p_amount),
      'currency', p_currency, 'description', v_invoice.description, 'expires_at', p_expires_at, 'metadata', v_invoice.metadata));
  return v_invoice;
end;
$$;

revoke all on function public.create_draft_invoice(uuid, numeric, text, text, text, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_draft_invoice(uuid, numeric, text, text, text, text, text, timestamptz, jsonb, text) to service_role;
