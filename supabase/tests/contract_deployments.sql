-- Run with psql -v ON_ERROR_STOP=1 against a disposable migrated database.
begin;
insert into public.contract_deployments
(network, architecture_contract_id, processor_contract_id, architecture_source_sha256,
 processor_source_sha256, architecture_deploy_tx_id, processor_deploy_tx_id, evidence_note)
values ('testnet', 'ST000000000000000000002AMW42H.arch1', 'ST000000000000000000002AMW42H.proc1',
 repeat('a',64), repeat('b',64), '0x'||repeat('c',64), '0x'||repeat('d',64), 'Synthetic SQL fixture'),
 ('testnet', 'ST000000000000000000002AMW42H.arch2', 'ST000000000000000000002AMW42H.proc2',
 repeat('e',64), repeat('f',64), '0x'||repeat('1',64), '0x'||repeat('2',64), 'Synthetic upgrade fixture');
do $$
declare fixture public.contract_deployments%rowtype;
begin
  select * into fixture from public.contract_deployments limit 1;
  fixture.id := gen_random_uuid();
  fixture.network := 'mainnet';
  begin
    insert into public.contract_deployments select fixture.*;
    raise exception 'FAIL: wrong-network principals allowed';
  exception when check_violation then null; end;
  fixture.network := 'testnet';
  fixture.architecture_source_sha256 := 'invalid';
  begin
    insert into public.contract_deployments select fixture.*;
    raise exception 'FAIL: malformed evidence allowed';
  exception when check_violation then null; end;
  begin
    update public.contract_deployments set processor_contract_id = 'ST000000000000000000002AMW42H.proc3';
    raise exception 'FAIL: deployment update allowed';
  exception when check_violation then null; end;
  begin
    delete from public.contract_deployments;
    raise exception 'FAIL: historical deployment deletion allowed';
  exception when check_violation then null; end;
  begin
    insert into public.contract_deployments
    select gen_random_uuid(), network, architecture_contract_id, processor_contract_id,
      architecture_source_sha256, processor_source_sha256, architecture_deploy_tx_id,
      processor_deploy_tx_id, evidence_note, recorded_at from public.contract_deployments limit 1;
    raise exception 'FAIL: duplicate deployment allowed';
  exception when unique_violation then null; end;
  if has_table_privilege('anon', 'public.contract_deployments', 'SELECT')
     or has_table_privilege('authenticated', 'public.contract_deployments', 'INSERT')
     or has_table_privilege('service_role', 'public.contract_deployments', 'TRUNCATE') then
    raise exception 'FAIL: registry permissions';
  end if;
  if (select count(*) from public.contract_deployments where evidence_note like 'Synthetic%') <> 2 then
    raise exception 'FAIL: upgrade did not preserve historical deployment';
  end if;
end;
$$;
set local role anon;
do $$ begin
  begin
    perform 1 from public.contract_deployments;
    raise exception 'FAIL: anonymous registry access allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
  if (select count(*) from public.contract_deployments where evidence_note like 'Synthetic%') <> 2 then
    raise exception 'FAIL: service role cannot read registry';
  end if;
end $$;
reset role;
rollback;
