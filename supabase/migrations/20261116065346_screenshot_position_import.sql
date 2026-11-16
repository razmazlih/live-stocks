-- Screenshot extraction is untrusted input. OAuth can inspect a reconciliation,
-- checkpoint writes require the website writer or the isolated MCP sync RPC.
alter table public.position_lots add column basis_acquired_on date;
-- A user-reviewed market-price date guess is an annotation, never an actual
-- acquisition date, exchange-rate date or FIFO holding-age input.
alter table public.position_lots add column basis_date_estimate date;
alter table public.position_lots drop constraint position_lots_side_check;
alter table public.position_lots add constraint position_lots_side_check check(side in ('BUY','SELL','RECONCILE'));
alter table public.position_lots add constraint reconciliation_basis_check check (
 (side='RECONCILE' and quantity>=0 and price>=0 and (quantity=0 or price>0)
  and has_commission=false and commission_amount=0
  and (basis_acquired_on is null or (isfinite(basis_acquired_on) and basis_acquired_on<=executed_at))
  and (basis_date_estimate is null or (isfinite(basis_date_estimate) and basis_date_estimate>=date '1900-01-01' and basis_date_estimate<=executed_at))
  and (basis_acquired_on is null or basis_date_estimate is null))
 or (side<>'RECONCILE' and basis_acquired_on is null and basis_date_estimate is null)
);
-- Timestamp insertion, rather than transaction start, orders a trade that waited
-- for an import lock after that checkpoint on the same observation date.
alter table public.position_lots alter column created_at set default clock_timestamp();

create function private.immutable_reconciliation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.side='RECONCILE' or (tg_op='UPDATE' and new.side='RECONCILE') then
  -- A verified account merge moves ownership only; financial provenance stays.
  if tg_op='UPDATE' and current_user='livestocks_merge_executor'
   and (to_jsonb(new)-array['user_id','updated_at'])=(to_jsonb(old)-array['user_id','updated_at']) then return new;end if;
  raise exception using errcode='55000',message='Reconciliation checkpoints are immutable; record a new checkpoint';
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.immutable_reconciliation() from public,anon,authenticated,service_role;
create trigger b_immutable_reconciliation before update or delete on public.position_lots
for each row execute function private.immutable_reconciliation();

-- portfolio:sync is deliberately not portfolio:write. The OAuth subject retains
-- no INSERT/UPDATE/DELETE policies. Only this non-login, non-inherited role may
-- perform the fixed checkpoint operation through its private definer worker.
do $$begin
 if not exists(select 1 from pg_roles where rolname='livestocks_sync_executor') then
  create role livestocks_sync_executor nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole;
 elsif exists(select 1 from pg_roles where rolname='livestocks_sync_executor'
  and (rolcanlogin or rolinherit or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole)) then
  raise exception 'Unsafe existing screenshot sync executor role';
 end if;
end$$;
grant usage on schema private,public,auth to livestocks_sync_executor;

create function private.sync_authorized_subject() returns text
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=auth.jwt();cfg private.auth_config%rowtype;owner_id text;
begin
 select * into cfg from private.auth_config where singleton and auth_provider='better_auth';
 if not found or jsonb_typeof(claims->'scope') is distinct from 'string'
  or not string_to_array(claims->>'scope',' ') @> array['portfolio:sync']
  or string_to_array(claims->>'scope',' ') @> array['portfolio:write']
  or claims->>'azp' is distinct from cfg.mcp_client_id
  or claims->'https://livestocks.app/read_only' is distinct from 'true'::jsonb then return null;end if;
 -- This repeats live session, canonical identity, immutable OAuth approval,
 -- client/audience, account state, connection revocation and cutoff checks.
 owner_id:=private.authorized_subject(false);
 return owner_id;
end;
$$;
revoke all on function private.sync_authorized_subject() from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function private.sync_authorized_subject(),private.authorized_subject(boolean),private.lock_active_profile(text) to livestocks_sync_executor;
-- The shared invoker function references this read-only predicate in a CASE;
-- PostgreSQL checks EXECUTE at expression planning even for website callers.
grant execute on function private.sync_authorized_subject() to authenticated;

-- UPDATE is required by PostgreSQL for the brief table lock, not row updates:
-- there is no executor UPDATE policy and the write fence rejects non-INSERT.
grant select,insert,update on public.positions,public.position_lots to livestocks_sync_executor;
create policy sync_executor_read on public.positions for select to livestocks_sync_executor
 using(user_id=(select private.sync_authorized_subject()));
create policy sync_executor_insert on public.positions for insert to livestocks_sync_executor
 with check(user_id=(select private.sync_authorized_subject()));
create policy sync_executor_read on public.position_lots for select to livestocks_sync_executor
 using(user_id=(select private.sync_authorized_subject()));
create policy sync_executor_insert on public.position_lots for insert to livestocks_sync_executor
 with check(user_id=(select private.sync_authorized_subject()));

create or replace function private.account_write_fence() returns trigger language plpgsql security invoker set search_path='' as $$
declare owner_id text; allowed text[]:=array['user_id','consolidated_into_position_id','is_active'];
begin
 if current_user='livestocks_merge_executor' then
  if tg_op<>'UPDATE' then raise exception 'Merge executor cannot insert or delete financial records';end if;
  if (to_jsonb(new)-allowed) is distinct from (to_jsonb(old)-allowed) then raise exception 'Merge executor changed financial business fields';end if;
  return new;
 end if;
 if current_user='livestocks_sync_executor' then
  if tg_op<>'INSERT' or tg_table_schema<>'public' or tg_table_name not in ('positions','position_lots')
   or new.user_id is distinct from private.sync_authorized_subject() or new.user_id is null
  then raise exception using errcode='42501',message='Restricted screenshot sync insert required';end if;
  if tg_table_name='position_lots' then
   -- BUY is allowed only to preserve an existing no-lot legacy opening balance.
   if new.side not in ('BUY','RECONCILE') or new.has_commission is distinct from false or new.commission_amount is distinct from 0
    or (new.side='BUY' and not exists(select 1 from public.positions p where p.id=new.position_id and p.user_id=new.user_id
     and p.entry_price=new.price and p.quantity=new.quantity and p.entry_date=new.executed_at
     and not exists(select 1 from public.position_lots l where l.position_id=p.id and l.user_id=p.user_id)))
   then raise exception using errcode='42501',message='Only reconciliations or recorded legacy baselines may be inserted';end if;
  elsif new.consolidated_into_position_id is not null then
   raise exception using errcode='42501',message='Merge metadata is server-managed';
  end if;
  perform private.lock_active_profile(new.user_id);
  if new.user_id is distinct from private.sync_authorized_subject() then raise exception using errcode='42501',message='Account authorization changed';end if;
  return new;
 end if;
 owner_id:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 if tg_op='UPDATE' and new.user_id is distinct from old.user_id then raise exception using errcode='42501',message='Row ownership is immutable';end if;
 if tg_op='UPDATE' and ((to_jsonb(new)->'consolidated_into_position_id') is distinct from (to_jsonb(old)->'consolidated_into_position_id')
  or (to_jsonb(new)->'is_active') is distinct from (to_jsonb(old)->'is_active')) then raise exception 'Merge metadata is immutable';end if;
 if tg_op='INSERT' and ((to_jsonb(new)->>'consolidated_into_position_id') is not null or to_jsonb(new)->'is_active'='false'::jsonb) then raise exception 'Merge metadata is server-managed';end if;
 if current_user not in ('postgres','service_role','supabase_admin') and (owner_id is null or owner_id is distinct from private.authorized_subject(true))
 then raise exception using errcode='42501',message='Authorized website write required';end if;
 perform private.lock_active_profile(owner_id);
 if current_user not in ('postgres','service_role','supabase_admin') and owner_id is distinct from private.authorized_subject(true) then
  raise exception using errcode='42501',message='Account authorization changed while waiting';end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;

create function public.screenshot_sync_snapshot()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare owner_id text:=private.authorized_subject(false); snapshot jsonb;
begin
 if owner_id is null then raise exception using errcode='42501',message='Authentication required';end if;
 select jsonb_build_object(
  'positions',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.positions p where p.user_id=owner_id),'[]'::jsonb),
  'lots',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.position_lots l where l.user_id=owner_id),'[]'::jsonb)
 ) into snapshot;
 return snapshot||jsonb_build_object('fingerprint',md5(snapshot::text));
end;
$$;
revoke all on function public.screenshot_sync_snapshot() from public,anon,authenticated,service_role;
grant execute on function public.screenshot_sync_snapshot() to authenticated;
grant execute on function public.screenshot_sync_snapshot() to livestocks_sync_executor;

create function public.apply_screenshot_sync(p_expected text,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 owner_id text:=case when current_user='livestocks_sync_executor' then private.sync_authorized_subject() else private.authorized_subject(true) end;
 v_row jsonb; v_symbol text; v_location public.position_location; v_quantity numeric; v_price numeric;
 v_acquired date; v_estimated date; v_observed date; v_lot_id uuid; v_position_id uuid; v_new_position boolean; matching integer:=0; total integer;
 v_existing public.position_lots%rowtype; v_position public.positions%rowtype;
 receipt jsonb:='[]'::jsonb; ledger record;
begin
 if owner_id is null then raise exception using errcode='42501',message='Authorized website write required';end if;
 if p_expected is null or p_expected!~'^[a-f0-9]{32}$' or jsonb_typeof(p_rows) is distinct from 'array'
 then raise exception using errcode='22023',message='Invalid screenshot import';end if;
 total:=jsonb_array_length(p_rows);
 if total not between 1 and 100 then raise exception using errcode='22023',message='Invalid screenshot import';end if;

 -- Fail promptly rather than allowing a long import to block normal portfolio use.
 perform set_config('lock_timeout','3s',true);
 -- Existing browser writers use a shared profile fence. These brief table locks
 -- also serialize direct RLS writes and absent-symbol inserts, so no phantom new
 -- position or changed lot can pass the reviewed fingerprint check.
 lock table public.positions,public.position_lots in share row exclusive mode;
 perform private.lock_active_profile(owner_id);
 if owner_id is distinct from (case when current_user='livestocks_sync_executor' then private.sync_authorized_subject() else private.authorized_subject(true) end)
 then raise exception using errcode='42501',message='Account authorization changed';end if;

 for v_row in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(v_row) is distinct from 'object'
   or (select count(*) from jsonb_object_keys(v_row))<>8
   or not v_row ?& array['symbol','quantity','averageCostUsd','acquiredOn','estimatedAcquiredOn','observedAt','location','lotId']
   or jsonb_typeof(v_row->'symbol') is distinct from 'string'
   or jsonb_typeof(v_row->'quantity') is distinct from 'number'
   or jsonb_typeof(v_row->'averageCostUsd') is distinct from 'number'
   or jsonb_typeof(v_row->'acquiredOn') not in ('string','null')
   or jsonb_typeof(v_row->'estimatedAcquiredOn') not in ('string','null')
   or jsonb_typeof(v_row->'observedAt') is distinct from 'string'
   or jsonb_typeof(v_row->'location') is distinct from 'string'
   or jsonb_typeof(v_row->'lotId') is distinct from 'string'
  then raise exception using errcode='22023',message='Invalid screenshot row';end if;
  v_symbol:=v_row->>'symbol'; v_quantity:=(v_row->>'quantity')::numeric;v_price:=(v_row->>'averageCostUsd')::numeric;
  v_location:=(v_row->>'location')::public.position_location;v_acquired:=(v_row->>'acquiredOn')::date;v_lot_id:=(v_row->>'lotId')::uuid;
  v_observed:=(v_row->>'observedAt')::date;
  v_estimated:=(v_row->>'estimatedAcquiredOn')::date;
  if v_symbol!~'^[A-Z0-9][A-Z0-9.^=:-]{0,31}$'
   or v_quantity<0 or v_quantity>1000000000 or v_quantity<>round(v_quantity,4)
   or v_price<0 or (v_quantity>0 and v_price=0) or v_price>1000000000 or v_price<>round(v_price,4)
   or not isfinite(v_observed) or v_observed>current_date or v_observed<date '1900-01-01'
   or (v_acquired is not null and (not isfinite(v_acquired) or v_acquired>v_observed or v_acquired<date '1900-01-01'))
   or (v_estimated is not null and (not isfinite(v_estimated) or v_estimated>v_observed or v_estimated<date '1900-01-01'))
   or (v_acquired is not null and v_estimated is not null)
  then raise exception using errcode='22023',message='Invalid screenshot row';end if;
  if (select count(*) from jsonb_array_elements(p_rows) r where r->>'symbol'=v_symbol and r->>'location'=v_location::text)<>1
   or (select count(*) from jsonb_array_elements(p_rows) r where r->>'lotId'=v_lot_id::text)<>1
  then raise exception using errcode='22023',message='Duplicate screenshot row';end if;
  select * into v_existing from public.position_lots l where l.id=v_lot_id and l.user_id=owner_id;
  if found then
   select * into strict v_position from public.positions p where p.id=v_existing.position_id and p.user_id=owner_id;
   if v_position.symbol is distinct from v_symbol or v_position.location is distinct from v_location
    or v_existing.side<>'RECONCILE' or v_existing.price<>v_price or v_existing.quantity<>v_quantity or v_existing.executed_at<>v_observed
    or v_existing.basis_acquired_on is distinct from v_acquired
    or v_existing.basis_date_estimate is distinct from v_estimated
    or v_existing.has_commission is distinct from false or v_existing.commission_amount is distinct from 0
   then raise exception using errcode='22023',message='Import receipt does not match';end if;
   matching:=matching+1;
   receipt:=receipt||jsonb_build_array(jsonb_build_object('positionId',v_position.id,'lotId',v_lot_id,'symbol',v_symbol));
  end if;
 end loop;
 -- An uncertain response may be retried even after unrelated later edits. It
 -- returns the already committed receipt; it never reapplies the opening lots.
 if matching=total then return jsonb_build_object('applied',true,'replayed',true,'positions',receipt);end if;
 if matching<>0 then raise exception using errcode='40001',message='Incomplete import receipt';end if;
 if public.screenshot_sync_snapshot()->>'fingerprint' is distinct from p_expected
 then raise exception using errcode='40001',message='Portfolio changed; prepare a fresh review';end if;

 for v_row in select value from jsonb_array_elements(p_rows) loop
  v_symbol:=v_row->>'symbol';v_location:=(v_row->>'location')::public.position_location;
  v_observed:=(v_row->>'observedAt')::date;v_lot_id:=(v_row->>'lotId')::uuid;
  if exists(select 1 from public.positions p join public.position_lots l on l.position_id=p.id and l.user_id=owner_id
   where p.user_id=owner_id and upper(btrim(p.symbol))=v_symbol and p.location=v_location and l.executed_at>v_observed)
  then raise exception using errcode='40001',message='Observation predates recorded activity; prepare a current review';end if;
  select p.id into v_position_id from public.positions p where p.user_id=owner_id
   and upper(btrim(p.symbol))=v_symbol and p.location=v_location and p.consolidated_into_position_id is null;
  v_new_position:=v_position_id is null;
  if v_position_id is null then
   insert into public.positions(user_id,symbol,display,image_url,location,entry_price,quantity,entry_date)
   values(owner_id,v_symbol,v_symbol,'',v_location,(v_row->>'averageCostUsd')::numeric,
    (v_row->>'quantity')::numeric,coalesce((v_row->>'acquiredOn')::date,v_observed)) returning id into v_position_id;
  end if;
  -- Each historical ledger remains distinct. Its current balance is reconciled
  -- to zero while the canonical ledger carries the observed aggregate balance.
  for ledger in select p.* from public.positions p where p.user_id=owner_id
   and upper(btrim(p.symbol))=v_symbol and p.location=v_location loop
   -- Preserve a legacy position's already-recorded opening balance before lots
   -- become its accounting source. This copies existing recorded values only;
   -- it never infers an execution from the screenshot or seeds a new position.
   if not (v_new_position and ledger.id=v_position_id) and ledger.quantity>0
    and not exists(select 1 from public.position_lots l where l.user_id=owner_id and l.position_id=ledger.id) then
    if ledger.entry_date>v_observed then raise exception using errcode='40001',message='Observation predates recorded opening balance';end if;
    insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount)
    values(md5(v_lot_id::text||':baseline:'||ledger.id::text)::uuid,owner_id,ledger.id,'BUY',
     ledger.entry_price,ledger.quantity,ledger.entry_date,false,0);
   end if;
   insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,basis_acquired_on,basis_date_estimate,has_commission,commission_amount)
   values(case when ledger.id=v_position_id then v_lot_id else md5(v_lot_id::text||':'||ledger.id::text)::uuid end,
    owner_id,ledger.id,'RECONCILE',case when ledger.id=v_position_id then (v_row->>'averageCostUsd')::numeric else 0 end,
    case when ledger.id=v_position_id then (v_row->>'quantity')::numeric else 0 end,v_observed,
    case when ledger.id=v_position_id then (v_row->>'acquiredOn')::date else null end,
    case when ledger.id=v_position_id then (v_row->>'estimatedAcquiredOn')::date else null end,false,0);
  end loop;
  receipt:=receipt||jsonb_build_array(jsonb_build_object('positionId',v_position_id,'lotId',v_lot_id,'symbol',v_symbol));
 end loop;
 return jsonb_build_object('applied',true,'replayed',false,'positions',receipt);
end;
$$;
revoke all on function public.apply_screenshot_sync(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.apply_screenshot_sync(text,jsonb) to authenticated;
grant execute on function public.apply_screenshot_sync(text,jsonb) to livestocks_sync_executor;

create function private.apply_chat_screenshot_sync(p_expected text,p_rows jsonb) returns jsonb
language sql security definer set search_path='' as $$
 select public.apply_screenshot_sync(p_expected,p_rows);
$$;
-- Ownership is transferred while schema creation is temporarily permitted;
-- the runtime executor cannot create a replacement function or arbitrary SQL.
grant create on schema private to livestocks_sync_executor;
alter function private.apply_chat_screenshot_sync(text,jsonb) owner to livestocks_sync_executor;
revoke create on schema private from livestocks_sync_executor;
revoke all on function private.apply_chat_screenshot_sync(text,jsonb) from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function private.apply_chat_screenshot_sync(text,jsonb) to livestocks_sync_executor;
create function public.apply_chat_screenshot_sync(p_expected text,p_rows jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select private.apply_chat_screenshot_sync(p_expected,p_rows);
$$;
revoke all on function public.apply_chat_screenshot_sync(text,jsonb) from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function public.apply_chat_screenshot_sync(text,jsonb) to livestocks_sync_executor;
