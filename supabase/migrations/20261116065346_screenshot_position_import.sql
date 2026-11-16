-- Screenshot extraction is untrusted input. OAuth can inspect a reconciliation,
-- but only the existing website writer can record user-approved opening lots.
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

create function public.apply_screenshot_sync(p_expected text,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 owner_id text:=private.authorized_subject(true);
 v_row jsonb; v_symbol text; v_location public.position_location; v_quantity numeric; v_price numeric;
 v_acquired date; v_lot_id uuid; matching integer:=0; total integer;
 v_existing public.position_lots%rowtype; v_position public.positions%rowtype;
 receipt jsonb:='[]'::jsonb; recorded record;
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
 if owner_id is distinct from private.authorized_subject(true)
 then raise exception using errcode='42501',message='Account authorization changed';end if;

 for v_row in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(v_row) is distinct from 'object'
   or (select count(*) from jsonb_object_keys(v_row))<>6
   or not v_row ?& array['symbol','quantity','averageCostUsd','acquiredOn','location','lotId']
   or jsonb_typeof(v_row->'symbol') is distinct from 'string'
   or jsonb_typeof(v_row->'quantity') is distinct from 'number'
   or jsonb_typeof(v_row->'averageCostUsd') is distinct from 'number'
   or jsonb_typeof(v_row->'acquiredOn') is distinct from 'string'
   or jsonb_typeof(v_row->'location') is distinct from 'string'
   or jsonb_typeof(v_row->'lotId') is distinct from 'string'
  then raise exception using errcode='22023',message='Invalid screenshot row';end if;
  v_symbol:=v_row->>'symbol'; v_quantity:=(v_row->>'quantity')::numeric;v_price:=(v_row->>'averageCostUsd')::numeric;
  v_location:=(v_row->>'location')::public.position_location;v_acquired:=(v_row->>'acquiredOn')::date;v_lot_id:=(v_row->>'lotId')::uuid;
  if v_symbol!~'^[A-Z0-9][A-Z0-9.^=:-]{0,31}$'
   or v_quantity<=0 or v_quantity>1000000000 or v_quantity<>round(v_quantity,4)
   or v_price<=0 or v_price>1000000000 or v_price<>round(v_price,4)
   or not isfinite(v_acquired) or v_acquired>current_date or v_acquired<date '1900-01-01'
  then raise exception using errcode='22023',message='Invalid screenshot row';end if;
  if (select count(*) from jsonb_array_elements(p_rows) r where r->>'symbol'=v_symbol and r->>'location'=v_location::text)<>1
   or (select count(*) from jsonb_array_elements(p_rows) r where r->>'lotId'=v_lot_id::text)<>1
  then raise exception using errcode='22023',message='Duplicate screenshot row';end if;
  select * into v_existing from public.position_lots l where l.id=v_lot_id and l.user_id=owner_id;
  if found then
   select * into strict v_position from public.positions p where p.id=v_existing.position_id and p.user_id=owner_id;
   if v_position.symbol is distinct from v_symbol or v_position.location is distinct from v_location
    or v_existing.side<>'BUY' or v_existing.price<>v_price or v_existing.quantity<>v_quantity or v_existing.executed_at<>v_acquired
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
  -- Historical and consolidated ledgers also prohibit an inferred new purchase.
  if exists(select 1 from public.positions p where p.user_id=owner_id and upper(btrim(p.symbol))=v_symbol and p.location=v_location)
  then raise exception using errcode='40001',message='Existing holding requires execution details';end if;
  select * into strict recorded from public.record_position_purchase(
   (v_row->>'lotId')::uuid,v_symbol,v_symbol,'',v_location,(v_row->>'averageCostUsd')::numeric,
   (v_row->>'quantity')::numeric,(v_row->>'acquiredOn')::date,false,0);
  receipt:=receipt||jsonb_build_array(jsonb_build_object('positionId',recorded.position_id,'lotId',recorded.lot_id,'symbol',v_symbol));
 end loop;
 return jsonb_build_object('applied',true,'replayed',false,'positions',receipt);
end;
$$;
revoke all on function public.apply_screenshot_sync(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.apply_screenshot_sync(text,jsonb) to authenticated;
