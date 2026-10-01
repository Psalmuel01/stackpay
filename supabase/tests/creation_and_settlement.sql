-- Idempotent creation and settlement recording. Rolled back.
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
  v_result jsonb;
begin
  insert into public.merchant_profiles (wallet_address) values ('ST1CREATE') returning id into v_merchant;
  insert into public.merchant_profiles (wallet_address) values ('ST1OTHER') returning id into v_other;

  v_result := public.record_invoice_creation(v_merchant, 'INV_C1', '0xc1', 12.5, 'STX', 'Order 382', 'Ada', 'ada@example.com',
    'ST1CREATE', now() + interval '1 hour', '{"orderId": "382"}', 'app', 'invoice.created');
  perform pg_temp.assert(v_result->>'outcome' = 'created', 'invoice created');
  perform pg_temp.assert(v_result->'invoice'->'metadata'->>'orderId' = '382', 'metadata stored');

  -- Replay with the same transaction is idempotent and never resets a paid invoice.
  update public.invoices set status = 'paid', paid_at = now() where onchain_invoice_id = 'INV_C1';
  v_result := public.record_invoice_creation(v_merchant, 'INV_C1', '0xc1', 12.5, 'STX', 'changed', '', '',
    'ST1CREATE', now(), '{}', 'chain_recovery', 'invoice.created');
  perform pg_temp.assert(v_result->>'outcome' = 'exists', 'replay exists');
  perform pg_temp.assert((select status from public.invoices where onchain_invoice_id = 'INV_C1') = 'paid', 'paid preserved');
  perform pg_temp.assert((select description from public.invoices where onchain_invoice_id = 'INV_C1') = 'Order 382', 'data preserved');
  perform pg_temp.assert((select count(*) from public.merchant_events where type = 'invoice.created') = 1, 'one created event');
  perform pg_temp.assert((select count(*) from public.activity_events where event_type = 'invoice.created') = 1, 'one created activity');

  -- The same id from another transaction or merchant is a conflict.
  perform pg_temp.assert(public.record_invoice_creation(v_merchant, 'INV_C1', '0xother', 1, 'STX', '', '', '', 'x', null, '{}', 'app', null)->>'outcome' = 'conflict', 'other tx conflicts');
  perform pg_temp.assert(public.record_invoice_creation(v_other, 'INV_C1', '0xc1', 1, 'STX', '', '', '', 'x', null, '{}', 'app', null)->>'outcome' = 'conflict', 'other merchant conflicts');

  -- New rows must satisfy currency and amount constraints.
  begin
    perform public.record_invoice_creation(v_merchant, 'INV_BAD', '0xbad', 0, 'STX', '', '', '', 'x', null, '{}', 'app', null);
    raise exception 'zero amount accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.record_invoice_creation(v_merchant, 'INV_BAD2', '0xbad2', 1, 'DOGE', '', '', '', 'x', null, '{}', 'app', null);
    raise exception 'unknown currency accepted';
  exception when check_violation then null;
  end;

  -- Settlements: idempotent, one event, conflict across merchants.
  perform pg_temp.assert(public.record_settlement(v_merchant, '0xs1', 'sBTC', 0.001, 'ST1DEST', now(), 'app')->>'outcome' = 'created', 'settlement created');
  perform pg_temp.assert(public.record_settlement(v_merchant, '0xs1', 'sBTC', 0.001, 'ST1DEST', now(), 'chain_recovery')->>'outcome' = 'exists', 'settlement replay exists');
  perform pg_temp.assert(public.record_settlement(v_other, '0xs1', 'sBTC', 0.001, 'ST1DEST', now(), 'app')->>'outcome' = 'conflict', 'settlement conflict');
  perform pg_temp.assert((select count(*) from public.merchant_events where type = 'settlement.confirmed') = 1, 'one settlement event');
  perform pg_temp.assert((select count(*) from public.settlement_runs where tx_id = '0xs1') = 1, 'one settlement run');
end;
$$;

rollback;
