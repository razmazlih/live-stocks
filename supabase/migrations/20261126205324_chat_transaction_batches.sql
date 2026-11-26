begin;

create function private.chat_transaction_increment_lot_id(p_last uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare value text:=replace(p_last::text,'-','');digits text:='0123456789abcdef';idx integer;digit integer;
begin
 if value is null then return gen_random_uuid();end if;
 for idx in reverse 32..1 loop
  digit:=strpos(digits,substr(value,idx,1));
  if digit<16 then value:=overlay(value placing substr(digits,digit+1,1) from idx for 1);return value::uuid;end if;
  value:=overlay(value placing '0' from idx for 1);
 end loop;
 raise exception using errcode='22003',message='No remaining lot sequence';
end$$;

create or replace function private.chat_transaction_next_lot_id(p_position uuid) returns uuid
language sql security invoker set search_path='' as $$
 select private.chat_transaction_increment_lot_id(
  (select id from public.position_lots where position_id=p_position order by id desc limit 1)
 );
$$;

-- Legacy, recorded and proposed lots use the same FIFO replay.
create or replace function private.chat_transaction_summary(p_position uuid,p_added jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare event record;queue jsonb:='[]';entry jsonb;q numeric;cost numeric;take numeric;remaining numeric;total numeric:=0;basis numeric:=0;complete boolean:=true;first_checkpoint date;
begin
 select min(executed_at) into first_checkpoint from public.position_lots where position_id=p_position and side='RECONCILE';
 for event in
  with events as (
   select id,side,quantity,price,executed_at,created_at,has_commission,commission_amount,commission_known from public.position_lots where position_id=p_position
   union all
   select '00000000-0000-0000-0000-000000000000'::uuid,'BUY',p.quantity,p.entry_price,p.entry_date,'1900-01-01'::timestamptz,false,0,true from public.positions p
    where p.id=p_position and p.quantity>0 and not exists(select 1 from public.position_lots l where l.position_id=p.id)
   union all
   select (added->>'id')::uuid,added->>'side',(added->>'quantity')::numeric,(added->>'priceUsd')::numeric,(added->>'executedOn')::date,
    (added->>'createdAt')::timestamptz,added->'commissionUsd'<>'null'::jsonb,coalesce((added->>'commissionUsd')::numeric,0),added->'commissionUsd'<>'null'::jsonb
   from jsonb_array_elements(
    case when p_added is null then '[]'::jsonb when jsonb_typeof(p_added)='array' then p_added else jsonb_build_array(p_added) end
   ) as additions(added)
  ),bucketed as (
   select e.*,case when e.side='RECONCILE' then 1+2*(select count(*) from events r where r.side='RECONCILE' and r.executed_at=e.executed_at and (r.created_at,r.id)<(e.created_at,e.id))
    else 2*(select count(*) from events r where r.side='RECONCILE' and r.executed_at=e.executed_at and r.created_at<e.created_at) end as bucket from events e
  ) select * from bucketed order by executed_at,bucket,case when executed_at>first_checkpoint or bucket>0 then created_at end nulls first,id
 loop
  if event.quantity<0 or event.price<0 or event.quantity::text in('NaN','Infinity','-Infinity') or event.price::text in('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='Existing ledger contains invalid amounts';end if;
  if event.side='RECONCILE' then
   queue:='[]';if event.quantity>0 then queue:=jsonb_build_array(jsonb_build_object('q',event.quantity,'cost',event.quantity*event.price,'known',true));end if;
  elsif event.side='BUY' then
   if event.quantity>0 and event.price<=0 then raise exception using errcode='22023',message='Existing purchase cost is missing';end if;
   queue:=queue||jsonb_build_array(jsonb_build_object('q',event.quantity,'cost',event.quantity*event.price+case when event.has_commission then event.commission_amount else 0 end,'known',event.commission_known));
  elsif event.side='SELL' then
   remaining:=event.quantity;
   while remaining>0.00000001 loop
    if jsonb_array_length(queue)=0 then raise exception using errcode='22023',message='Sale exceeds recorded quantity at its execution date';end if;
    entry:=queue->0;q:=(entry->>'q')::numeric;cost:=(entry->>'cost')::numeric;
    take:=least(q,remaining);remaining:=remaining-take;
    if take>=q then queue:=queue-0;else queue:=jsonb_set(queue,'{0}',jsonb_build_object('q',q-take,'cost',cost*(q-take)/q,'known',entry->'known'));end if;
   end loop;
  end if;
 end loop;
 for entry in select value from jsonb_array_elements(queue) loop total:=total+(entry->>'q')::numeric;basis:=basis+(entry->>'cost')::numeric;complete:=complete and (entry->>'known')::boolean;end loop;
 return jsonb_build_object('quantity',total,'cost',basis,'average',case when total>0 then basis/total else 0 end,'costComplete',complete);
end$$;

create function private.chat_transaction_batch_lot(p_owner text,p_input jsonb,p_plan jsonb,p_prior jsonb,p_apply boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare position public.positions%rowtype;other public.positions%rowtype;earlier jsonb;previous jsonb;
 location_id uuid;v_symbol text;side text;quantity numeric;price numeric;executed date;commission numeric;added jsonb;before_summary jsonb;after_summary jsonb;
 lot_id uuid;baseline_id uuid;created timestamptz;new_position boolean:=false;source_name text;
begin
 if jsonb_typeof(p_input) is distinct from 'object'
  or p_input-array['location','side','symbol','quantity','priceUsd','executedOn','commissionUsd']<>'{}'::jsonb
  or not p_input ?& array['location','side','symbol','quantity','priceUsd','executedOn','commissionUsd']
  or jsonb_typeof(p_input->'quantity') is distinct from 'number' or jsonb_typeof(p_input->'priceUsd') is distinct from 'number'
  or jsonb_typeof(p_input->'symbol') is distinct from 'string' or jsonb_typeof(p_input->'side') is distinct from 'string' or jsonb_typeof(p_input->'location') is distinct from 'string' or jsonb_typeof(p_input->'executedOn') is distinct from 'string'
  or jsonb_typeof(p_input->'commissionUsd') is distinct from 'number' or p_input->>'side' not in('BUY','SELL')
  or p_input->>'symbol'!~'^[A-Z0-9][A-Z0-9.^=:-]{0,31}$' or p_input->>'executedOn'!~'^\d{4}-\d{2}-\d{2}$'
 then raise exception using errcode='22023',message='Invalid recorded transaction';end if;
 location_id:=(p_input->>'location')::uuid;v_symbol:=p_input->>'symbol';side:=p_input->>'side';quantity:=(p_input->>'quantity')::numeric;price:=(p_input->>'priceUsd')::numeric;executed:=(p_input->>'executedOn')::date;commission:=(p_input->>'commissionUsd')::numeric;
 if quantity<=0 or price<=0 or quantity>1000000000 or price>1000000000 or quantity<>round(quantity,4) or price<>round(price,4)
  or quantity::text in('NaN','Infinity','-Infinity') or price::text in('NaN','Infinity','-Infinity')
  or commission<0 or commission>1000000000 or commission<>round(commission,2)
  or executed<'1900-01-01' or executed>(clock_timestamp() at time zone 'Asia/Jerusalem')::date
 then raise exception using errcode='22023',message='Invalid recorded transaction amount or date';end if;
 perform private.require_active_source(location_id,p_owner);
 select name into source_name from public.investment_sources where id=location_id and user_id=p_owner;
 select * into position from public.positions p where p.user_id=p_owner and upper(btrim(p.symbol))=v_symbol and p.location=location_id and p.consolidated_into_position_id is null;
 for other in select * from public.positions p where p.user_id=p_owner and upper(btrim(p.symbol))=v_symbol and p.location=location_id and p.consolidated_into_position_id is not null loop
  if (private.chat_transaction_summary(other.id)->>'quantity')::numeric>0 then raise exception using errcode='22023',message='Multiple open ledgers require consolidation before recording';end if;
 end loop;
 -- On preparation, carry forward earlier proposed lots for this holding
 -- without inserting anything. On confirmation, earlier lots already exist
 -- inside this same database transaction.
 select coalesce(jsonb_agg(addition order by ordinal),'[]'::jsonb) into earlier
 from jsonb_array_elements(p_prior) with ordinality as prior(addition,ordinal)
 where (addition->>'location')::uuid=location_id and addition->>'symbol'=v_symbol;
 previous:=earlier->-1;
 if position.id is null and previous is null and side='SELL' then
  raise exception using errcode='22023',message='No recorded holding to sell';
 end if;
 before_summary:=private.chat_transaction_summary(position.id,earlier);
 lot_id:=case when previous is null then private.chat_transaction_next_lot_id(position.id)
              else private.chat_transaction_increment_lot_id((previous->>'id')::uuid) end;
 select greatest(clock_timestamp(),max(l.created_at)+interval '1 millisecond',(previous->>'createdAt')::timestamptz+interval '1 millisecond') into created
 from public.position_lots l where l.position_id=position.id;
 added:=p_input||jsonb_build_object('id',lot_id,'createdAt',created);
 after_summary:=private.chat_transaction_summary(position.id,earlier||jsonb_build_array(added));
 if jsonb_typeof(p_plan) is distinct from 'object'
  or p_plan->'transaction' is distinct from p_input or p_plan->'canApply' is distinct from 'true'::jsonb
  or p_plan#>>'{location}' is distinct from location_id::text or p_plan#>>'{sourceName}' is distinct from source_name
  or jsonb_typeof(p_plan#>'{changes}') is distinct from 'array' or jsonb_array_length(p_plan#>'{changes}')<>1
  or jsonb_typeof(p_plan#>'{changes,0,previousQuantity}') is distinct from 'number' or jsonb_typeof(p_plan#>'{changes,0,quantity}') is distinct from 'number' or jsonb_typeof(p_plan#>'{changes,0,averageCostUsd}') is distinct from 'number'
  or ((before_summary->>'quantity')::numeric>0 and jsonb_typeof(p_plan#>'{changes,0,previousAverageCostUsd}') is distinct from 'number') or p_plan#>>'{changes,0,symbol}' is distinct from v_symbol
  or abs((p_plan#>>'{changes,0,previousQuantity}')::numeric-(before_summary->>'quantity')::numeric)>0.00001
  or abs((p_plan#>>'{changes,0,quantity}')::numeric-(after_summary->>'quantity')::numeric)>0.00001
  or abs(coalesce((p_plan#>>'{changes,0,previousAverageCostUsd}')::numeric,0)-(before_summary->>'average')::numeric)>0.0001
  or abs((p_plan#>>'{changes,0,averageCostUsd}')::numeric-(after_summary->>'average')::numeric)>0.0001
 then raise exception using errcode='22023',message='Displayed transaction review does not match the recorded ledger';end if;
 if not p_apply then return added;end if;
 if position.id is null then
  insert into public.positions(user_id,symbol,display,image_url,location,entry_price,quantity,entry_date) values(p_owner,v_symbol,v_symbol,'',location_id,price,quantity,executed) returning * into position;new_position:=true;
 end if;
 if not new_position and position.quantity>0 and not exists(select 1 from public.position_lots l where l.position_id=position.id) then
  baseline_id:=lot_id;
  insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,created_at,has_commission,commission_amount,commission_known)
   values(baseline_id,p_owner,position.id,'BUY',position.entry_price,position.quantity,position.entry_date,created-interval '1 millisecond',false,0,true);
  lot_id:=private.chat_transaction_next_lot_id(position.id);
 end if;
 insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,created_at,has_commission,commission_amount,commission_known)
  values(lot_id,p_owner,position.id,side,price,quantity,executed,created,commission>0,commission,true);
 return jsonb_build_object('applied',true,'positionId',position.id,'lotId',lot_id,'transaction',p_input,'commissionKnown',true);
end$$;

-- One immutable proposal, one fingerprint and one database transaction for the
-- entire batch. Old single-trade proposals and their receipt format remain valid.
create or replace function private.chat_transaction_worker(p_id uuid,p_expected text,p_input jsonb,p_review jsonb,p_apply boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 owner_id text:=private.chat_transaction_principal()->>'owner_id';
 batch boolean:=p_input ? 'transactions';
 inputs jsonb;
 plans jsonb;
 result jsonb;
 prior jsonb:='[]'::jsonb;
 receipts jsonb:='[]'::jsonb;
 idx integer;
begin
 if owner_id is null or p_id is null or p_expected is null or p_expected!~'^[a-f0-9]{32}$'
  or jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_review) is distinct from 'object'
  or p_review->'input' is distinct from p_input then
  raise exception using errcode='22023',message='Invalid transaction review';
 end if;

 if batch then
  inputs:=p_input->'transactions';
  plans:=p_review#>'{plan,transactions}';
  if p_input-'transactions'<>'{}'::jsonb or jsonb_typeof(inputs) is distinct from 'array'
   or jsonb_typeof(plans) is distinct from 'array' or p_review#>'{plan,canApply}' is distinct from 'true'::jsonb then
   raise exception using errcode='22023',message='Invalid transaction batch';
  end if;
  if jsonb_array_length(inputs) not between 1 and 25 or jsonb_array_length(inputs)<>jsonb_array_length(plans) then
   raise exception using errcode='22023',message='Invalid transaction batch size';
  end if;
 else
  inputs:=jsonb_build_array(p_input);
  plans:=jsonb_build_array(p_review->'plan');
 end if;

 -- Preserve the existing table → source catalog → profile lock order.
 perform set_config('lock_timeout','3s',true);
 lock table public.positions,public.position_lots in share row exclusive mode;
 perform private.require_active_source((inputs#>>'{0,location}')::uuid,owner_id);
 perform private.lock_active_profile(owner_id);
 if private.chat_transaction_principal()->>'owner_id' is distinct from owner_id
  or public.screenshot_sync_snapshot()->>'fingerprint' is distinct from p_expected then
  raise exception using errcode='40001',message='Portfolio changed since this review';
 end if;

 for idx in 0..jsonb_array_length(inputs)-1 loop
  result:=private.chat_transaction_batch_lot(owner_id,inputs->idx,plans->idx,prior,p_apply);
  if p_apply then
   receipts:=receipts||jsonb_build_array(result);
  else
   prior:=prior||jsonb_build_array(result);
  end if;
 end loop;
 if not p_apply then return jsonb_build_object('validated',true);end if;
 if batch then return jsonb_build_object('applied',true,'transactions',receipts);end if;
 return receipts->0;
end$$;

revoke all on function private.chat_transaction_increment_lot_id(uuid),private.chat_transaction_batch_lot(text,jsonb,jsonb,jsonb,boolean)
 from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function private.chat_transaction_increment_lot_id(uuid),private.chat_transaction_batch_lot(text,jsonb,jsonb,jsonb,boolean)
 to livestocks_transaction_executor;
drop function private.chat_transaction_worker_with_legacy_fee_validation(uuid,text,jsonb,jsonb,boolean);
commit;
