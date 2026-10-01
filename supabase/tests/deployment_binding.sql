begin;
create or replace function pg_temp.assert(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;
do $$
declare
  v_testnet uuid;
  v_next uuid;
  v_merchant uuid;
  v_legacy uuid;
  v_invoice uuid;
  v_draft uuid;
begin
  select id into v_testnet from public.contract_deployments where network = 'testnet' and architecture_contract_id = 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch';
  perform pg_temp.assert(v_testnet is not null, 'verified testnet pair is registered');
  perform pg_temp.assert(public.active_contract_deployment() is null, 'registration does not activate');

  insert into public.merchant_profiles (wallet_address) values ('ST1BINDING') returning id into v_merchant;
  insert into public.invoices (merchant_id, onchain_invoice_id, tx_id, amount, currency, recipient_address)
  values (v_merchant, 'INV_LEGACY', '0x1', 1, 'STX', 'ST1BINDING') returning id into v_legacy;
  perform pg_temp.assert((select deployment_id from public.invoices where id = v_legacy) is null, 'nothing is stamped without an active deployment');

  perform pg_temp.assert(public.activate_contract_deployment('testnet', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.proc', 'go live') = v_testnet, 'activation by identifiers');
  perform public.activate_contract_deployment('testnet', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.proc', 'again');
  perform pg_temp.assert((select count(*) from public.deployment_activations) = 1, 're-activating the active pair is a no-op');
  begin
    perform public.activate_contract_deployment('mainnet', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.proc', 'x');
    raise exception 'activated an unregistered pair';
  exception when no_data_found then null;
  end;

  update public.invoices set description = 'touched' where id = v_legacy;
  perform pg_temp.assert((select deployment_id from public.invoices where id = v_legacy) is null, 'legacy rows are never inferred from the active deployment');

  insert into public.invoices (merchant_id, onchain_invoice_id, tx_id, amount, currency, recipient_address)
  values (v_merchant, 'INV_NEW', '0x2', 1, 'STX', 'ST1BINDING') returning id into v_invoice;
  perform pg_temp.assert((select deployment_id from public.invoices where id = v_invoice) = v_testnet, 'new chain invoice bound to active deployment');

  insert into public.invoices (merchant_id, onchain_invoice_id, tx_id, status, amount, currency, recipient_address)
  values (v_merchant, null, null, 'draft', 5, 'USDCx', 'ST1BINDING') returning id into v_draft;
  perform pg_temp.assert((select deployment_id from public.invoices where id = v_draft) is null, 'drafts have no chain identity yet');
  update public.invoices set onchain_invoice_id = 'INV_DRAFT', tx_id = '0x3', status = 'pending' where id = v_draft;
  perform pg_temp.assert((select deployment_id from public.invoices where id = v_draft) = v_testnet, 'a draft is bound when it reaches the chain');

  perform public.project_invoice_payment(null, 'INV_NEW', 'RCP_NEW', '0xp', 'ST1PAYER', now(), 'B1', 10);
  perform pg_temp.assert((select deployment_id from public.receipts where onchain_receipt_id = 'RCP_NEW') = v_testnet, 'receipt inherits invoice deployment');

  insert into public.chain_event_inbox (event_key, phase, contract_id, event_name, block_hash, tx_id, event_index)
  values ('k1', 'apply', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.proc', 'invoice-paid', 'B1', '0xp', 0);
  insert into public.chain_event_inbox (event_key, phase, contract_id, event_name, block_hash, tx_id, event_index)
  values ('k2', 'apply', 'ST000000000000000000002AMW42H.unknown', 'invoice-paid', 'B1', '0xq', 0);
  perform pg_temp.assert((select deployment_id from public.chain_event_inbox where event_key = 'k1') = v_testnet, 'events bind by their own contract');
  perform pg_temp.assert((select deployment_id from public.chain_event_inbox where event_key = 'k2') is null, 'unknown contracts stay unbound');

  -- A later deployment does not re-point history.
  insert into public.contract_deployments (network, architecture_contract_id, processor_contract_id, architecture_source_sha256, processor_source_sha256, architecture_deploy_tx_id, processor_deploy_tx_id, evidence_note)
  values ('testnet', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch2', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.direct', repeat('a', 64), repeat('b', 64), '0x' || repeat('c', 64), '0x' || repeat('d', 64), 'test')
  returning id into v_next;
  perform public.activate_contract_deployment('testnet', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch2', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.direct', 'upgrade');
  perform pg_temp.assert((select deployment_id from public.invoices where id = v_invoice) = v_testnet, 'history keeps its deployment after an upgrade');
  perform pg_temp.assert((select count(*) from public.contract_deployment_directory('testnet') where active) = 1, 'exactly one active deployment');
  perform pg_temp.assert((select id from public.contract_deployment_directory('testnet') where active) = v_next, 'directory marks the new pair active');

  begin
    update public.invoices set deployment_id = v_next where id = v_invoice;
    raise exception 'rebinding allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.receipts (invoice_id, merchant_id, onchain_receipt_id, tx_id, amount, currency, payer_wallet_address, paid_at, deployment_id)
    values (v_invoice, v_merchant, 'RCP_X', '0xx', 1, 'STX', 'ST1PAYER', now(), v_next);
    raise exception 'cross-deployment receipt allowed';
  exception when check_violation then null;
  end;
  begin
    delete from public.deployment_activations;
    raise exception 'activation history deleted';
  exception when check_violation then null;
  end;
end;
$$;
rollback;
