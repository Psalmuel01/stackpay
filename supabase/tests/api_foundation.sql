-- API foundation: invoice lifecycle, drafts, API keys, idempotency, audit log. Rolled back.
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
  v_draft public.invoices;
  v_result jsonb;
begin
  insert into public.merchant_profiles (wallet_address) values ('ST1API') returning id into v_merchant;
  insert into public.merchant_profiles (wallet_address) values ('ST1API2') returning id into v_other;

  -- Drafts get a public id and an invoice.created event; no on-chain id yet.
  v_draft := public.create_draft_invoice(v_merchant, 25, 'USDCx', 'Order 382', 'Ada', 'ada@example.com', 'ST1API', now() + interval '1 hour', '{"orderId":"382"}');
  perform pg_temp.assert(v_draft.public_id ~ '^inv_[0-9a-f]{24}$', 'public id format');
  perform pg_temp.assert(v_draft.status = 'draft' and v_draft.onchain_invoice_id is null, 'draft without chain id');
  perform pg_temp.assert((select data->>'id' from public.merchant_events where event_key = 'invoice.created:' || v_draft.public_id) = v_draft.public_id, 'created event references public id');

  -- Attaching requires matching merchant, amount, and currency.
  perform pg_temp.assert(public.attach_draft_invoice(v_draft.public_id, v_other, 'INV_A', '0xa', 25, 'USDCx', null)->>'outcome' = 'mismatch', 'other merchant rejected');
  perform pg_temp.assert(public.attach_draft_invoice(v_draft.public_id, v_merchant, 'INV_A', '0xa', 24, 'USDCx', null)->>'outcome' = 'mismatch', 'other amount rejected');
  perform pg_temp.assert(public.attach_draft_invoice(v_draft.public_id, v_merchant, 'INV_A', '0xa', 25, 'STX', null)->>'outcome' = 'mismatch', 'other currency rejected');
  v_result := public.attach_draft_invoice(v_draft.public_id, v_merchant, 'INV_A', '0xa', 25, 'USDCx', now() + interval '2 hours');
  perform pg_temp.assert(v_result->>'outcome' = 'attached', 'attached');
  perform pg_temp.assert(v_result->'invoice'->>'status' = 'pending', 'pending after attach');
  perform pg_temp.assert(public.attach_draft_invoice(v_draft.public_id, v_merchant, 'INV_A', '0xa', 25, 'USDCx', null)->>'outcome' = 'already_attached', 'idempotent attach');
  perform pg_temp.assert(public.attach_draft_invoice(v_draft.public_id, v_merchant, 'INV_B', '0xb', 25, 'USDCx', null)->>'outcome' = 'conflict', 'second chain invoice conflicts');

  -- Payment events for an attached draft carry its public id.
  perform public.project_invoice_payment(null, 'INV_A', 'RCP_A', '0xpay', 'ST1PAYER', now(), 'BA', 1);
  perform pg_temp.assert((select data->>'id' from public.merchant_events where type = 'invoice.paid' and data->>'invoice_id' = 'INV_A') = v_draft.public_id, 'paid event stamped with public id');

  -- Only drafts can be canceled.
  perform pg_temp.assert(public.cancel_draft_invoice(v_merchant, v_draft.public_id)->>'outcome' = 'not_cancelable', 'paid invoice not cancelable');
  v_draft := public.create_draft_invoice(v_merchant, 1, 'STX', '', '', '', 'ST1API', null, '{}');
  perform pg_temp.assert(public.cancel_draft_invoice(v_other, v_draft.public_id)->>'outcome' = 'not_found', 'cannot cancel another merchant''s draft');
  perform pg_temp.assert(public.cancel_draft_invoice(v_merchant, v_draft.public_id)->>'outcome' = 'canceled', 'draft canceled');
  perform pg_temp.assert(public.cancel_draft_invoice(v_merchant, v_draft.public_id)->>'outcome' = 'canceled', 'cancel idempotent');

  -- Illegal transitions are refused by the database for every writer.
  begin
    update public.invoices set status = 'pending' where public_id = v_draft.public_id;
    raise exception 'canceled -> pending allowed';
  exception when check_violation then null;
  end;
  begin
    update public.invoices set status = 'draft' where onchain_invoice_id = 'INV_A';
    raise exception 'paid -> draft allowed';
  exception when check_violation then null;
  end;

  -- Drafts expire with wall clock like pending invoices.
  v_draft := public.create_draft_invoice(v_merchant, 1, 'STX', '', '', '', 'ST1API', now() - interval '1 second', '{}');
  perform public.expire_due_invoices(v_merchant);
  perform pg_temp.assert((select status from public.invoices where public_id = v_draft.public_id) = 'expired', 'draft expired');
end;
$$;

-- API keys: only active, unexpired, unrevoked keys authenticate; last use is recorded.
do $$
declare
  v_merchant uuid;
  v_row record;
begin
  select id into v_merchant from public.merchant_profiles where wallet_address = 'ST1API';
  insert into public.api_keys (merchant_id, environment, key_prefix, key_hash, scopes)
  values (v_merchant, 'test', 'sk_test_abcd', repeat('a', 64), array['invoices:read']);
  select * into v_row from public.authenticate_api_key(repeat('a', 64));
  perform pg_temp.assert(v_row.merchant_id = v_merchant and v_row.environment = 'test', 'active key authenticates');
  perform pg_temp.assert((select last_used_at from public.api_keys where key_hash = repeat('a', 64)) is not null, 'last use recorded');
  perform pg_temp.assert(not exists (select 1 from public.authenticate_api_key(repeat('b', 64))), 'unknown key rejected');
  update public.api_keys set revoked_at = now() where key_hash = repeat('a', 64);
  perform pg_temp.assert(not exists (select 1 from public.authenticate_api_key(repeat('a', 64))), 'revoked key rejected');
  insert into public.api_keys (merchant_id, environment, key_prefix, key_hash, scopes, expires_at)
  values (v_merchant, 'test', 'sk_test_efgh', repeat('c', 64), array['invoices:read'], now() - interval '1 second');
  perform pg_temp.assert(not exists (select 1 from public.authenticate_api_key(repeat('c', 64))), 'expired key rejected');
  begin
    insert into public.api_keys (merchant_id, environment, key_prefix, key_hash, scopes) values (v_merchant, 'test', 'x', 'not-a-hash', array['a']);
    raise exception 'plaintext key accepted';
  exception when check_violation then null;
  end;
end;
$$;

-- Idempotency: new, replay, mismatch, in-progress, crash takeover, release.
do $$
declare
  v_merchant uuid;
  v_claim jsonb;
begin
  select id into v_merchant from public.merchant_profiles where wallet_address = 'ST1API';
  v_claim := public.begin_idempotent_request(v_merchant, 'test', 'k1', 'POST /v1/invoices', 'h1', 30);
  perform pg_temp.assert(v_claim->>'state' = 'new', 'first claim new');
  perform pg_temp.assert(public.begin_idempotent_request(v_merchant, 'test', 'k1', 'POST /v1/invoices', 'h1', 30)->>'state' = 'in_progress', 'concurrent retry in progress');
  perform public.complete_idempotent_request((v_claim->>'id')::bigint, 201, '{"id":"inv_1"}');
  v_claim := public.begin_idempotent_request(v_merchant, 'test', 'k1', 'POST /v1/invoices', 'h1', 30);
  perform pg_temp.assert(v_claim->>'state' = 'replay' and (v_claim->>'status')::int = 201 and v_claim->'body'->>'id' = 'inv_1', 'exact retry replays');
  perform pg_temp.assert(public.begin_idempotent_request(v_merchant, 'test', 'k1', 'POST /v1/invoices', 'h2', 30)->>'state' = 'mismatch', 'changed body rejected');
  perform pg_temp.assert(public.begin_idempotent_request(v_merchant, 'test', 'k1', 'POST /v1/payment-links', 'h1', 30)->>'state' = 'mismatch', 'other route rejected');
  perform pg_temp.assert(public.begin_idempotent_request(v_merchant, 'live', 'k1', 'POST /v1/invoices', 'h1', 30)->>'state' = 'new', 'keys are scoped per environment');

  v_claim := public.begin_idempotent_request(v_merchant, 'test', 'k2', 'POST /v1/invoices', 'h1', 30);
  update public.idempotency_keys set locked_until = now() - interval '1 second' where id = (v_claim->>'id')::bigint;
  perform pg_temp.assert(public.begin_idempotent_request(v_merchant, 'test', 'k2', 'POST /v1/invoices', 'h1', 30)->>'state' = 'new', 'crashed holder lease taken over');

  v_claim := public.begin_idempotent_request(v_merchant, 'test', 'k3', 'POST /v1/invoices', 'h1', 30);
  perform public.release_idempotent_request((v_claim->>'id')::bigint);
  perform pg_temp.assert(public.begin_idempotent_request(v_merchant, 'test', 'k3', 'POST /v1/invoices', 'h9', 30)->>'state' = 'new', 'released key reusable');

  update public.idempotency_keys set expires_at = now() - interval '1 second' where idempotency_key = 'k1' and environment = 'test';
  perform pg_temp.assert(public.begin_idempotent_request(v_merchant, 'test', 'k1', 'POST /v1/invoices', 'h2', 30)->>'state' = 'new', 'expired key reusable');
end;
$$;

-- Audit log is append-only.
do $$
begin
  insert into public.audit_log (actor_type, actor_id, action) values ('system', 'test', 'api_key.created');
  begin
    delete from public.audit_log;
    raise exception 'audit log deletable';
  exception when check_violation then null;
  end;
  perform pg_temp.assert(not has_table_privilege('authenticated', 'public.api_keys', 'SELECT'), 'clients cannot read keys');
end;
$$;

rollback;
