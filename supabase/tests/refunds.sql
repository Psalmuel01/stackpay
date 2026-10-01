begin;
create or replace function pg_temp.assert(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;
do $$
declare
  v_merchant uuid;
  v_other uuid;
  v_invoice uuid;
  v_result jsonb;
begin
  insert into public.merchant_profiles (wallet_address) values ('ST1REFUND') returning id into v_merchant;
  insert into public.merchant_profiles (wallet_address) values ('ST1OTHERM') returning id into v_other;
  insert into public.invoices (merchant_id, onchain_invoice_id, tx_id, amount, currency, recipient_address)
  values (v_merchant, 'INV_R', '0xc', 10, 'USDCx', 'ST1REFUND') returning id into v_invoice;

  perform pg_temp.assert(public.record_refund(v_merchant, v_invoice, '0xr0', 1, 'ST1PAYER', '', 1)->>'outcome' = 'not_refundable', 'unpaid invoice cannot be refunded');
  perform public.project_invoice_payment(null, 'INV_R', 'RCP_R', '0xpay', 'ST1PAYER', now(), 'BR', 5);

  perform pg_temp.assert(public.record_refund(v_merchant, v_invoice, '0xr1', 4, 'ST1ATTACKER', '', 6)->>'outcome' = 'not_refundable', 'refund must go to the original payer');
  perform pg_temp.assert(public.record_refund(v_other, v_invoice, '0xr1', 4, 'ST1PAYER', '', 6)->>'outcome' = 'not_refundable', 'another merchant cannot refund');

  v_result := public.record_refund(v_merchant, v_invoice, '0xr1', 4, 'ST1PAYER', 'Damaged item', 6);
  perform pg_temp.assert(v_result->>'outcome' = 'recorded' and v_result->>'invoice_status' = 'paid', 'partial refund keeps invoice paid');
  perform pg_temp.assert((v_result->'refund'->>'public_id') ~ '^rfd_', 'refund public id');
  perform pg_temp.assert(public.record_refund(v_merchant, v_invoice, '0xr1', 4, 'ST1PAYER', '', 6)->>'outcome' = 'exists', 'same tx is idempotent');
  perform pg_temp.assert(public.record_refund(v_merchant, v_invoice, '0xr1', 3, 'ST1PAYER', '', 6)->>'outcome' = 'conflict', 'same tx with other amount conflicts');

  v_result := public.record_refund(v_merchant, v_invoice, '0xr2', 7, 'ST1PAYER', '', 7);
  perform pg_temp.assert(v_result->>'outcome' = 'exceeds_remaining' and (v_result->>'remaining')::numeric = 6, 'cannot refund more than paid');

  v_result := public.record_refund(v_merchant, v_invoice, '0xr3', 6, 'ST1PAYER', '', 8);
  perform pg_temp.assert(v_result->>'invoice_status' = 'refunded', 'full refund marks invoice refunded');
  perform pg_temp.assert((select refunded_amount from public.invoices where id = v_invoice) = 10, 'cumulative refunded amount');
  perform pg_temp.assert((select count(*) from public.merchant_events where type = 'invoice.refunded') = 2, 'one event per refund');
  perform pg_temp.assert((select data->>'id' from public.merchant_events where type = 'invoice.refunded' limit 1) ~ '^inv_', 'refund event carries invoice public id');
  perform pg_temp.assert(public.record_refund(v_merchant, v_invoice, '0xr4', 1, 'ST1PAYER', '', 9)->>'outcome' = 'exceeds_remaining', 'nothing left to refund');

  begin
    update public.invoices set refunded_amount = 11 where id = v_invoice;
    raise exception 'over-refund allowed by schema';
  exception when check_violation then null;
  end;
end;
$$;
rollback;
