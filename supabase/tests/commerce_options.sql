begin;
create or replace function pg_temp.assert(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;
do $$
declare
  v_merchant uuid;
  v_invoice public.invoices;
begin
  insert into public.merchant_profiles (wallet_address) values ('ST1COMMERCE') returning id into v_merchant;
  v_invoice := public.create_draft_invoice(v_merchant, 5, 'USDCx', 'Order 7', '', '', 'ST1COMMERCE', now() + interval '1 hour', '{"order_id":"7"}', 'https://shop.example/thanks?o=7');
  perform pg_temp.assert(v_invoice.success_url = 'https://shop.example/thanks?o=7', 'success_url stored');
  v_invoice := public.create_draft_invoice(v_merchant, 5, 'USDCx', '', '', '', 'ST1COMMERCE', now() + interval '1 hour', '{}');
  perform pg_temp.assert(v_invoice.success_url is null, 'success_url optional');

  begin
    perform public.create_draft_invoice(v_merchant, 5, 'USDCx', '', '', '', 'ST1COMMERCE', now() + interval '1 hour', '{}', 'javascript:alert(1)');
    raise exception 'non-https success_url accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.create_draft_invoice(v_merchant, 5, 'USDCx', '', '', '', 'ST1COMMERCE', now() + interval '1 hour', '{}', 'https://user:pw@shop.example/');
    raise exception 'credentialed success_url accepted';
  exception when check_violation then null;
  end;
end;
$$;
rollback;
