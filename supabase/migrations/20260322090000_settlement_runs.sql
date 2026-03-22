create table if not exists public.settlement_runs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
  tx_id text not null unique,
  currency text not null,
  amount numeric(30, 8) not null,
  destination text not null,
  status text not null check (status in ('pending', 'completed', 'failed')) default 'completed',
  executed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.settlement_runs enable row level security;

create policy "service role full access settlement_runs"
on public.settlement_runs
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create index if not exists idx_settlement_runs_merchant_created
on public.settlement_runs (merchant_id, created_at desc);
