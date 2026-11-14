-- Run against a migrated, disposable database. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
-- The original identity regression now runs as a real website API role.
-- These synthetic claims/config/profile disappear at rollback below.
insert into private.auth_config(singleton,issuer,website_client_id,mcp_client_id,website_audience,mcp_audience)
values(true,'https://identity-test.auth0.com/','identity-web','identity-mcp','https://identity.example/api/web','https://identity.example/api/mcp')
on conflict(singleton) do update set issuer=excluded.issuer,website_client_id=excluded.website_client_id,
  mcp_client_id=excluded.mcp_client_id,website_audience=excluded.website_audience,mcp_audience=excluded.mcp_audience;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'iss','https://identity-test.auth0.com/','aud','https://identity.example/api/web',
  'sub','auth0|position-identity-test','azp','identity-web','role','authenticated',
  'scope','portfolio:read portfolio:write','iat',floor(extract(epoch from now()))::bigint,
  'exp',floor(extract(epoch from now()))::bigint+3600,
  'https://livestocks.app/read_only',false,'https://livestocks.app/email_verified',true
)::text,true);
insert into public.user_profiles(id) values('auth0|position-identity-test');
do $$
declare
  r record;
  r2 record;
  v_id uuid;
  v_lot uuid := gen_random_uuid();
  v_count integer;
  v_before integer;
begin
  select * into r from public.record_position_purchase(v_lot, ' identity_test ', 'First metadata', '', 'bank_one', 100, 5, '2025-01-01', true, 8);
  if r.reused then raise exception 'New position incorrectly reused'; end if;
  v_id := r.position_id;

  select * into r2 from public.record_position_purchase(gen_random_uuid(), 'IDENTITY_TEST', 'Different metadata', '', 'bank_one', 120, 2, '2025-02-01', false, 0);
  if not r2.reused or r2.position_id <> v_id then raise exception 'Active position was not reused'; end if;
  if (select display from public.positions where id = v_id) <> 'First metadata' then raise exception 'Existing metadata overwritten'; end if;
  if (select sum(quantity) from public.position_lots where position_id = v_id) <> 7 then raise exception 'Active lots not preserved'; end if;

  insert into public.position_lots(position_id, side, price, quantity, executed_at, has_commission, commission_amount)
  values (v_id, 'SELL', 130, 7, '2025-03-01', false, 0);
  select * into r2 from public.record_position_purchase(gen_random_uuid(), 'identity_test', 'Reopened', '', 'bank_one', 140, 3, '2025-04-01', false, 0);
  if not r2.reused or r2.position_id <> v_id then raise exception 'Closed position was not reopened'; end if;
  select count(*) into v_count from public.position_lots where position_id = v_id;
  if v_count <> 4 then raise exception 'Closed history lost'; end if;

  select * into r2 from public.record_position_purchase(gen_random_uuid(), 'IDENTITY_TEST', 'Other account', '', 'bank_two', 150, 1, '2025-05-01', false, 0);
  if r2.reused or r2.position_id = v_id then raise exception 'Different accounts were combined'; end if;

  select * into r2 from public.record_position_purchase(v_lot, 'identity_test', 'First metadata', '', 'bank_one', 100, 5, '2025-01-01', true, 8);
  if r2.position_id <> v_id or r2.lot_id <> v_lot then raise exception 'Retry did not preserve identity'; end if;
  select count(*) into v_count from public.position_lots where position_id = v_id;
  if v_count <> 4 then raise exception 'Retry recorded an extra BUY'; end if;
  begin
    perform public.record_position_purchase(v_lot, 'IDENTITY_TEST', 'First metadata', '', 'bank_one', 100, 6, '2025-01-01', true, 8);
    raise exception 'Reused request ID with changed details accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    insert into public.positions(symbol, display, image_url, location, entry_price, quantity, entry_date)
    values (' identity_TEST ', 'duplicate', '', 'bank_one', 100, 1, '2025-01-01');
    raise exception 'Duplicate normalized identity accepted';
  exception when unique_violation then null;
  end;

  select count(*) into v_before from public.positions;
  begin
    -- Commission passes validation but overflows the lot column after position insert.
    perform public.record_position_purchase(gen_random_uuid(), 'IDENTITY_ROLLBACK_TEST', 'Rollback', '', 'bank_one', 100, 1, '2025-01-01', true, 100000000000);
    raise exception 'Expected lot insert failure';
  exception when numeric_value_out_of_range then null;
  end;
  select count(*) into v_count from public.positions;
  if v_count <> v_before then raise exception 'Failed purchase left an orphan position'; end if;

  insert into public.positions(symbol, display, image_url, location, entry_price, quantity, entry_date)
  values ('IDENTITY_LEGACY_TEST', 'Legacy', '', 'bank_one', 90, 4, '2024-01-01') returning id into v_id;
  select * into r2 from public.record_position_purchase(gen_random_uuid(), 'IDENTITY_LEGACY_TEST', 'Legacy', '', 'bank_one', 100, 2, '2025-01-01', false, 0);
  if r2.position_id <> v_id or (select sum(quantity) from public.position_lots where position_id = v_id) <> 6 then raise exception 'Legacy opening balance lost'; end if;
  raise notice 'PASS: new, active, closed, normalized identity, account separation, retry, payload mismatch, uniqueness, atomic rollback, legacy balance';
end;
$$;
rollback;
