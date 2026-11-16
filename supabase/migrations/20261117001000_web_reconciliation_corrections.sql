-- Let an authenticated owner correct old plugin balance checkpoints explicitly
-- in the website. This does not infer executions or alter existing records.
create or replace function private.immutable_reconciliation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.side='RECONCILE' or (tg_op='UPDATE' and new.side='RECONCILE') then
  if tg_op='UPDATE' and current_user='livestocks_merge_executor'
   and (to_jsonb(new)-array['user_id','updated_at'])=(to_jsonb(old)-array['user_id','updated_at']) then return new;end if;
  if current_user='authenticated' and old.user_id=private.authorized_subject(true) then
   if tg_op='DELETE' then return old;end if;
   if old.side='RECONCILE' and new.side in('BUY','SELL')
    and new.position_id=old.position_id and new.user_id=old.user_id and new.id=old.id and new.created_at=old.created_at
    and new.quantity>0 and new.price>0 and new.executed_at<=timezone('Asia/Jerusalem',now())::date
    and new.basis_acquired_on is null and new.basis_date_estimate is null and new.commission_known
   then return new;end if;
  end if;
  raise exception using errcode='55000',message='Only the website owner may delete a checkpoint or replace it with a fully specified actual transaction';
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;

-- The existing ownership fence and RLS run first. Validate the resulting full
-- FIFO timeline atomically; a correction cannot leave an unmatched sale.
create function private.validate_web_ledger_correction() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.positions where id=old.position_id) then return null;end if;
 if current_setting('role',true)='authenticated' and old.user_id=private.authorized_subject(true) then
  perform private.lock_active_profile(old.user_id);
  if not exists(select 1 from public.position_lots where position_id=old.position_id) then
   -- Otherwise mapPositionRow would resurrect the old legacy opening quantity.
   update public.positions set quantity=0 where id=old.position_id and user_id=old.user_id;
  elsif old.side='RECONCILE' then
   perform private.chat_transaction_summary(old.position_id);
  end if;
 end if;
 return null;
end;
$$;
revoke all on function private.validate_web_ledger_correction() from public,anon,authenticated,service_role;
create trigger z_validate_web_ledger_correction after update or delete on public.position_lots
for each row execute function private.validate_web_ledger_correction();
