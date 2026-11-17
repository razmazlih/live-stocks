begin;
-- Keep legacy unknown-fee records untouched. New ChatGPT trades must carry the
-- same explicit commission/no-commission choice as the website, so recording a
-- new trade cannot silently make net profit and forecasts unavailable.
alter function private.chat_transaction_worker(uuid,text,jsonb,jsonb,boolean)
  rename to chat_transaction_worker_with_legacy_fee_validation;

create function private.chat_transaction_worker(p_id uuid,p_expected text,p_input jsonb,p_review jsonb,p_apply boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if jsonb_typeof(p_input->'commissionUsd') is distinct from 'number' then
    raise exception using errcode='22023',
      message='Provide the actual commission in USD, or explicitly confirm no commission (0), before recording this transaction';
  end if;
  return private.chat_transaction_worker_with_legacy_fee_validation(p_id,p_expected,p_input,p_review,p_apply);
end$$;
revoke all on function private.chat_transaction_worker(uuid,text,jsonb,jsonb,boolean)
  from public,anon,authenticated,service_role,livestocks_auth_backend;
grant execute on function private.chat_transaction_worker(uuid,text,jsonb,jsonb,boolean)
  to livestocks_transaction_executor;
-- The renamed implementation retains its original restricted executor grant.
-- Both proposal preparation and confirmation dispatch through the new guard.
notify pgrst,'reload schema';
commit;
