-- Recover a lost creation acknowledgement without stranding either participant.
-- These wrappers do not transfer ownership or alter any financial table.
begin;
create function public.server_merge_create_guarded(
 p_issuer text,p_actor_subject text,p_other_subject text,p_request_id uuid,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare j private.account_merge_jobs%rowtype;
begin
 if p_request_id is null or p_expires_at is null or not exists(select 1 from private.auth_config where singleton and issuer=p_issuer) then
  raise exception 'Invalid merge creation intent';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('livestocks:merge-request:'||p_request_id::text,0));
 select * into j from private.account_merge_jobs where request_id=p_request_id;
 if found then
  if j.issuer is distinct from p_issuer or j.actor_subject is distinct from p_actor_subject or j.other_subject is distinct from p_other_subject then
   raise exception 'Merge request binding mismatch';
  end if;
  return private.merge_job_json(j.id);
 end if;
 -- Once an absent request is proved expired, a delayed old network request cannot create it later.
 if p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '24 hours 5 minutes' then
  raise exception 'Expired or invalid merge creation intent';
 end if;
 return public.server_merge_create(p_issuer,p_actor_subject,p_other_subject,p_request_id);
end$$;
create function public.server_merge_lookup_guarded(
 p_issuer text,p_actor_subject text,p_other_subject text,p_request_id uuid,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare j private.account_merge_jobs%rowtype; result jsonb;
begin
 if p_request_id is null or p_expires_at is null or not exists(select 1 from private.auth_config where singleton and issuer=p_issuer) then
  raise exception 'Invalid merge creation intent';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('livestocks:merge-request:'||p_request_id::text,0));
 select * into j from private.account_merge_jobs where request_id=p_request_id;
 if found then
  if j.issuer is distinct from p_issuer or j.actor_subject is distinct from p_actor_subject or j.other_subject is distinct from p_other_subject then
   raise exception 'Merge request binding mismatch';
  end if;
  result:=private.merge_job_json(j.id);
 end if;
 return jsonb_build_object('job',result,'expired',p_expires_at<=clock_timestamp());
end$$;
revoke all on function public.server_merge_create_guarded(text,text,text,uuid,timestamptz),public.server_merge_lookup_guarded(text,text,text,uuid,timestamptz)
 from public,anon,authenticated,livestocks_auth_backend;
grant execute on function public.server_merge_create_guarded(text,text,text,uuid,timestamptz),public.server_merge_lookup_guarded(text,text,text,uuid,timestamptz) to service_role;
commit;
