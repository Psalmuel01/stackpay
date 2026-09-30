-- Concurrency invariants for chain projection, using two real sessions via dblink.
-- Data here is committed (other sessions must see it), so it uses unique identifiers and cleans up.
create extension if not exists dblink;

create or replace function pg_temp.assert(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

create or replace function pg_temp.connstr() returns text language sql as $$
  select format('host=%s port=%s dbname=%s user=%s',
    split_part(current_setting('unix_socket_directories'), ',', 1), current_setting('port'), current_database(), current_user);
$$;

insert into public.merchant_profiles (wallet_address, company_name) values ('ST1CONCURRENT', 'Race Co');
insert into public.invoices (merchant_id, onchain_invoice_id, tx_id, amount, currency, recipient_address, expires_at)
select id, 'INV_RACE', '0xrace', 5, 'STX', 'ST1CONCURRENT', now() - interval '1 second'
from public.merchant_profiles where wallet_address = 'ST1CONCURRENT';
insert into public.invoices (merchant_id, onchain_invoice_id, tx_id, amount, currency, recipient_address)
select id, 'INV_DUP', '0xdup', 5, 'STX', 'ST1CONCURRENT'
from public.merchant_profiles where wallet_address = 'ST1CONCURRENT';

select dblink_connect('a', pg_temp.connstr());
select dblink_connect('b', pg_temp.connstr());

-- 1. Two workers project the same payment at the same time: exactly one side effect set.
do $$
declare
  v_first text;
  v_second text;
begin
  perform dblink_exec('a', 'begin');
  select r into v_first from dblink('a', $q$select public.project_invoice_payment(null, 'INV_DUP', 'RCP_DUP', '0xduptx', 'ST1PAYER', now(), 'BD', 1)$q$) as t(r text);
  perform dblink_send_query('b', $q$select public.project_invoice_payment(null, 'INV_DUP', 'RCP_DUP', '0xduptx', 'ST1PAYER', now(), 'BD', 1)$q$);
  perform pg_sleep(0.3);
  perform pg_temp.assert(dblink_is_busy('b') = 1, 'second worker waits on the row lock');
  perform dblink_exec('a', 'commit');
  select r into v_second from dblink_get_result('b') as t(r text);
  perform * from dblink_get_result('b') as t(r text);
  perform pg_temp.assert(v_first = 'processed', 'first worker processed, got ' || v_first);
  perform pg_temp.assert(v_second = 'duplicate', 'second worker saw a duplicate, got ' || coalesce(v_second, 'null'));
end;
$$;

do $$
begin
  perform pg_temp.assert((select count(*) from public.receipts where onchain_receipt_id = 'RCP_DUP') = 1, 'one receipt under concurrency');
  perform pg_temp.assert((select count(*) from public.merchant_events where event_key like 'invoice.paid:RCP_DUP:%') = 1, 'one paid event under concurrency');
  perform pg_temp.assert((select count(*) from public.notifications where source_key like 'invoice-paid:RCP_DUP:%') = 1, 'one notification under concurrency');
end;
$$;

-- 2. Expiry racing a payment for an invoice past its expiry: the chain payment wins.
do $$
declare
  v_expired integer;
begin
  perform dblink_exec('a', 'begin');
  perform * from dblink('a', $q$select public.project_invoice_payment(null, 'INV_RACE', 'RCP_RACE', '0xracetx', 'ST1PAYER', now(), 'BR', 2)$q$) as t(r text);
  perform dblink_send_query('b', $q$select public.expire_due_invoices(null)$q$);
  perform pg_sleep(0.3);
  perform dblink_exec('a', 'commit');
  select n into v_expired from dblink_get_result('b') as t(n integer);
  perform * from dblink_get_result('b') as t(n integer);
  perform pg_temp.assert((select status from public.invoices where onchain_invoice_id = 'INV_RACE') = 'paid', 'payment not overwritten by concurrent expiry');
end;
$$;

-- 3. Two workers claiming concurrently never lease the same event.
select public.enqueue_chain_event('apply', 'ST000000000000000000002AMW42H.architecture', 'invoice-paid', 'BC', 3, '0xc1', 0, 'INV_C', 'RCP_C1', '{}');
select public.enqueue_chain_event('apply', 'ST000000000000000000002AMW42H.architecture', 'invoice-paid', 'BC', 3, '0xc2', 0, 'INV_C', 'RCP_C2', '{}');
do $$
declare
  v_a integer;
  v_b integer;
begin
  perform dblink_exec('a', 'begin');
  select count(*) into v_a from dblink('a', 'select id from public.claim_chain_events(1, 60)') as t(id bigint);
  select count(*) into v_b from dblink('b', 'select id from public.claim_chain_events(10, 60)') as t(id bigint);
  perform dblink_exec('a', 'commit');
  perform pg_temp.assert(v_a = 1 and v_b = 1, format('claims are disjoint (a=%s, b=%s)', v_a, v_b));
end;
$$;

select dblink_disconnect('a');
select dblink_disconnect('b');

delete from public.chain_event_inbox where invoice_onchain_id = 'INV_C';
delete from public.notifications where merchant_id in (select id from public.merchant_profiles where wallet_address = 'ST1CONCURRENT');
delete from public.activity_events where merchant_id in (select id from public.merchant_profiles where wallet_address = 'ST1CONCURRENT');
delete from public.merchant_events where merchant_id in (select id from public.merchant_profiles where wallet_address = 'ST1CONCURRENT');
delete from public.merchant_profiles where wallet_address = 'ST1CONCURRENT';
