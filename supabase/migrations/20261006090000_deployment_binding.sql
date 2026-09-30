-- Deployment identity, runtime stage (P0-03).
--
-- Every chain-derived record is bound to the reviewed contract deployment it came from, so a
-- contract upgrade never re-points history. Bindings are immutable once set and a child record
-- (receipt) must share its parent's (invoice) deployment. Legacy rows stay unbound (NULL) until a
-- reviewed backfill manifest assigns them; nothing is inferred from current configuration.
--
-- Global on-chain uniqueness is intentionally kept: with one active deployment per database it is
-- still correct, and switching to deployment-scoped uniqueness must wait until a second deployment
-- is registered and every reader is scoped (see docs/stackpay-deployment-registry.md).

-- Verified 2026-09-28: canonical successful deployments whose on-chain source matches the repository
-- byte for byte (docs/testnet-stackpay-deployment.json). Registering is not activating.
insert into public.contract_deployments (
  network, architecture_contract_id, processor_contract_id,
  architecture_source_sha256, processor_source_sha256,
  architecture_deploy_tx_id, processor_deploy_tx_id, evidence_note
)
select 'testnet',
  'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch', 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.proc',
  '302831018e98604ab1be260a8e9e743f7a6980f06b4afc57416459155352d1de', 'ce1f02a2cf19274c0a891f32465aa7072551205a163a779607fae49995a9117f',
  '0x292e5a51123391e8575583bf8720c14b267acfc6e88fabe8ed83c100ee291994', '0xb109323684182482e8fbb2de841b482b5405d6b96138102cb707e9e44859c306',
  'Verified 2026-09-28 against api.testnet.hiro.so: both deploy transactions canonical and successful at block 564586; deployed source SHA-256 equals the repository source. See docs/testnet-stackpay-deployment.json.'
where not exists (
  select 1 from public.contract_deployments
  where network = 'testnet' and architecture_contract_id = 'ST1H7G0B7BBM991P2KA77R0XHDRNYCWH8H92TT4QN.arch'
);

-- Append-only history of which registered deployment this database accepts new records for.
create table if not exists public.deployment_activations (
  id bigserial primary key,
  deployment_id uuid not null references public.contract_deployments(id) on delete restrict,
  note text not null check (length(trim(note)) > 0),
  activated_at timestamptz not null default now()
);

create or replace function public.protect_deployment_activation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Deployment activations are append-only' using errcode = '23514';
end;
$$;
drop trigger if exists deployment_activations_append_only on public.deployment_activations;
create trigger deployment_activations_append_only
before update or delete on public.deployment_activations
for each row execute function public.protect_deployment_activation();

alter table public.deployment_activations enable row level security;
revoke all on public.deployment_activations from public, anon, authenticated;
grant select, insert on public.deployment_activations to service_role;
grant usage on sequence public.deployment_activations_id_seq to service_role;
create policy deployment_activations_service_role on public.deployment_activations
for all to service_role using (true) with check (true);

create or replace function public.active_contract_deployment()
returns uuid language sql stable security definer set search_path = public as $$
  select deployment_id from public.deployment_activations order by id desc limit 1;
$$;

-- Activates a registered pair by its identifiers (what operators have at hand).
create or replace function public.activate_contract_deployment(
  p_network text, p_architecture_contract_id text, p_processor_contract_id text, p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from public.contract_deployments
  where network = p_network and architecture_contract_id = p_architecture_contract_id and processor_contract_id = p_processor_contract_id;
  if v_id is null then
    raise exception 'No registered % deployment for % / %', p_network, p_architecture_contract_id, p_processor_contract_id using errcode = 'P0002';
  end if;
  if public.active_contract_deployment() is distinct from v_id then
    insert into public.deployment_activations (deployment_id, note) values (v_id, p_note);
  end if;
  return v_id;
end;
$$;

-- Bindings.
alter table public.invoices add column if not exists deployment_id uuid references public.contract_deployments(id) on delete restrict;
alter table public.payment_links add column if not exists deployment_id uuid references public.contract_deployments(id) on delete restrict;
alter table public.receipts add column if not exists deployment_id uuid references public.contract_deployments(id) on delete restrict;
alter table public.settlement_runs add column if not exists deployment_id uuid references public.contract_deployments(id) on delete restrict;
alter table public.chain_event_inbox add column if not exists deployment_id uuid references public.contract_deployments(id) on delete restrict;

create index if not exists idx_invoices_deployment on public.invoices (deployment_id);
create index if not exists idx_receipts_deployment on public.receipts (deployment_id);

-- Stamps new chain records and freezes existing bindings.
create or replace function public.bind_contract_deployment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_parent uuid;
  v_chain_key text;
begin
  if tg_op = 'UPDATE' and old.deployment_id is not null and new.deployment_id is distinct from old.deployment_id then
    raise exception 'deployment binding of %.% is immutable', tg_table_name, old.id using errcode = '23514';
  end if;

  if tg_table_name = 'receipts' then
    select deployment_id into v_parent from public.invoices where id = new.invoice_id;
    if new.deployment_id is null then
      new.deployment_id := v_parent;
    elsif v_parent is not null and v_parent <> new.deployment_id then
      raise exception 'receipt and invoice belong to different deployments' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.deployment_id is null then
    if tg_table_name = 'chain_event_inbox' then
      -- The event names its contract; bind to whichever registered deployment owns it.
      select id into new.deployment_id from public.contract_deployments
      where new.contract_id in (architecture_contract_id, processor_contract_id);
    else
      -- Only records entering the chain now are stamped; legacy rows are left for the backfill.
      -- Table-specific columns are read through jsonb because PL/pgSQL resolves every field reference.
      v_chain_key := case tg_table_name when 'invoices' then 'onchain_invoice_id' when 'payment_links' then 'onchain_link_id' end;
      if (v_chain_key is null and tg_op = 'INSERT')
         or (v_chain_key is not null and to_jsonb(new) ->> v_chain_key is not null
             and (tg_op = 'INSERT' or to_jsonb(old) ->> v_chain_key is null)) then
        new.deployment_id := public.active_contract_deployment();
      end if;
    end if;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['invoices', 'payment_links', 'receipts', 'settlement_runs', 'chain_event_inbox'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_bind_deployment', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.bind_contract_deployment()', t || '_bind_deployment', t);
  end loop;
end;
$$;

-- Registered deployments with their activation state, for runtime routing.
create or replace function public.contract_deployment_directory(p_network text)
returns table (id uuid, architecture_contract_id text, processor_contract_id text, active boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.architecture_contract_id, d.processor_contract_id, d.id = public.active_contract_deployment()
  from public.contract_deployments d
  where d.network = p_network
  order by d.recorded_at;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.active_contract_deployment()',
    'public.activate_contract_deployment(text,text,text,text)',
    'public.bind_contract_deployment()',
    'public.contract_deployment_directory(text)',
    'public.protect_deployment_activation()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
