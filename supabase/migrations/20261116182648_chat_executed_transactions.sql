-- A separately consented, narrow record of trades already executed elsewhere.
-- No broker orders, general portfolio writes or existing grant expansion.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.position_lots add column commission_known boolean not null default true;
alter table public.position_lots add constraint position_lots_commission_known_check check(commission_known or (has_commission=false and commission_amount=0));

do $$begin
 if not exists(select 1 from pg_roles where rolname='livestocks_transaction_executor') then
  create role livestocks_transaction_executor nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole;
 elsif exists(select 1 from pg_roles where rolname='livestocks_transaction_executor' and (rolcanlogin or rolinherit or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole)) then raise exception 'Unsafe transaction executor role';end if;
end$$;
-- Managed migration runners are not superusers. Explicit SET membership is
-- required for ownership transfer; never rely on inherited role permissions.
do $$begin execute format('grant livestocks_transaction_executor to %I with inherit false, set true',current_user);end$$;
grant usage on schema public,private,auth to livestocks_transaction_executor;
grant execute on function private.chat_sync_principal(),private.authorized_subject(boolean),private.lock_active_profile(text),private.require_active_source(uuid,text),public.screenshot_sync_snapshot() to livestocks_transaction_executor;

create function private.chat_transaction_principal() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare binding jsonb:=private.chat_sync_principal();
begin
 if binding is null or not string_to_array(auth.jwt()->>'scope',' ') @> array['portfolio:read','portfolio:transactions'] then return null;end if;
 return binding;
end$$;
revoke all on function private.chat_transaction_principal() from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function private.chat_transaction_principal() to livestocks_transaction_executor;
-- UPDATE enables only the table lock; no executor row UPDATE policy exists.
grant select,insert,update on public.positions,public.position_lots to livestocks_transaction_executor;
grant select on public.investment_sources to livestocks_transaction_executor;
create policy transaction_read on public.positions for select to livestocks_transaction_executor using(user_id=private.chat_transaction_principal()->>'owner_id');
create policy transaction_insert on public.positions for insert to livestocks_transaction_executor with check(user_id=private.chat_transaction_principal()->>'owner_id');
create policy transaction_read on public.position_lots for select to livestocks_transaction_executor using(user_id=private.chat_transaction_principal()->>'owner_id');
create policy transaction_insert on public.position_lots for insert to livestocks_transaction_executor with check(user_id=private.chat_transaction_principal()->>'owner_id');
create policy transaction_read on public.investment_sources for select to livestocks_transaction_executor using(user_id=private.chat_transaction_principal()->>'owner_id');

create or replace function private.account_write_fence() returns trigger language plpgsql security invoker set search_path='' as $$
declare owner_id text; allowed text[]:=array['user_id','consolidated_into_position_id','is_active'];
begin
 if current_user='livestocks_merge_executor' then
  if tg_op<>'UPDATE' then raise exception 'Merge executor cannot insert or delete financial records';end if;
  if (to_jsonb(new)-allowed) is distinct from (to_jsonb(old)-allowed) then raise exception 'Merge executor changed financial business fields';end if;
  return new;
 end if;
 if current_user='livestocks_transaction_executor' then
  if tg_op<>'INSERT' or tg_table_schema<>'public' or tg_table_name not in('positions','position_lots')
   or new.user_id is null or new.user_id is distinct from private.chat_transaction_principal()->>'owner_id'
  then raise exception using errcode='42501',message='Restricted recorded-transaction insert required';end if;
  if tg_table_name='position_lots' then
   if new.side not in('BUY','SELL') or new.basis_acquired_on is not null or new.basis_date_estimate is not null
    or new.quantity<=0 or new.price<=0
   then raise exception using errcode='42501',message='Only actual recorded BUY or SELL lots may be inserted';end if;
  elsif new.consolidated_into_position_id is not null or to_jsonb(new)->'is_active'='false'::jsonb then
   raise exception using errcode='42501',message='Merge metadata is server-managed';
  end if;
  perform private.lock_active_profile(new.user_id);
  if new.user_id is distinct from private.chat_transaction_principal()->>'owner_id' then raise exception using errcode='42501',message='Account authorization changed';end if;
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


-- IDs preserve the app's legacy same-day FIFO order (snapshot lots are ID ordered).
-- Appending an actual trade must not randomly reorder earlier same-day sales.
create function private.chat_transaction_next_lot_id(p_position uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare value text;digits text:='0123456789abcdef';idx integer;digit integer;
begin
 select replace(id::text,'-','') into value from public.position_lots where position_id=p_position order by id desc limit 1;
 if value is null then return gen_random_uuid();end if;
 for idx in reverse 32..1 loop
  digit:=strpos(digits,substr(value,idx,1));
  if digit<16 then value:=overlay(value placing substr(digits,digit+1,1) from idx for 1);return value::uuid;end if;
  value:=overlay(value placing '0' from idx for 1);
 end loop;
 raise exception using errcode='22003',message='No remaining lot sequence';
end$$;

-- Replay the entire timeline, including a prospective historical insert. The
-- ordering matches orderPositionLots: legacy ID order, checkpoint buckets, then
-- recorded creation order after checkpoints. No historical row is changed.
create function private.chat_transaction_summary(p_position uuid,p_added jsonb default null) returns jsonb
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
   select (p_added->>'id')::uuid,p_added->>'side',(p_added->>'quantity')::numeric,(p_added->>'priceUsd')::numeric,(p_added->>'executedOn')::date,
    (p_added->>'createdAt')::timestamptz,p_added->'commissionUsd'<>'null'::jsonb,coalesce((p_added->>'commissionUsd')::numeric,0),p_added->'commissionUsd'<>'null'::jsonb where p_added is not null
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

create table private.chat_transaction_proposals(
 id uuid primary key,owner_id text not null references public.user_profiles(id) on delete restrict,
 subject text not null,session_id text not null,client_id text not null,grant_id uuid not null,
 expected text not null check(expected~'^[a-f0-9]{32}$'),input jsonb not null,review jsonb not null,
 confirmation_hash text not null check(confirmation_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 status text not null default 'pending' check(status in('pending','applied','cancelled','superseded')),receipt jsonb,
 check(expires_at>created_at and expires_at<=created_at+interval '15 minutes'),check((status='applied')=(receipt is not null))
);
alter table private.chat_transaction_proposals enable row level security;
revoke all on private.chat_transaction_proposals from public,anon,authenticated,service_role,livestocks_auth_backend;
grant select,insert,update on private.chat_transaction_proposals to livestocks_transaction_executor;
create unique index chat_transaction_one_pending_binding_idx on private.chat_transaction_proposals(owner_id,subject,session_id,client_id,grant_id) where status='pending';
create policy transaction_proposal_binding on private.chat_transaction_proposals to livestocks_transaction_executor
 using(owner_id=private.chat_transaction_principal()->>'owner_id' and subject=private.chat_transaction_principal()->>'subject'
 and session_id=private.chat_transaction_principal()->>'session_id' and client_id=private.chat_transaction_principal()->>'client_id' and grant_id::text=private.chat_transaction_principal()->>'grant_id')
 with check(owner_id=private.chat_transaction_principal()->>'owner_id' and subject=private.chat_transaction_principal()->>'subject'
 and session_id=private.chat_transaction_principal()->>'session_id' and client_id=private.chat_transaction_principal()->>'client_id' and grant_id::text=private.chat_transaction_principal()->>'grant_id');
create trigger chat_transaction_proposal_immutable before update on private.chat_transaction_proposals for each row execute function private.chat_sync_proposal_immutable();

create function private.chat_transaction_worker(p_id uuid,p_expected text,p_input jsonb,p_review jsonb,p_apply boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare binding jsonb:=private.chat_transaction_principal();owner_id text:=binding->>'owner_id';position public.positions%rowtype;other public.positions%rowtype;
 location_id uuid;v_symbol text;side text;quantity numeric;price numeric;executed date;commission numeric;added jsonb;before_summary jsonb;after_summary jsonb;
 lot_id uuid;baseline_id uuid;created timestamptz;new_position boolean:=false;source_name text;
begin
 if owner_id is null or p_id is null or p_expected is null or p_expected!~'^[a-f0-9]{32}$' or jsonb_typeof(p_input) is distinct from 'object'
  or p_input-array['location','side','symbol','quantity','priceUsd','executedOn','commissionUsd']<>'{}'::jsonb
  or not p_input ?& array['location','side','symbol','quantity','priceUsd','executedOn','commissionUsd']
  or jsonb_typeof(p_input->'quantity') is distinct from 'number' or jsonb_typeof(p_input->'priceUsd') is distinct from 'number'
  or jsonb_typeof(p_input->'symbol') is distinct from 'string' or jsonb_typeof(p_input->'side') is distinct from 'string' or jsonb_typeof(p_input->'location') is distinct from 'string' or jsonb_typeof(p_input->'executedOn') is distinct from 'string'
  or jsonb_typeof(p_input->'commissionUsd') not in('number','null') or p_input->>'side' not in('BUY','SELL')
  or p_input->>'symbol'!~'^[A-Z0-9][A-Z0-9.^=:-]{0,31}$' or p_input->>'executedOn'!~'^\d{4}-\d{2}-\d{2}$'
 then raise exception using errcode='22023',message='Invalid recorded transaction';end if;
 location_id:=(p_input->>'location')::uuid;v_symbol:=p_input->>'symbol';side:=p_input->>'side';quantity:=(p_input->>'quantity')::numeric;price:=(p_input->>'priceUsd')::numeric;executed:=(p_input->>'executedOn')::date;commission:=(p_input->>'commissionUsd')::numeric;
 if quantity<=0 or price<=0 or quantity>1000000000 or price>1000000000 or quantity<>round(quantity,4) or price<>round(price,4)
  or quantity::text in('NaN','Infinity','-Infinity') or price::text in('NaN','Infinity','-Infinity')
  or (commission is not null and (commission<0 or commission>1000000000 or commission<>round(commission,2) or commission::text in('NaN','Infinity','-Infinity')))
  or executed<'1900-01-01' or executed>(clock_timestamp() at time zone 'Asia/Jerusalem')::date
 then raise exception using errcode='22023',message='Invalid recorded transaction amount or date';end if;
 -- This lock matches screenshot synchronization's ordering and excludes a
 -- concurrent website edit before the exact fingerprint is rechecked.
 perform set_config('lock_timeout','3s',true);
 lock table public.positions,public.position_lots in share row exclusive mode;
 perform private.require_active_source(location_id,owner_id);perform private.lock_active_profile(owner_id);
 if private.chat_transaction_principal()->>'owner_id' is distinct from owner_id or public.screenshot_sync_snapshot()->>'fingerprint' is distinct from p_expected then raise exception using errcode='40001',message='Portfolio changed since this review';end if;
 select name into source_name from public.investment_sources where id=location_id and user_id=owner_id;
 select * into position from public.positions p where p.user_id=owner_id and upper(btrim(p.symbol))=v_symbol and p.location=location_id and p.consolidated_into_position_id is null;
 for other in select * from public.positions p where p.user_id=owner_id and upper(btrim(p.symbol))=v_symbol and p.location=location_id and p.consolidated_into_position_id is not null loop
  if (private.chat_transaction_summary(other.id)->>'quantity')::numeric>0 then raise exception using errcode='22023',message='Multiple open ledgers require consolidation before recording';end if;
 end loop;
 if position.id is null and side='SELL' then raise exception using errcode='22023',message='No recorded holding to sell';end if;
 before_summary:=private.chat_transaction_summary(position.id);
 lot_id:=private.chat_transaction_next_lot_id(position.id);
 select greatest(clock_timestamp(),coalesce(max(l.created_at)+interval '1 millisecond','1900-01-01'::timestamptz)) into created from public.position_lots l where l.position_id=position.id;
 added:=p_input||jsonb_build_object('id',lot_id,'createdAt',created);
 after_summary:=private.chat_transaction_summary(position.id,added);
 if jsonb_typeof(p_review) is distinct from 'object' or p_review->'input' is distinct from p_input
  or p_review#>'{plan,transaction}' is distinct from p_input or p_review#>'{plan,canApply}' is distinct from 'true'::jsonb
  or p_review#>>'{plan,location}' is distinct from location_id::text or p_review#>>'{plan,sourceName}' is distinct from source_name
  or jsonb_typeof(p_review#>'{plan,changes}') is distinct from 'array' or jsonb_array_length(p_review#>'{plan,changes}')<>1
  or jsonb_typeof(p_review#>'{plan,changes,0,previousQuantity}') is distinct from 'number' or jsonb_typeof(p_review#>'{plan,changes,0,quantity}') is distinct from 'number' or jsonb_typeof(p_review#>'{plan,changes,0,averageCostUsd}') is distinct from 'number'
  or ((before_summary->>'quantity')::numeric>0 and jsonb_typeof(p_review#>'{plan,changes,0,previousAverageCostUsd}') is distinct from 'number') or p_review#>>'{plan,changes,0,symbol}' is distinct from v_symbol
  or abs((p_review#>>'{plan,changes,0,previousQuantity}')::numeric-(before_summary->>'quantity')::numeric)>0.00001
  or abs((p_review#>>'{plan,changes,0,quantity}')::numeric-(after_summary->>'quantity')::numeric)>0.00001
  or abs(coalesce((p_review#>>'{plan,changes,0,previousAverageCostUsd}')::numeric,0)-(before_summary->>'average')::numeric)>0.0001
  or abs((p_review#>>'{plan,changes,0,averageCostUsd}')::numeric-(after_summary->>'average')::numeric)>0.0001
 then raise exception using errcode='22023',message='Displayed transaction review does not match the recorded ledger';end if;
 if not p_apply then return jsonb_build_object('validated',true);end if;
 if position.id is null then
  insert into public.positions(user_id,symbol,display,image_url,location,entry_price,quantity,entry_date) values(owner_id,v_symbol,v_symbol,'',location_id,price,quantity,executed) returning * into position;new_position:=true;
 end if;
 if not new_position and position.quantity>0 and not exists(select 1 from public.position_lots l where l.position_id=position.id) then
  baseline_id:=lot_id;
  insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,created_at,has_commission,commission_amount,commission_known)
   values(baseline_id,owner_id,position.id,'BUY',position.entry_price,position.quantity,position.entry_date,created-interval '1 millisecond',false,0,true);
  lot_id:=private.chat_transaction_next_lot_id(position.id);
 end if;
 insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,created_at,has_commission,commission_amount,commission_known)
  values(lot_id,owner_id,position.id,side,price,quantity,executed,created,commission is not null and commission>0,coalesce(commission,0),commission is not null);
 return jsonb_build_object('applied',true,'positionId',position.id,'lotId',lot_id,'transaction',p_input,'commissionKnown',commission is not null);
end$$;

create function private.chat_transaction_dispatch(p_action text,p_id uuid,p_expected text default null,p_input jsonb default null,p_review jsonb default null,p_confirmation_hash text default null,p_confirmation_secret text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare binding jsonb:=private.chat_transaction_principal();saved private.chat_transaction_proposals%rowtype;created timestamptz;v_receipt jsonb;
begin
 if binding is null or p_id is null then raise exception using errcode='42501',message='Authenticated transaction-recording connection required';end if;
 if p_action is null or p_action not in('create','read','confirm','cancel') then raise exception using errcode='22023',message='Unknown transaction action';end if;
 perform pg_advisory_xact_lock(hashtextextended('chat-transaction-binding:'||binding::text,0));
 select * into saved from private.chat_transaction_proposals where id=p_id for update;
 if p_action='create' then
  if p_confirmation_hash is null or p_confirmation_hash!~'^[a-f0-9]{64}$' or octet_length(p_input::text)+octet_length(p_review::text)>65536 then raise exception using errcode='22023',message='Invalid transaction review';end if;
  if found then
   if saved.expected is distinct from p_expected or saved.input is distinct from p_input or saved.review is distinct from p_review or saved.confirmation_hash is distinct from p_confirmation_hash then raise exception using errcode='22023',message='Transaction request ID reused';end if;
  else
   perform private.chat_transaction_worker(p_id,p_expected,p_input,p_review,false);
   update private.chat_transaction_proposals set status='superseded' where status='pending';
   created:=clock_timestamp();
   insert into private.chat_transaction_proposals(id,owner_id,subject,session_id,client_id,grant_id,expected,input,review,confirmation_hash,created_at,expires_at)
    values(p_id,binding->>'owner_id',binding->>'subject',binding->>'session_id',binding->>'client_id',(binding->>'grant_id')::uuid,p_expected,p_input,p_review,p_confirmation_hash,created,created+interval '15 minutes') returning * into saved;
  end if;
 else
  if not found then raise exception using errcode='42501',message='Transaction review unavailable in this session';end if;
  if p_action in('confirm','cancel') then
   if p_confirmation_secret is null or length(p_confirmation_secret) not between 32 and 256 or saved.confirmation_hash is distinct from encode(sha256(convert_to(p_confirmation_secret,'UTF8')),'hex') then raise exception using errcode='42501',message='Invalid transaction confirmation';end if;
   if p_action='confirm' and saved.status='applied' then return saved.receipt;end if;
   if p_action='cancel' and saved.status='cancelled' then return jsonb_build_object('id',saved.id,'review',saved.review,'status',saved.status,'expiresAt',saved.expires_at);end if;
   if saved.status<>'pending' or saved.expires_at<=clock_timestamp() then raise exception using errcode='40001',message='Transaction review expired or replaced';end if;
   if p_action='confirm' then v_receipt:=private.chat_transaction_worker(saved.id,saved.expected,saved.input,saved.review,true);update private.chat_transaction_proposals set status='applied',receipt=v_receipt where id=p_id returning * into saved;return saved.receipt;
   else update private.chat_transaction_proposals set status='cancelled' where id=p_id returning * into saved;end if;
  end if;
 end if;
 return jsonb_build_object('id',saved.id,'review',saved.review,'status',saved.status,'expiresAt',saved.expires_at,'receipt',saved.receipt);
end$$;

grant create on schema private to livestocks_transaction_executor;
alter function private.chat_transaction_dispatch(text,uuid,text,jsonb,jsonb,text,text) owner to livestocks_transaction_executor;
-- Managed postgres can SET executor ownership without inheriting it. Revoke
-- the definer's default PUBLIC grant as its exact owner, never best-effort.
set local role livestocks_transaction_executor;
revoke all on function private.chat_transaction_dispatch(text,uuid,text,jsonb,jsonb,text,text) from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function private.chat_transaction_dispatch(text,uuid,text,jsonb,jsonb,text,text) to authenticated;
reset role;
revoke create on schema private from livestocks_transaction_executor;
revoke all on function private.chat_transaction_next_lot_id(uuid),private.chat_transaction_summary(uuid,jsonb),private.chat_transaction_worker(uuid,text,jsonb,jsonb,boolean) from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function private.chat_transaction_next_lot_id(uuid),private.chat_transaction_summary(uuid,jsonb),private.chat_transaction_worker(uuid,text,jsonb,jsonb,boolean) to livestocks_transaction_executor;
create function public.create_chat_transaction_proposal(p_id uuid,p_expected text,p_input jsonb,p_review jsonb,p_confirmation_hash text) returns jsonb language sql security invoker set search_path='' as $$select private.chat_transaction_dispatch('create',p_id,p_expected,p_input,p_review,p_confirmation_hash);$$;
create function public.read_chat_transaction_proposal(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.chat_transaction_dispatch('read',p_id);$$;
create function public.confirm_chat_transaction_proposal(p_id uuid,p_confirmation_secret text) returns jsonb language sql security invoker set search_path='' as $$select private.chat_transaction_dispatch('confirm',p_id,null,null,null,null,p_confirmation_secret);$$;
create function public.cancel_chat_transaction_proposal(p_id uuid,p_confirmation_secret text) returns jsonb language sql security invoker set search_path='' as $$select private.chat_transaction_dispatch('cancel',p_id,null,null,null,null,p_confirmation_secret);$$;
revoke all on function public.create_chat_transaction_proposal(uuid,text,jsonb,jsonb,text),public.read_chat_transaction_proposal(uuid),public.confirm_chat_transaction_proposal(uuid,text),public.cancel_chat_transaction_proposal(uuid,text) from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function public.create_chat_transaction_proposal(uuid,text,jsonb,jsonb,text),public.read_chat_transaction_proposal(uuid),public.confirm_chat_transaction_proposal(uuid,text),public.cancel_chat_transaction_proposal(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
