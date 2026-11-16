-- Persist the exact review and rows before the inline app asks for confirmation.
-- Neither read RPC nor model-visible tool results receive the confirmation hash.
create table private.chat_sync_proposals(
 id uuid primary key,
 owner_id text not null references public.user_profiles(id) on delete restrict,
 subject text not null, session_id text not null, client_id text not null, grant_id uuid not null,
 expected text not null check(expected~'^[a-f0-9]{32}$'),
 rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows) between 1 and 100),
 review jsonb not null check(jsonb_typeof(review)='object'),
 confirmation_hash text not null check(confirmation_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 status text not null default 'pending' check(status in('pending','applied','cancelled','superseded')),
 receipt jsonb,
 check(expires_at>created_at and expires_at<=created_at+interval '15 minutes'),
 check((status='applied')=(receipt is not null))
);
alter table private.chat_sync_proposals enable row level security;
revoke all on private.chat_sync_proposals from public,anon,authenticated,service_role,livestocks_auth_backend;
grant select,insert,update on private.chat_sync_proposals to livestocks_sync_executor;
create index chat_sync_proposals_owner_session_idx on private.chat_sync_proposals(owner_id,session_id,created_at);

create function private.chat_sync_principal() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=auth.jwt();cfg private.auth_config%rowtype;owner_id text;
begin
 select * into cfg from private.auth_config where singleton and auth_provider='better_auth';
 if not found or claims->>'azp' is distinct from cfg.mcp_client_id
  or claims->'https://livestocks.app/read_only' is distinct from 'true'::jsonb
  or jsonb_typeof(claims->'scope') is distinct from 'string'
  or not string_to_array(claims->>'scope',' ') @> array['portfolio:read']
  or string_to_array(claims->>'scope',' ') @> array['portfolio:write']
  or jsonb_typeof(claims->'sub') is distinct from 'string'
  or jsonb_typeof(claims->'sid') is distinct from 'string' or length(claims->>'sid') not between 1 and 255
  or jsonb_typeof(claims->'https://livestocks.app/grant_id') is distinct from 'string'
  or claims->>'https://livestocks.app/grant_id'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then return null;end if;
 owner_id:=private.authorized_subject(false);
 if owner_id is null then return null;end if;
 return jsonb_build_object('owner_id',owner_id,'subject',claims->>'sub','session_id',claims->>'sid',
  'client_id',claims->>'azp','grant_id',claims->>'https://livestocks.app/grant_id');
end;
$$;
revoke all on function private.chat_sync_principal() from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function private.chat_sync_principal() to livestocks_sync_executor;
create policy sync_proposal_executor on private.chat_sync_proposals to livestocks_sync_executor
 using(owner_id=(private.chat_sync_principal()->>'owner_id') and subject=(private.chat_sync_principal()->>'subject')
  and session_id=(private.chat_sync_principal()->>'session_id') and client_id=(private.chat_sync_principal()->>'client_id')
  and grant_id::text=(private.chat_sync_principal()->>'grant_id'))
 with check(owner_id=(private.chat_sync_principal()->>'owner_id') and subject=(private.chat_sync_principal()->>'subject')
  and session_id=(private.chat_sync_principal()->>'session_id') and client_id=(private.chat_sync_principal()->>'client_id')
  and grant_id::text=(private.chat_sync_principal()->>'grant_id'));

create function private.chat_sync_proposal_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (to_jsonb(new)-array['status','receipt']) is distinct from (to_jsonb(old)-array['status','receipt'])
  or old.status<>'pending' or new.status not in('applied','cancelled','superseded') then
  raise exception using errcode='55000',message='Saved screenshot review is immutable';
 end if;
 return new;
end;
$$;
revoke all on function private.chat_sync_proposal_immutable() from public,anon,authenticated,service_role,livestocks_auth_backend;
create trigger chat_sync_proposal_immutable before update on private.chat_sync_proposals
 for each row execute function private.chat_sync_proposal_immutable();

-- One fixed dispatcher keeps every action behind the same verified binding.
-- Only the confirm action can enter the isolated financial checkpoint worker.
create function private.chat_sync_dispatch(p_action text,p_id uuid,p_expected text default null,p_rows jsonb default null,
 p_review jsonb default null,p_confirmation_hash text default null,p_confirmation_secret text default null,p_previous_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare binding jsonb:=private.chat_sync_principal();saved private.chat_sync_proposals%rowtype;
 previous private.chat_sync_proposals%rowtype;result jsonb;created timestamptz;
begin
 if binding is null or p_id is null then raise exception using errcode='42501',message='Authenticated MCP session required';end if;
 if p_action is null or p_action not in('create','read','cancel','confirm','supersede') then raise exception using errcode='22023',message='Unknown screenshot review action';end if;
 if p_action='create' then
  if p_expected is null or p_expected!~'^[a-f0-9]{32}$' or jsonb_typeof(p_rows) is distinct from 'array'
   or jsonb_array_length(p_rows) not between 1 and 100 or jsonb_typeof(p_review) is distinct from 'object'
   or octet_length(p_rows::text)+octet_length(p_review::text)>524288
   or p_confirmation_hash is null or p_confirmation_hash!~'^[a-f0-9]{64}$'
  then raise exception using errcode='22023',message='Invalid screenshot review';end if;
  -- The displayed proposal is the exact financial operation that will execute.
  if p_review#>'{plan,canApply}' is distinct from 'true'::jsonb
   or p_review#>'{plan,location}' is distinct from p_review#>'{input,location}'
   or p_review#>'{plan,observedAt}' is distinct from p_review#>'{input,observedAt}'
   or jsonb_typeof(p_review#>'{plan,changes}') is distinct from 'array'
   or jsonb_typeof(p_review#>'{plan,blocked}') is distinct from 'array'
   or jsonb_array_length(p_review#>'{plan,blocked}')<>0
   or jsonb_array_length(p_review#>'{plan,changes}')<>jsonb_array_length(p_rows)
   or exists(select 1 from jsonb_array_elements(p_rows) r where
    r->'location' is distinct from p_review#>'{input,location}'
    or r->'observedAt' is distinct from p_review#>'{input,observedAt}'
    or (select count(*) from jsonb_array_elements(p_review#>'{plan,changes}') c
     where c->'symbol'=r->'symbol' and c->'quantity'=r->'quantity'
      and c->'averageCostUsd'=r->'averageCostUsd'
      and coalesce(c->'acquiredOn','null'::jsonb)=coalesce(r->'acquiredOn','null'::jsonb)
      and coalesce(c->'estimatedAcquiredOn','null'::jsonb)=coalesce(r->'estimatedAcquiredOn','null'::jsonb))<>1)
  then raise exception using errcode='22023',message='Displayed screenshot review does not match proposed rows';end if;
  -- Serialize creation retries and supersession before a new row is visible.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into saved from private.chat_sync_proposals where id=p_id for update;
  if found then
   if saved.expected is distinct from p_expected or saved.rows is distinct from p_rows
    or saved.review is distinct from p_review or saved.confirmation_hash is distinct from p_confirmation_hash then
    raise exception using errcode='22023',message='Review request ID was reused';end if;
  else
   if p_previous_id is not null then
    if p_previous_id=p_id then raise exception using errcode='22023',message='Invalid previous review';end if;
    select * into previous from private.chat_sync_proposals where id=p_previous_id for update;
    if not found or previous.status<>'pending' or previous.expires_at<=clock_timestamp() then
     raise exception using errcode='40001',message='Previous review cannot be revised';end if;
    update private.chat_sync_proposals set status='superseded' where id=p_previous_id;
   end if;
   created:=clock_timestamp();
   insert into private.chat_sync_proposals(id,owner_id,subject,session_id,client_id,grant_id,expected,rows,review,confirmation_hash,created_at,expires_at)
   values(p_id,binding->>'owner_id',binding->>'subject',binding->>'session_id',binding->>'client_id',(binding->>'grant_id')::uuid,
    p_expected,p_rows,p_review,p_confirmation_hash,created,created+interval '15 minutes') returning * into saved;
  end if;
 else
  select * into saved from private.chat_sync_proposals where id=p_id for update;
  if not found then raise exception using errcode='42501',message='Screenshot review is unavailable for this session';end if;
  if p_action='supersede' and saved.status='pending' then
   -- A parsed correction that is blocked or becomes a no-op still invalidates
   -- the old card. Applied/cancelled/superseded receipts remain untouched.
   update private.chat_sync_proposals set status='superseded' where id=p_id returning * into saved;
  end if;
  if p_action in('confirm','cancel') then
   if p_confirmation_secret is null or length(p_confirmation_secret) not between 32 and 256
    or saved.confirmation_hash is distinct from encode(sha256(convert_to(p_confirmation_secret,'UTF8')),'hex') then
    raise exception using errcode='42501',message='Screenshot confirmation is invalid';end if;
   if p_action='confirm' and private.sync_authorized_subject() is distinct from saved.owner_id then
    raise exception using errcode='42501',message='Reconnect with portfolio:sync permission';end if;
   if p_action='confirm' and saved.status='applied' then
    return saved.receipt;
   end if;
   if p_action='cancel' and saved.status='cancelled' then
    return jsonb_build_object('id',saved.id,'review',saved.review,'status',saved.status,'expiresAt',saved.expires_at,'receipt',saved.receipt);
   end if;
   if saved.status<>'pending' or saved.expires_at<=clock_timestamp() then
    raise exception using errcode='40001',message='Screenshot review expired or is no longer pending';end if;
   if p_action='confirm' then
    result:=private.apply_chat_screenshot_sync(saved.expected,saved.rows);
    update private.chat_sync_proposals set status='applied',receipt=result where id=p_id returning * into saved;
    return saved.receipt;
   else
    update private.chat_sync_proposals set status='cancelled' where id=p_id returning * into saved;
   end if;
  end if;
 end if;
 return jsonb_build_object('id',saved.id,'review',saved.review,'status',saved.status,'expiresAt',saved.expires_at,'receipt',saved.receipt);
end;
$$;
grant create on schema private to livestocks_sync_executor;
alter function private.chat_sync_dispatch(text,uuid,text,jsonb,jsonb,text,text,uuid) owner to livestocks_sync_executor;
revoke create on schema private from livestocks_sync_executor;
revoke all on function private.chat_sync_dispatch(text,uuid,text,jsonb,jsonb,text,text,uuid) from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function private.chat_sync_dispatch(text,uuid,text,jsonb,jsonb,text,text,uuid) to authenticated;

create function public.create_chat_sync_proposal(p_id uuid,p_expected text,p_rows jsonb,p_review jsonb,p_confirmation_hash text,p_previous_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.chat_sync_dispatch('create',p_id,p_expected,p_rows,p_review,p_confirmation_hash,null,p_previous_id);
$$;
create function public.read_chat_sync_proposal(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.chat_sync_dispatch('read',p_id);$$;
create function public.cancel_chat_sync_proposal(p_id uuid,p_confirmation_secret text) returns jsonb
language sql security invoker set search_path='' as $$select private.chat_sync_dispatch('cancel',p_id,null,null,null,null,p_confirmation_secret);$$;
create function public.confirm_chat_sync_proposal(p_id uuid,p_confirmation_secret text) returns jsonb
language sql security invoker set search_path='' as $$select private.chat_sync_dispatch('confirm',p_id,null,null,null,null,p_confirmation_secret);$$;
create function public.supersede_chat_sync_proposal(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.chat_sync_dispatch('supersede',p_id);$$;
revoke all on function public.create_chat_sync_proposal(uuid,text,jsonb,jsonb,text,uuid),public.read_chat_sync_proposal(uuid),
 public.cancel_chat_sync_proposal(uuid,text),public.confirm_chat_sync_proposal(uuid,text),public.supersede_chat_sync_proposal(uuid)
 from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function public.create_chat_sync_proposal(uuid,text,jsonb,jsonb,text,uuid),public.read_chat_sync_proposal(uuid),
 public.cancel_chat_sync_proposal(uuid,text),public.confirm_chat_sync_proposal(uuid,text),public.supersede_chat_sync_proposal(uuid) to authenticated;

-- Confirm is the sole financial entry from a user's ordinary MCP role.
revoke all on function public.apply_chat_screenshot_sync(text,jsonb),private.apply_chat_screenshot_sync(text,jsonb)
 from public,anon,authenticated,service_role,livestocks_auth_backend;
