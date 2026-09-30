begin;
create or replace function pg_temp.assert(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;
do $$
declare
  v jsonb;
begin
  perform public.enqueue_chain_event('apply', 'ST1.arch', 'invoice-paid', 'B1', 1, '0x1', 0, 'INV_1', 'RCP_1', '{}');
  perform public.record_heartbeat('chainhook', '{"events": 1}');
  v := public.operational_metrics();
  perform pg_temp.assert((v->'chain_events'->>'pending')::int = 1, 'pending chain events counted');
  perform pg_temp.assert(v->'heartbeats' ? 'chainhook', 'heartbeat reported');
  perform pg_temp.assert((v->'heartbeats'->'chainhook'->>'age_seconds')::int <= 1, 'heartbeat fresh');
  perform pg_temp.assert(v ? 'webhooks' and v ? 'payments' and v ? 'invoices', 'all sections present');
  perform pg_temp.assert(not has_function_privilege('anon', 'public.operational_metrics()', 'EXECUTE'), 'metrics are server-only');
end;
$$;
rollback;
