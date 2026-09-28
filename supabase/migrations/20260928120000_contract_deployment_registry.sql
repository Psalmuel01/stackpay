-- Additive foundation only. No legacy record is assigned from current env values.
-- Existing global identifiers remain unique until all readers/writers are scoped.
create table public.contract_deployments (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('mainnet', 'testnet', 'devnet')),
  architecture_contract_id text not null,
  processor_contract_id text not null,
  architecture_source_sha256 text not null check (architecture_source_sha256 ~ '^[0-9a-f]{64}$'),
  processor_source_sha256 text not null check (processor_source_sha256 ~ '^[0-9a-f]{64}$'),
  architecture_deploy_tx_id text not null check (architecture_deploy_tx_id ~ '^0x[0-9a-f]{64}$'),
  processor_deploy_tx_id text not null check (processor_deploy_tx_id ~ '^0x[0-9a-f]{64}$'),
  evidence_note text not null check (length(trim(evidence_note)) > 0),
  recorded_at timestamptz not null default now(),
  unique (network, architecture_contract_id),
  unique (network, processor_contract_id),
  check (architecture_contract_id <> processor_contract_id),
  check (architecture_contract_id ~ '^S[PTMN][0-9A-Z]+\.[a-zA-Z][a-zA-Z0-9_-]{0,39}$'),
  check (processor_contract_id ~ '^S[PTMN][0-9A-Z]+\.[a-zA-Z][a-zA-Z0-9_-]{0,39}$'),
  check ((network = 'mainnet' and architecture_contract_id ~ '^S[PM]' and processor_contract_id ~ '^S[PM]')
      or (network in ('testnet', 'devnet') and architecture_contract_id ~ '^S[TN]' and processor_contract_id ~ '^S[TN]'))
);

-- A historical identifier must never be repointed or removed during an upgrade.
-- Register a new deployment instead. Corrections require a reviewed migration.
create function public.protect_contract_deployment()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Contract deployment identities are immutable' using errcode = '23514';
end;
$$;
create trigger contract_deployments_immutable
before update or delete on public.contract_deployments
for each row execute function public.protect_contract_deployment();

alter table public.contract_deployments enable row level security;
revoke all on public.contract_deployments from public, anon, authenticated;
grant select, insert on public.contract_deployments to service_role;
create policy contract_deployments_service_role on public.contract_deployments
for all to service_role using (true) with check (true);
revoke all on function public.protect_contract_deployment() from public, anon, authenticated;
