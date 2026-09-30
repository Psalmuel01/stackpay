-- Operational visibility (P1-03): heartbeats and a single metrics snapshot.

-- Last time each background source did work, so "no traffic" can be told apart from "broken".
create table if not exists public.ingestion_heartbeats (
  source text primary key,
  last_seen_at timestamptz not null,
  detail jsonb not null default '{}'::jsonb
);
alter table public.ingestion_heartbeats enable row level security;
revoke all on public.ingestion_heartbeats from public, anon, authenticated;
grant all on public.ingestion_heartbeats to service_role;

create or replace function public.record_heartbeat(p_source text, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.ingestion_heartbeats (source, last_seen_at, detail) values (p_source, now(), coalesce(p_detail, '{}'::jsonb))
  on conflict (source) do update set last_seen_at = excluded.last_seen_at, detail = excluded.detail;
$$;

create or replace function public.operational_metrics()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'generated_at', now(),
    'chain_events', (
      select jsonb_build_object(
        'pending', count(*) filter (where status in ('pending', 'processing')),
        'dead', count(*) filter (where status = 'dead'),
        'oldest_pending_seconds', coalesce(extract(epoch from now() - min(received_at) filter (where status in ('pending', 'processing')))::bigint, 0),
        'processed_last_hour', count(*) filter (where status = 'processed' and processed_at > now() - interval '1 hour'),
        'last_received_at', max(received_at),
        'last_processed_at', max(processed_at) filter (where status = 'processed')
      ) from public.chain_event_inbox
    ),
    'webhooks', (
      select jsonb_build_object(
        'pending', count(*) filter (where status in ('pending', 'delivering')),
        'oldest_pending_seconds', coalesce(extract(epoch from now() - min(created_at) filter (where status in ('pending', 'delivering')))::bigint, 0),
        'succeeded_24h', count(*) filter (where status in ('succeeded', 'delivered') and created_at > now() - interval '24 hours'),
        'failed_24h', count(*) filter (where status = 'failed' and created_at > now() - interval '24 hours'),
        'dead_24h', count(*) filter (where status = 'dead' and created_at > now() - interval '24 hours'),
        'retries_24h', coalesce(sum(greatest(attempts - 1, 0)) filter (where created_at > now() - interval '24 hours'), 0),
        'disabled_endpoints', (select count(*) from public.webhook_endpoints where status = 'disabled' and coalesce(disabled_reason, '') not in ('deleted', 'disabled_by_merchant', 'secret_migration'))
      ) from public.webhook_deliveries where event_id is not null
    ),
    'payments', (
      select jsonb_build_object(
        'confirmed_24h', count(*),
        'median_recording_lag_seconds', coalesce(percentile_cont(0.5) within group (order by extract(epoch from created_at - paid_at))::bigint, 0),
        'orphaned_7d', (select count(*) from public.receipts where status = 'orphaned' and orphaned_at > now() - interval '7 days')
      ) from public.receipts where status = 'confirmed' and created_at > now() - interval '24 hours'
    ),
    'invoices', (
      select jsonb_build_object(
        'stale_pending', count(*) filter (where status = 'pending' and expires_at < now() - interval '15 minutes'),
        'drafts_open', count(*) filter (where status = 'draft')
      ) from public.invoices
    ),
    'heartbeats', coalesce((select jsonb_object_agg(source, jsonb_build_object('last_seen_at', last_seen_at, 'age_seconds', extract(epoch from now() - last_seen_at)::bigint, 'detail', detail)) from public.ingestion_heartbeats), '{}'::jsonb)
  );
$$;

do $$
declare fn text;
begin
  foreach fn in array array['public.record_heartbeat(text,jsonb)', 'public.operational_metrics()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
