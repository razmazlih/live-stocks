-- Coordinated cutover: pause website/MCP writes while deploying this schema and UUID clients.
-- One transaction locks financial rows, preserves their IDs and business values, and invalidates old reviews.
begin;
select pg_advisory_xact_lock(73412311661002);
lock table public.user_profiles,public.positions,public.position_lots,public.position_plans in access exclusive mode;
do $$begin
 if exists(select 1 from private.account_merge_jobs where frozen_at is not null and state not in('completed','cancelled')) then
  raise exception 'Finish or recover frozen account merges before source cutover';end if;
end$$;
create table public.investment_sources(
 id uuid primary key default gen_random_uuid(),
 user_id text not null default private.authorized_subject(true) references public.user_profiles(id) on delete restrict,
 name text not null check(name=btrim(name) and char_length(name) between 1 and 80),
 created_at timestamptz not null default clock_timestamp(),
 archived_at timestamptz,
 legacy_location text check(legacy_location in('bank_one','bank_two')),
 unique(id,user_id), unique(user_id,name), unique(user_id,legacy_location)
);
alter table public.investment_sources enable row level security;
revoke all on public.investment_sources from public,anon,authenticated;
grant select on public.investment_sources to authenticated;
grant insert(name),update(name,archived_at) on public.investment_sources to authenticated;
grant all on public.investment_sources to service_role;
grant select,update on public.investment_sources to livestocks_merge_executor;
grant select on public.investment_sources to livestocks_sync_executor;
create policy owner_read on public.investment_sources for select to authenticated using(user_id=(select private.authorized_subject(false)));
create policy owner_insert on public.investment_sources for insert to authenticated with check(user_id=(select private.authorized_subject(true)));
create policy owner_update on public.investment_sources for update to authenticated using(user_id=(select private.authorized_subject(true))) with check(user_id=(select private.authorized_subject(true)));
create policy merge_read on public.investment_sources for select to livestocks_merge_executor using(true);
create policy merge_update on public.investment_sources for update to livestocks_merge_executor using(true) with check(true);
create policy sync_read on public.investment_sources for select to livestocks_sync_executor using(user_id=(select private.sync_authorized_subject()));

insert into public.investment_sources(user_id,name,legacy_location)
 select user_id,case location when 'bank_one' then 'ONE ZERO' else 'Pepper' end,location from (
 select user_id,location::text from public.positions union select p.user_id,coalesce(p.location,(select location from public.positions where id=p.position_id),'bank_one'::public.position_location)::text from public.position_plans p) x;
insert into public.investment_sources(user_id,name)
 select id,'מקור ראשי' from public.user_profiles p where not exists(select 1 from public.investment_sources s where s.user_id=p.id);
create function private.source_for_legacy(p_owner text,p_location text) returns uuid language sql stable set search_path='' as $$
 select id from public.investment_sources where user_id=p_owner and legacy_location=p_location;
$$;
alter table public.positions alter column location drop default;
alter table public.positions alter column location type uuid using private.source_for_legacy(user_id,location::text);
alter table public.position_plans alter column location type uuid using private.source_for_legacy(user_id,location::text);
-- Disable only timestamps/fences for this exact data-preserving backfill; restore before accepting writes.
alter table public.position_plans disable trigger user;
update public.position_plans p set location=coalesce((select location from public.positions where id=p.position_id),private.source_for_legacy(p.user_id,'bank_one')) where location is null;
alter table public.position_plans enable trigger user;
alter table public.position_plans alter column location set not null;
drop function private.source_for_legacy(text,text);
alter table public.positions add constraint positions_source_owner_fkey foreign key(location,user_id) references public.investment_sources(id,user_id) deferrable initially immediate;
alter table public.position_plans add constraint position_plans_source_owner_fkey foreign key(location,user_id) references public.investment_sources(id,user_id) deferrable initially immediate;
update private.chat_sync_proposals set status='cancelled' where status='pending';

-- Lock one owner's source catalog for every mutation. This also serializes last-active checks.
create function private.source_write_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='livestocks_merge_executor' then
  if tg_op<>'UPDATE' or (to_jsonb(new)-array['user_id','name','legacy_location']) is distinct from (to_jsonb(old)-array['user_id','name','legacy_location']) then
   raise exception 'Merge may only transfer and disambiguate sources';end if;
  return new;
 end if;
 if tg_op='DELETE' then raise exception using errcode='55000',message='Archive investment sources instead of deleting history';end if;
 if tg_op='UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at or new.legacy_location is distinct from old.legacy_location) then
  raise exception using errcode='42501',message='Source identity is immutable';end if;
 if current_user not in('postgres','service_role','supabase_admin') and new.user_id is distinct from private.authorized_subject(true) then
  raise exception using errcode='42501',message='Authorized website write required';end if;
 perform private.lock_active_profile(new.user_id);
 perform pg_advisory_xact_lock(hashtextextended('investment-sources:'||new.user_id,0));
 if current_user not in('postgres','service_role','supabase_admin') and new.user_id is distinct from private.authorized_subject(true) then raise exception using errcode='42501',message='Account authorization changed';end if;
 new.name:=btrim(new.name);
 if tg_op='UPDATE' and old.archived_at is null and new.archived_at is not null then
  if not exists(select 1 from public.investment_sources where user_id=new.user_id and id<>new.id and archived_at is null) then
   raise exception using errcode='55000',message='At least one active investment source is required';end if;
  if exists(select 1 from public.position_plans where user_id=new.user_id and location=new.id and status='pending') then
   raise exception using errcode='55000',message='Source has pending plans';end if;
  if exists(select 1 from public.positions p where p.user_id=new.user_id and p.location=new.id and
   case when not exists(select 1 from public.position_lots l where l.position_id=p.id and l.user_id=p.user_id) then p.quantity
   else coalesce((select l.quantity from public.position_lots l where l.position_id=p.id and l.user_id=p.user_id and l.side='RECONCILE' order by l.executed_at desc,l.created_at desc,l.id desc limit 1),0)
    +coalesce((select sum(case l.side when 'BUY' then l.quantity when 'SELL' then -l.quantity else 0 end) from public.position_lots l
      where l.position_id=p.id and l.user_id=p.user_id and l.side<>'RECONCILE'
       and not exists(select 1 from public.position_lots r where r.position_id=p.id and r.user_id=p.user_id and r.side='RECONCILE'
        and (r.executed_at,r.created_at,r.id)>=(l.executed_at,l.created_at,l.id))),0) end >0) then
   raise exception using errcode='55000',message='Source has open holdings';end if;
 end if;
 return new;
end$$;
revoke all on function private.source_write_guard() from public,anon,authenticated,service_role;
create trigger source_write_guard before insert or update or delete on public.investment_sources for each row execute function private.source_write_guard();
-- New-profile initialization is a fixed internal write; it cannot take an arbitrary owner from a client.
create function private.initialize_investment_source() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.investment_sources(user_id,name) values(new.id,'מקור ראשי');
 return new;
end$$;
revoke all on function private.initialize_investment_source() from public,anon,authenticated,service_role;
create trigger initialize_investment_source after insert on public.user_profiles for each row execute function private.initialize_investment_source();

create function private.require_active_source(p_id uuid,p_owner text) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('investment-sources:'||p_owner,0));
 perform 1 from public.investment_sources where id=p_id and user_id=p_owner and archived_at is null;
 if not found then raise exception using errcode='42501',message='An active investment source owned by this user is required';end if;
end$$;
revoke all on function private.require_active_source(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.require_active_source(uuid,text) to authenticated,livestocks_sync_executor;
create function private.position_source_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare source_id uuid;
begin
 if current_user='livestocks_merge_executor' then return new;end if;
 if tg_table_name='position_lots' then
  if new.side='SELL' or (new.side='RECONCILE' and new.quantity=0) then return new;end if;
  select location into source_id from public.positions where id=new.position_id and user_id=new.user_id;
 else
  source_id:=new.location;
  if tg_table_name='position_plans' and to_jsonb(new)->>'status'<>'pending' then return new;end if;
  if tg_table_name='positions' and tg_op='UPDATE' and new.location=old.location and (to_jsonb(new)->>'quantity')::numeric<=(to_jsonb(old)->>'quantity')::numeric then return new;end if;
 end if;
 perform private.require_active_source(source_id,new.user_id);
 return new;
end$$;
revoke all on function private.position_source_guard() from public,anon,authenticated,service_role;
create trigger b_position_source_guard before insert or update on public.positions for each row execute function private.position_source_guard();
create trigger b_position_source_guard before insert or update on public.position_plans for each row execute function private.position_source_guard();
create trigger c_position_source_guard before insert or update on public.position_lots for each row execute function private.position_source_guard();

create or replace function public.screenshot_sync_snapshot()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare owner_id text:=private.authorized_subject(false); snapshot jsonb;
begin
 if owner_id is null then raise exception using errcode='42501',message='Authentication required';end if;
 select jsonb_build_object(
  'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.investment_sources s where s.user_id=owner_id),'[]'::jsonb),
  'positions',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.positions p where p.user_id=owner_id),'[]'::jsonb),
  'lots',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.position_lots l where l.user_id=owner_id),'[]'::jsonb)
 ) into snapshot;
 return snapshot||jsonb_build_object('fingerprint',md5(snapshot::text));
end;
$$;
drop function public.record_position_purchase(uuid,text,text,text,public.position_location,numeric,numeric,date,boolean,numeric);
create or replace function public.record_position_purchase(
  p_request_id uuid, p_symbol text, p_display text, p_image_url text,
  p_location uuid, p_price numeric, p_quantity numeric,
  p_executed_at date, p_has_commission boolean default false,
  p_commission_amount numeric default 0
)
returns table(position_id uuid, lot_id uuid, reused boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_owner text := private.authorized_subject(true);
  v_symbol text := upper(btrim(p_symbol));
  v_position_id uuid;
  v_reused boolean := false;
  v_existing public.position_lots%rowtype;
  v_position public.positions%rowtype;
  v_commission numeric := case when p_has_commission then p_commission_amount else 0 end;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'Authorized website write access is required';
  end if;
  perform private.lock_active_profile(v_owner);
  if p_request_id is null or v_symbol is null or v_symbol = ''
     or nullif(btrim(p_display), '') is null or p_location is null
     or p_price is null or round(p_price, 4) <= 0 or p_price::text in ('NaN','Infinity','-Infinity')
     or p_quantity is null or round(p_quantity, 4) <= 0 or p_quantity::text in ('NaN','Infinity','-Infinity')
     or p_executed_at is null or not isfinite(p_executed_at)
     or p_has_commission is null or v_commission is null or v_commission < 0
     or v_commission::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode = '22023', message = 'Invalid purchase details';
  end if;
  -- Match sync's table-before-source lock order; compatible with ordinary browser writes.
  lock table public.positions,public.position_lots in row exclusive mode;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner || ':' || p_request_id::text, 0));
  select l.* into v_existing from public.position_lots l where l.id = p_request_id and l.user_id = v_owner;
  if found then
    select p.* into strict v_position from public.positions p
      where p.id = v_existing.position_id and p.user_id = v_owner;
    if upper(btrim(v_position.symbol)) <> v_symbol or v_position.location <> p_location
       or v_existing.side <> 'BUY' or v_existing.price <> round(p_price,4)
       or v_existing.quantity <> round(p_quantity,4) or v_existing.executed_at <> p_executed_at
       or v_existing.has_commission <> p_has_commission
       or v_existing.commission_amount <> round(v_commission,2) then
      raise exception using errcode = '22023', message = 'Purchase request ID was already used with different details';
    end if;
    return query select v_existing.position_id, v_existing.id, true;
    return;
  end if;
  perform private.require_active_source(p_location,v_owner);
  insert into public.positions(user_id,symbol,display,image_url,location,entry_price,quantity,entry_date)
    values(v_owner,v_symbol,btrim(p_display),coalesce(p_image_url,''),p_location,p_price,p_quantity,p_executed_at)
    on conflict(user_id,(upper(btrim(symbol))),location) where consolidated_into_position_id is null do nothing returning id into v_position_id;
  if v_position_id is null then
    v_reused := true;
    select p.* into strict v_position from public.positions p
      where p.user_id = v_owner and upper(btrim(p.symbol)) = v_symbol and p.location = p_location and p.consolidated_into_position_id is null for update;
    v_position_id := v_position.id;
    if v_position.quantity > 0 and not exists(select 1 from public.position_lots l where l.position_id = v_position_id and l.user_id = v_owner) then
      insert into public.position_lots(user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount)
        values(v_owner,v_position_id,'BUY',v_position.entry_price,v_position.quantity,v_position.entry_date,false,0);
    end if;
  end if;
  insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount)
    values(p_request_id,v_owner,v_position_id,'BUY',p_price,p_quantity,p_executed_at,p_has_commission,v_commission);
  return query select v_position_id,p_request_id,v_reused;
end;
$$;
revoke all on function public.record_position_purchase(uuid,text,text,text,uuid,numeric,numeric,date,boolean,numeric) from public,anon,authenticated,service_role;
grant execute on function public.record_position_purchase(uuid,text,text,text,uuid,numeric,numeric,date,boolean,numeric) to authenticated;

create or replace function public.apply_screenshot_sync(p_expected text,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 owner_id text:=case when current_user='livestocks_sync_executor' then private.sync_authorized_subject() else private.authorized_subject(true) end;
 v_row jsonb; v_symbol text; v_location uuid; v_quantity numeric; v_price numeric;
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
 perform pg_advisory_xact_lock(hashtextextended('investment-sources:'||owner_id,0));
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
  v_location:=(v_row->>'location')::uuid;v_acquired:=(v_row->>'acquiredOn')::date;v_lot_id:=(v_row->>'lotId')::uuid;
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
  perform private.require_active_source((v_row->>'location')::uuid,owner_id);
  v_symbol:=v_row->>'symbol';v_location:=(v_row->>'location')::uuid;
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
create or replace function public.server_widget_snapshot(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare widget private.widget_tokens%rowtype;result jsonb;
begin
 select * into widget from private.widget_tokens where token_hash=p_token_hash and revoked_at is null and expires_at>clock_timestamp();
 if not found then return null;end if;
 perform private.lock_active_profile(widget.user_id);
 select * into widget from private.widget_tokens where token_hash=p_token_hash and revoked_at is null and expires_at>clock_timestamp() for update;
 if not found then return null;end if;
 update private.widget_tokens set last_used_at=clock_timestamp() where id=widget.id;
 select jsonb_build_object('user_id',widget.user_id,'expires_at',widget.expires_at,
  'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.investment_sources s where s.user_id=widget.user_id),'[]'::jsonb),
  'positions',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.positions p where p.user_id=widget.user_id),'[]'::jsonb),
  'position_lots',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.position_lots l where l.user_id=widget.user_id),'[]'::jsonb),
  'settings',(select to_jsonb(s) from public.settings s where s.user_id=widget.user_id and s.is_active),
  'encrypted_credential',(select encrypted_value from private.user_credentials where user_id=widget.user_id),
  'credential_aad_subject',widget.user_id) into result;
 return result;
end;
$$;
create or replace function private.merge_manifest(p_primary text,p_secondary text) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:='{}';t text;n bigint;digest text;
begin
 foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers','investment_sources'] loop
  execute format('select count(*),encode(sha256(convert_to(coalesce(string_agg((to_jsonb(r)-array[''user_id'',''consolidated_into_position_id'',''is_active'']-case when %L=''investment_sources'' then array[''name'',''legacy_location''] else array[]::text[] end)::text,E''\n'' order by id),''''),''UTF8'')),''hex'') from public.%I r where user_id=$1 or user_id=$2',t,t)
   into n,digest using p_primary,p_secondary;
  result:=result||jsonb_build_object(t,jsonb_build_object('count',n,'digest',digest));
 end loop;
 return result;
end;
$$;
-- Managed postgres has SET membership, but does not inherit executor ownership.
-- Replace this function as its existing owner; CREATE is held only inside this transaction.
grant create on schema public to livestocks_merge_executor;
set local role livestocks_merge_executor;
create or replace function public.server_merge_prepare(p_job_id uuid,p_encrypted_value text default null,p_credential_version text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.account_merge_jobs%rowtype;t text;chosen_settings uuid;expected_secret text;s record;candidate text;counter integer;
begin
 select * into strict j from private.account_merge_jobs where id=p_job_id for update;
 if j.data_prepared_at is not null then return private.merge_job_json(j.id);end if;
 if j.frozen_at is null or j.state not in('frozen','reconcile_required') then raise exception 'Committed merge freeze required';end if;
 perform 1 from public.user_profiles where id in(j.primary_profile_id,j.secondary_profile_id) order by id for update;
 if exists(select 1 from public.user_profiles where id in(j.primary_profile_id,j.secondary_profile_id) and merge_state<>'frozen') then raise exception 'Both profiles must remain frozen';end if;
 if private.merge_manifest(j.primary_profile_id,j.secondary_profile_id) is distinct from j.before_manifest then raise exception 'Frozen financial baseline changed';end if;
 if j.credential_source_profile_id is not null then
  select encode(sha256(convert_to(encrypted_value,'UTF8')),'hex') into expected_secret from private.user_credentials where user_id=j.credential_source_profile_id;
  if expected_secret is distinct from j.credential_version or p_credential_version is distinct from expected_secret
   or p_encrypted_value is null or p_encrypted_value !~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then raise exception 'Credential version or reencryption missing';end if;
 elsif p_encrypted_value is not null or p_credential_version is not null then raise exception 'Unexpected credential';end if;
 foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers','investment_sources'] loop
  execute format('insert into private.account_merge_row_history(job_id,table_name,row_id,original_owner,original_row) select $1,$2,id,user_id,to_jsonb(r) from public.%I r where user_id=$3 or user_id=$4',t)
   using j.id,t,j.primary_profile_id,j.secondary_profile_id;
 end loop;
 insert into private.account_merge_credential_history(job_id,source_profile_id,original_aad_subject,encrypted_value,original_updated_at)
 select j.id,user_id,user_id,encrypted_value,updated_at from private.user_credentials where user_id in(j.primary_profile_id,j.secondary_profile_id);
 set constraints public.positions_source_owner_fkey,public.position_plans_source_owner_fkey,public.positions_consolidation_owner_fkey,public.position_lots_position_owner_fkey,public.position_plans_position_owner_fkey,public.watchlist_tickers_group_owner_fkey deferred;
 -- Preserve independent source IDs. Resolve names/legacy URL aliases without merging financial ledgers.
 for s in select * from public.investment_sources where user_id=j.secondary_profile_id order by id loop
  candidate:=s.name;counter:=0;
  while exists(select 1 from public.investment_sources where user_id=j.primary_profile_id and name=candidate) loop
   counter:=counter+1;candidate:=left(s.name,36)||' ('||s.id::text||case when counter=1 then '' else '-'||counter::text end||')';
  end loop;
  update public.investment_sources set name=candidate,legacy_location=case when exists(select 1 from public.investment_sources where user_id=j.primary_profile_id and legacy_location=s.legacy_location) then null else s.legacy_location end,
   user_id=j.primary_profile_id where id=s.id;
 end loop;
 -- Rank one future purchase target, while retaining every original FIFO ledger.
 with ranked as(select id,first_value(id) over(partition by upper(btrim(symbol)),location
  order by (user_id=j.primary_profile_id and consolidated_into_position_id is null) desc,(consolidated_into_position_id is null) desc,created_at,id) winner
  from public.positions where user_id in(j.primary_profile_id,j.secondary_profile_id))
 update public.positions p set consolidated_into_position_id=case when ranked.id=ranked.winner then null else ranked.winner end
 from ranked where p.id=ranked.id;
 select id into strict chosen_settings from public.settings where user_id=j.settings_source_profile_id and is_active;
 update public.settings set is_active=false where user_id in(j.primary_profile_id,j.secondary_profile_id) and id<>chosen_settings;
 foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers','investment_sources'] loop
  execute format('update public.%I set user_id=$1 where user_id=$2',t) using j.primary_profile_id,j.secondary_profile_id;
 end loop;
 delete from private.user_credentials where user_id in(j.primary_profile_id,j.secondary_profile_id);
 if p_encrypted_value is not null then insert into private.user_credentials(user_id,encrypted_value) values(j.primary_profile_id,p_encrypted_value);end if;
 if private.merge_manifest(j.primary_profile_id,j.secondary_profile_id) is distinct from j.before_manifest then raise exception 'Lossless financial verification failed';end if;
 update private.identity_profiles set profile_id=j.primary_profile_id,state='blocked',version=version+1 where profile_id in(j.primary_profile_id,j.secondary_profile_id);
 update public.user_profiles set merge_state='merged',merged_into_profile_id=j.primary_profile_id where id=j.secondary_profile_id;
 update private.account_merge_jobs set state='revocation_pending',version=version+1,data_prepared_at=clock_timestamp() where id=j.id;
 set constraints public.positions_source_owner_fkey,public.position_plans_source_owner_fkey,public.positions_consolidation_owner_fkey,public.position_lots_position_owner_fkey,public.position_plans_position_owner_fkey,public.watchlist_tickers_group_owner_fkey immediate;
 return private.merge_job_json(j.id);
end;
$$;
-- Old enum has no live references; historical migrations retain its original definition.
reset role;
revoke create on schema public from livestocks_merge_executor;
drop type public.position_location;
notify pgrst,'reload schema';
commit;
