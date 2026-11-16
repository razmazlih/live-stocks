-- A replacement must not depend on the model remembering previousProposalId.
-- Preserve terminal receipts and financial history; retire only pending cards.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table private.chat_sync_proposals in share row exclusive mode;
with ranked as (
 select id,row_number() over(partition by owner_id,subject,session_id,client_id,grant_id order by created_at desc,id desc) as rank
 from private.chat_sync_proposals where status='pending'
)
update private.chat_sync_proposals p set status='superseded' from ranked r where p.id=r.id and r.rank>1;
create unique index chat_sync_one_pending_binding_idx
 on private.chat_sync_proposals(owner_id,subject,session_id,client_id,grant_id) where status='pending';

-- Keep the reviewed validator/confirmation implementation, but remove every
-- ordinary caller's route around the new binding-level serialization wrapper.
-- Managed postgres has SET membership without inherited executor ownership.
-- Act as the exact owner so ALTER/REVOKE cannot fail or merely warn and leave
-- an inherited PUBLIC grant on the raw checkpoint worker or renamed helper.
grant create on schema private to livestocks_sync_executor;
set local role livestocks_sync_executor;
alter function private.chat_sync_dispatch(text,uuid,text,jsonb,jsonb,text,text,uuid) rename to chat_sync_dispatch_saved;
revoke all on function private.chat_sync_dispatch_saved(text,uuid,text,jsonb,jsonb,text,text,uuid)
 from public,anon,authenticated,service_role,livestocks_auth_backend;
revoke all on function private.apply_chat_screenshot_sync(text,jsonb)
 from public,anon,authenticated,service_role,livestocks_auth_backend;
reset role;

create function private.chat_sync_dispatch(p_action text,p_id uuid,p_expected text default null,p_rows jsonb default null,
 p_review jsonb default null,p_confirmation_hash text default null,p_confirmation_secret text default null,p_previous_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare binding jsonb:=private.chat_sync_principal();saved private.chat_sync_proposals%rowtype;changed integer;
begin
 if binding is null then raise exception using errcode='42501',message='Authenticated MCP session required';end if;
 -- Create, invalidate and confirm share one lock. A confirm either finishes
 -- before replacement, or observes the old card already superseded afterward.
 perform pg_advisory_xact_lock(hashtextextended('chat-sync-binding:'||binding::text,0));
 if p_action='supersede_pending' then
  if private.sync_authorized_subject() is distinct from binding->>'owner_id' then
   raise exception using errcode='42501',message='Reconnect with portfolio:sync permission';end if;
  if p_previous_id is not null then
   select * into saved from private.chat_sync_proposals where id=p_previous_id for update;
   if not found then raise exception using errcode='42501',message='Screenshot review is unavailable for this session';end if;
   -- Retrying an old terminal request cannot invalidate a newer pending card.
   if saved.status<>'pending' then return jsonb_build_object('superseded',0);end if;
  end if;
  update private.chat_sync_proposals set status='superseded' where status='pending';
  get diagnostics changed=row_count;
  return jsonb_build_object('superseded',changed);
 end if;
 if p_action='create' then
  select * into saved from private.chat_sync_proposals where id=p_id for update;
  if found then
   -- The existing implementation verifies that a reused UUID has identical
   -- rows/review/hash and returns its original expiry/status/receipt unchanged.
   return private.chat_sync_dispatch_saved(p_action,p_id,p_expected,p_rows,p_review,p_confirmation_hash,p_confirmation_secret,p_previous_id);
  end if;
  if p_previous_id is not null then
   if p_previous_id=p_id then raise exception using errcode='22023',message='Invalid previous review';end if;
   select * into saved from private.chat_sync_proposals where id=p_previous_id for update;
   if not found or saved.status<>'pending' or saved.expires_at<=clock_timestamp() then
    raise exception using errcode='40001',message='Previous review cannot be revised';end if;
  end if;
  -- RLS restricts this statement to the exact verified binding. If validation
  -- or insertion fails, the transaction restores every previous pending card.
  update private.chat_sync_proposals set status='superseded' where status='pending';
  return private.chat_sync_dispatch_saved(p_action,p_id,p_expected,p_rows,p_review,p_confirmation_hash,p_confirmation_secret,null);
 end if;
 return private.chat_sync_dispatch_saved(p_action,p_id,p_expected,p_rows,p_review,p_confirmation_hash,p_confirmation_secret,p_previous_id);
end;
$$;
grant create on schema private to livestocks_sync_executor;
alter function private.chat_sync_dispatch(text,uuid,text,jsonb,jsonb,text,text,uuid) owner to livestocks_sync_executor;
set local role livestocks_sync_executor;
revoke all on function private.chat_sync_dispatch(text,uuid,text,jsonb,jsonb,text,text,uuid)
 from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function private.chat_sync_dispatch(text,uuid,text,jsonb,jsonb,text,text,uuid) to authenticated;
reset role;
revoke create on schema private from livestocks_sync_executor;

-- Replace all wrappers explicitly so cached dependencies cannot retain the
-- renamed implementation's OID and bypass the new serialization boundary.
create or replace function public.create_chat_sync_proposal(p_id uuid,p_expected text,p_rows jsonb,p_review jsonb,p_confirmation_hash text,p_previous_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select private.chat_sync_dispatch('create',p_id,p_expected,p_rows,p_review,p_confirmation_hash,null,p_previous_id);$$;
create or replace function public.read_chat_sync_proposal(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.chat_sync_dispatch('read',p_id);$$;
create or replace function public.cancel_chat_sync_proposal(p_id uuid,p_confirmation_secret text) returns jsonb
language sql security invoker set search_path='' as $$select private.chat_sync_dispatch('cancel',p_id,null,null,null,null,p_confirmation_secret);$$;
create or replace function public.confirm_chat_sync_proposal(p_id uuid,p_confirmation_secret text) returns jsonb
language sql security invoker set search_path='' as $$select private.chat_sync_dispatch('confirm',p_id,null,null,null,null,p_confirmation_secret);$$;
create or replace function public.supersede_chat_sync_proposal(p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.chat_sync_dispatch('supersede',p_id);$$;
create function public.supersede_pending_chat_sync_proposals(p_previous_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select private.chat_sync_dispatch('supersede_pending',null,null,null,null,null,null,p_previous_id);$$;
revoke all on function public.supersede_pending_chat_sync_proposals(uuid)
 from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function public.supersede_pending_chat_sync_proposals(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
