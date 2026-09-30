-- Stable, prefixed public identifiers for every API object. Internal UUIDs stay private.
alter table public.payment_links
  add column if not exists public_id text not null default ('plink_' || encode(gen_random_bytes(12), 'hex'));
create unique index if not exists payment_links_public_id on public.payment_links (public_id);

alter table public.receipts
  add column if not exists public_id text not null default ('rcpt_' || encode(gen_random_bytes(12), 'hex'));
create unique index if not exists receipts_public_id on public.receipts (public_id);

alter table public.settlement_runs
  add column if not exists public_id text not null default ('stl_' || encode(gen_random_bytes(12), 'hex'));
create unique index if not exists settlement_runs_public_id on public.settlement_runs (public_id);

alter table public.merchant_events
  add column if not exists public_id text not null default ('evt_' || encode(gen_random_bytes(12), 'hex'));
create unique index if not exists merchant_events_public_id on public.merchant_events (public_id);

create index if not exists idx_receipts_merchant_created on public.receipts (merchant_id, created_at desc, id desc);
create index if not exists idx_payment_links_merchant_created_id on public.payment_links (merchant_id, created_at desc, id desc);
create index if not exists idx_settlement_runs_merchant_created_id on public.settlement_runs (merchant_id, created_at desc, id desc);
create index if not exists idx_merchant_events_merchant_created_id on public.merchant_events (merchant_id, created_at desc, id desc);
