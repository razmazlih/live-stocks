-- Stop balance-only screenshot imports. Actual executions continue through the
-- separately consented ordinary BUY/SELL ledger. Existing financial rows and
-- historical review receipts are preserved, never guessed or rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Retain the existing owner/session validation and cancellation implementation
-- behind a wrapper that rejects both new drafts and old confirmation cards.
-- The raw implementation is not executable by ordinary caller roles.
grant create on schema private to livestocks_sync_executor;
set local role livestocks_sync_executor;
alter function private.chat_sync_dispatch(text,uuid,text,jsonb,jsonb,text,text,uuid)
 rename to chat_sync_dispatch_retired_legacy;
revoke all on function private.chat_sync_dispatch_retired_legacy(text,uuid,text,jsonb,jsonb,text,text,uuid)
 from public,anon,authenticated,service_role,livestocks_auth_backend;
create function private.chat_sync_dispatch(p_action text,p_id uuid,p_expected text default null,p_rows jsonb default null,
 p_review jsonb default null,p_confirmation_hash text default null,p_confirmation_secret text default null,p_previous_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_action in ('create','confirm') then
  raise exception using errcode='0A000',message='Screenshot balance reconciliation is retired; record confirmed ordinary BUY/SELL executions with actual date, price, quantity and commission';
 end if;
 return private.chat_sync_dispatch_retired_legacy(p_action,p_id,p_expected,p_rows,p_review,p_confirmation_hash,p_confirmation_secret,p_previous_id);
end;
$$;
revoke all on function private.chat_sync_dispatch(text,uuid,text,jsonb,jsonb,text,text,uuid)
 from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function private.chat_sync_dispatch(text,uuid,text,jsonb,jsonb,text,text,uuid) to authenticated;
reset role;
revoke create on schema private from livestocks_sync_executor;

-- Rebind every public wrapper: a cached dependency must not retain the renamed
-- implementation's OID and bypass the new retirement guard.
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
create or replace function public.supersede_pending_chat_sync_proposals(p_previous_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select private.chat_sync_dispatch('supersede_pending',null,null,null,null,null,null,p_previous_id);$$;

-- Block website links and older/raw chat wrappers at their shared financial
-- boundary as well. SECURITY INVOKER plus empty search_path grants no new access.
create or replace function public.apply_screenshot_sync(p_expected text,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 raise exception using errcode='0A000',message='Screenshot balance reconciliation is retired; record confirmed ordinary BUY/SELL executions with actual date, price, quantity and commission';
end;
$$;
revoke all on function public.apply_screenshot_sync(text,jsonb)
 from public,anon,authenticated,service_role,livestocks_auth_backend,livestocks_sync_executor;
notify pgrst,'reload schema';
commit;
