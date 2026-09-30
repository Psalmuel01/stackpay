-- Chain projection invariants (P0-02). Runs in a rolled-back transaction on a disposable database.
begin;

create or replace function pg_temp.assert(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

do $$
declare
  v_merchant uuid;
  v_invoice uuid;
  v_apply bigint;
  v_rollback bigint;
  v_reapply bigint;
  v_outcome text;
  c text := 'ST000000000000000000002AMW42H.architecture';
  tx text := '0x' || repeat('a', 64);
begin
  insert into public.merchant_profiles (wallet_address, company_name) values ('ST1MERCHANT', 'Lumen') returning id into v_merchant;
  insert into public.invoices (merchant_id, onchain_invoice_id, tx_id, amount, currency, recipient_address, expires_at)
  values (v_merchant, 'INV_1', '0xcreate', 250, 'USDCx', 'ST1MERCHANT', now() + interval '1 day') returning id into v_invoice;

  -- Enqueue is idempotent for the same event identity.
  v_apply := public.enqueue_chain_event('apply', c, 'invoice-paid', 'B1', 10, tx, 0, 'INV_1', 'RCP_1', '{}');
  perform pg_temp.assert(v_apply is not null, 'first enqueue creates work');
  perform pg_temp.assert(public.enqueue_chain_event('apply', c, 'invoice-paid', 'B1', 10, tx, 0, 'INV_1', 'RCP_1', '{}') is null, 'duplicate enqueue is a no-op');

  -- First projection applies everything once; a duplicate has no side effects.
  v_outcome := public.project_invoice_payment(v_apply, 'INV_1', 'RCP_1', tx, 'ST1PAYER', now(), 'B1', 10);
  perform pg_temp.assert(v_outcome = 'processed', 'first projection processed, got ' || v_outcome);
  perform public.complete_chain_event(v_apply, v_outcome);
  v_outcome := public.project_invoice_payment(v_apply, 'INV_1', 'RCP_1', tx, 'ST1PAYER', now(), 'B1', 10);
  perform pg_temp.assert(v_outcome = 'duplicate', 'second projection is duplicate, got ' || v_outcome);
  perform pg_temp.assert((select status from public.invoices where id = v_invoice) = 'paid', 'invoice paid');
  perform pg_temp.assert((select count(*) from public.receipts where invoice_id = v_invoice) = 1, 'one receipt');
  perform pg_temp.assert((select count(*) from public.activity_events where event_type = 'invoice.paid') = 1, 'one paid activity');
  perform pg_temp.assert((select count(*) from public.notifications where kind = 'invoice.paid') = 1, 'one paid notification');
  perform pg_temp.assert((select count(*) from public.merchant_events where type = 'invoice.paid') = 1, 'one paid event');
  perform pg_temp.assert((select body from public.notifications where kind = 'invoice.paid') like '250 USDCx received%', 'amount formatted without trailing zeros');

  -- A second, different payment for the same invoice is a conflict, never a second receipt.
  perform pg_temp.assert(public.project_invoice_payment(null, 'INV_1', 'RCP_2', '0x' || repeat('b', 64), 'ST1OTHER', now(), 'B2', 11) = 'conflict', 'second receipt conflicts');
  perform pg_temp.assert((select count(*) from public.receipts where invoice_id = v_invoice) = 1, 'still one receipt');

  -- Rollback reverts state but keeps the receipt as orphaned evidence.
  v_rollback := public.enqueue_chain_event('rollback', c, 'invoice-paid', 'B1', 10, tx, 0, 'INV_1', 'RCP_1', '{}');
  perform pg_temp.assert(public.revert_invoice_payment(v_rollback, 'RCP_1', tx, 'B1') = 'reverted', 'rollback reverted');
  perform public.complete_chain_event(v_rollback, 'reverted');
  perform pg_temp.assert((select status from public.invoices where id = v_invoice) = 'pending', 'invoice pending again');
  perform pg_temp.assert((select paid_at from public.invoices where id = v_invoice) is null, 'paid_at cleared');
  perform pg_temp.assert((select status from public.receipts where onchain_receipt_id = 'RCP_1') = 'orphaned', 'receipt orphaned, not deleted');
  perform pg_temp.assert((select count(*) from public.merchant_events where type = 'invoice.payment_reverted') = 1, 'reversal event');
  perform pg_temp.assert(public.revert_invoice_payment(v_rollback, 'RCP_1', tx, 'B1') = 'noop', 'second rollback is a no-op');

  -- The original apply, if retried after the rollback arrived, is superseded.
  perform pg_temp.assert(public.project_invoice_payment(v_apply, 'INV_1', 'RCP_1', tx, 'ST1PAYER', now(), 'B1', 10) = 'superseded', 'stale apply superseded');
  perform pg_temp.assert((select status from public.invoices where id = v_invoice) = 'pending', 'stale apply had no effect');

  -- Reapply of the same block is new work, ordered after the rollback, and projects again.
  v_reapply := public.enqueue_chain_event('apply', c, 'invoice-paid', 'B1', 10, tx, 0, 'INV_1', 'RCP_1', '{}');
  perform pg_temp.assert(v_reapply is not null and v_reapply > v_rollback, 'reapply requeued after rollback');
  perform pg_temp.assert(public.project_invoice_payment(v_reapply, 'INV_1', 'RCP_1', tx, 'ST1PAYER', now(), 'B1', 10) = 'processed', 'reapply processed');
  perform pg_temp.assert((select status from public.receipts where onchain_receipt_id = 'RCP_1') = 'confirmed', 'receipt reconfirmed');
  perform pg_temp.assert((select count(*) from public.receipts where invoice_id = v_invoice) = 1, 'reapply reuses the receipt');
  perform pg_temp.assert((select status from public.invoices where id = v_invoice) = 'paid', 'invoice paid again');
  perform pg_temp.assert((select count(*) from public.merchant_events where type = 'invoice.paid') = 1, 'same block reapply does not duplicate the paid event');

  -- Reorg into a different block: rollback B1, apply B3 → a new generation of paid event.
  perform public.revert_invoice_payment(null, 'RCP_1', tx, 'B1');
  perform pg_temp.assert(public.project_invoice_payment(null, 'INV_1', 'RCP_1', tx, 'ST1PAYER', now(), 'B3', 12) = 'processed', 'reorg projection processed');
  perform pg_temp.assert((select count(*) from public.merchant_events where type = 'invoice.paid') = 2, 'new block yields new paid event');
  perform pg_temp.assert(public.revert_invoice_payment(null, 'RCP_1', tx, 'B1') = 'noop', 'rollback of the old block does not revert the new one');

  -- Rollback that arrives before its apply was processed: the apply is superseded when it runs.
  insert into public.invoices (merchant_id, onchain_invoice_id, tx_id, amount, currency, recipient_address)
  values (v_merchant, 'INV_2', '0xcreate2', 1.5, 'STX', 'ST1MERCHANT');
  v_apply := public.enqueue_chain_event('apply', c, 'invoice-paid', 'B5', 20, '0x' || repeat('c', 64), 0, 'INV_2', 'RCP_5', '{}');
  v_rollback := public.enqueue_chain_event('rollback', c, 'invoice-paid', 'B5', 20, '0x' || repeat('c', 64), 0, 'INV_2', 'RCP_5', '{}');
  perform pg_temp.assert(public.revert_invoice_payment(v_rollback, 'RCP_5', '0x' || repeat('c', 64), 'B5') = 'noop', 'rollback before apply is a no-op');
  perform pg_temp.assert(public.project_invoice_payment(v_apply, 'INV_2', 'RCP_5', '0x' || repeat('c', 64), 'ST1PAYER', now(), 'B5', 20) = 'superseded', 'late apply superseded');
  perform pg_temp.assert((select status from public.invoices where onchain_invoice_id = 'INV_2') = 'pending', 'INV_2 stays pending');

  -- Missing invoice is reported, not acknowledged as success.
  perform pg_temp.assert(public.project_invoice_payment(null, 'INV_404', 'RCP_404', '0x' || repeat('d', 64), null, now(), 'B6', 21) = 'missing_invoice', 'missing invoice reported');
end;
$$;

-- Expiry is compare-and-set: it never overwrites a paid invoice.
do $$
declare
  v_merchant uuid;
begin
  select id into v_merchant from public.merchant_profiles where wallet_address = 'ST1MERCHANT';
  insert into public.invoices (merchant_id, onchain_invoice_id, tx_id, amount, currency, recipient_address, expires_at)
  values (v_merchant, 'INV_EXP', '0xe1', 1, 'STX', 'ST1MERCHANT', now() - interval '1 minute'),
         (v_merchant, 'INV_PAID_LATE', '0xe2', 1, 'STX', 'ST1MERCHANT', now() - interval '1 minute');
  perform public.project_invoice_payment(null, 'INV_PAID_LATE', 'RCP_LATE', '0x' || repeat('e', 64), null, now() - interval '2 minutes', 'B7', 30);
  perform pg_temp.assert(public.expire_due_invoices(v_merchant) = 1, 'only the unpaid invoice expires');
  perform pg_temp.assert((select status from public.invoices where onchain_invoice_id = 'INV_PAID_LATE') = 'paid', 'paid invoice not overwritten');
  perform pg_temp.assert((select status from public.invoices where onchain_invoice_id = 'INV_EXP') = 'expired', 'due invoice expired');
  perform pg_temp.assert(public.expire_due_invoices(v_merchant) = 0, 'expiry is idempotent');
  perform pg_temp.assert((select count(*) from public.merchant_events where type = 'invoice.expired') = 1, 'one expired event');
end;
$$;

-- Leasing, retries with backoff, crash recovery, and dead-lettering.
do $$
declare
  v_id bigint;
  v_claimed int;
  c text := 'ST000000000000000000002AMW42H.architecture';
begin
  delete from public.chain_event_inbox;
  v_id := public.enqueue_chain_event('apply', c, 'invoice-paid', 'BL', 40, '0x' || repeat('f', 64), 0, 'INV_X', 'RCP_X', '{}');
  select count(*) into v_claimed from public.claim_chain_events(10, 60);
  perform pg_temp.assert(v_claimed = 1, 'claimed once');
  select count(*) into v_claimed from public.claim_chain_events(10, 60);
  perform pg_temp.assert(v_claimed = 0, 'leased event is not claimed twice');

  -- A crashed worker's lease expires and the event is reclaimed.
  update public.chain_event_inbox set lease_until = now() - interval '1 second' where id = v_id;
  select count(*) into v_claimed from public.claim_chain_events(10, 60);
  perform pg_temp.assert(v_claimed = 1, 'expired lease reclaimed');
  perform pg_temp.assert((select attempts from public.chain_event_inbox where id = v_id) = 2, 'attempts counted');

  perform pg_temp.assert(public.fail_chain_event(v_id, 'chain unavailable', 5) = 'retry', 'failure retried');
  perform pg_temp.assert((select status from public.chain_event_inbox where id = v_id) = 'pending', 'back to pending');
  perform pg_temp.assert((select next_attempt_at from public.chain_event_inbox where id = v_id) > now(), 'backoff applied');
  select count(*) into v_claimed from public.claim_chain_events(10, 60);
  perform pg_temp.assert(v_claimed = 0, 'not claimed before backoff elapses');

  update public.chain_event_inbox set attempts = 5 where id = v_id;
  perform pg_temp.assert(public.fail_chain_event(v_id, 'still failing', 5) = 'dead', 'dead-lettered after max attempts');
  perform pg_temp.assert((select status from public.chain_event_inbox where id = v_id) = 'dead', 'status dead');
end;
$$;

-- Access control: only the server role can touch the inbox and outbox.
do $$
begin
  perform pg_temp.assert(not has_table_privilege('anon', 'public.chain_event_inbox', 'SELECT'), 'anon cannot read inbox');
  perform pg_temp.assert(not has_table_privilege('authenticated', 'public.merchant_events', 'SELECT'), 'clients cannot read events');
  perform pg_temp.assert(not has_function_privilege('authenticated', 'public.project_invoice_payment(bigint,text,text,text,text,timestamptz,text,bigint)', 'EXECUTE'), 'clients cannot project payments');
  perform pg_temp.assert(has_function_privilege('service_role', 'public.claim_chain_events(integer,integer)', 'EXECUTE'), 'server can claim');
end;
$$;

rollback;
