begin;

alter table private.auth_config add column mcp_secondary_client_id text
  check (mcp_secondary_client_id is null or (
    length(mcp_secondary_client_id)>0 and mcp_secondary_client_id=btrim(mcp_secondary_client_id)
    and mcp_secondary_client_id<>website_client_id and mcp_secondary_client_id<>mcp_client_id
  ));

-- Enable the second ChatGPT connector for the existing Better Auth deployment.
-- Other installations retain their single-client configuration.
update private.auth_config set mcp_secondary_client_id='livestocks-mcp-chatgpt-blue'
where singleton and auth_provider='better_auth'
  and mcp_client_id='livestocks-mcp-chatgpt'
  and website_client_id<>'livestocks-mcp-chatgpt-blue';

create function private.is_configured_mcp_client(p_client_id text,p_config private.auth_config)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(p_client_id=p_config.mcp_client_id
    or (p_config.auth_provider='better_auth' and p_client_id=p_config.mcp_secondary_client_id),false);
$$;
revoke all on function private.is_configured_mcp_client(text,private.auth_config)
  from public,anon,authenticated,service_role,livestocks_auth_backend,livestocks_sync_executor,livestocks_transaction_executor;

create or replace function private.ensure_oauth_approval(p_user_id text,p_session_id text,p_client_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare cfg private.auth_config%rowtype;s livestocks_auth.session%rowtype;identity jsonb;result uuid;
begin
 select * into strict cfg from private.auth_config where singleton and auth_provider='better_auth';
 if p_client_id is distinct from cfg.website_client_id and not private.is_configured_mcp_client(p_client_id,cfg) then raise exception 'Unapproved client';end if;
 select s1.* into strict s from livestocks_auth.session s1 join livestocks_auth."user" u on u.id=s1."userId"
  where s1.id=p_session_id and s1."userId"=p_user_id and s1."expiresAt">clock_timestamp() and u."emailVerified";
 identity:=public.server_identity_resolve(cfg.issuer,p_user_id,null,floor(extract(epoch from s."createdAt"))::bigint);
 if identity->>'state'<>'active' then raise exception 'Fresh active account session required';end if;
 perform private.lock_active_profile(identity->>'profile_id');
 identity:=public.server_identity_resolve(cfg.issuer,p_user_id,null,floor(extract(epoch from s."createdAt"))::bigint);
 if identity->>'state'<>'active' then raise exception 'Account changed during approval';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id||':'||p_session_id||':'||p_client_id,0));
 update private.oauth_approvals set revoked_at=clock_timestamp() where user_id=p_user_id and session_id=p_session_id and client_id=p_client_id and revoked_at is null and expires_at<=clock_timestamp();
 select id into result from private.oauth_approvals where user_id=p_user_id and session_id=p_session_id and client_id=p_client_id and revoked_at is null and expires_at>clock_timestamp();
 if found then return result;end if;
 insert into private.oauth_approvals(user_id,session_id,client_id,canonical_profile_id,expires_at)
 values(p_user_id,p_session_id,p_client_id,identity->>'profile_id',s."expiresAt") returning id into result;
 return result;
end;
$$;

create or replace function private.check_oauth_approval(p_id uuid,p_user_id text,p_session_id text,p_client_id text) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('valid',true,'created_at',a.created_at,'expires_at',least(a.expires_at,s."expiresAt"),'auth_session_created_at',floor(extract(epoch from s."createdAt"))::bigint,'profile_id',i.profile_id)
 from private.oauth_approvals a join livestocks_auth.session s on s.id=a.session_id and s."userId"=a.user_id
 join livestocks_auth."user" u on u.id=a.user_id and u."emailVerified"
 join private.auth_config cfg on cfg.singleton and cfg.auth_provider='better_auth' and (a.client_id=cfg.website_client_id or private.is_configured_mcp_client(a.client_id,cfg))
 join private.identity_profiles i on i.issuer=cfg.issuer and i.subject=a.user_id and i.profile_id=a.canonical_profile_id and i.state='active'
 join public.user_profiles p on p.id=i.profile_id and p.merge_state='active'
 where a.id=p_id and a.user_id=p_user_id and a.session_id=p_session_id and a.client_id=p_client_id and a.revoked_at is null
 and a.expires_at>clock_timestamp() and s."expiresAt">clock_timestamp()
 and (greatest(i.min_auth_session_created_at,p.min_auth_session_created_at)=0 or floor(extract(epoch from s."createdAt"))>greatest(i.min_auth_session_created_at,p.min_auth_session_created_at))),jsonb_build_object('valid',false));
$$;

create or replace function private.canonical_authorized_subject(require_write boolean default false)
returns text language plpgsql stable security definer set search_path='' as $$
declare c jsonb:=auth.jwt(); cfg private.auth_config%rowtype; identity private.identity_profiles%rowtype;
 profile public.user_profiles%rowtype; raw_subject text; canonical text; cutoff bigint:=0; scopes text[]; origin bigint;
begin
 select * into cfg from private.auth_config where singleton;
 if not found or jsonb_typeof(c) is distinct from 'object' then return null;end if;
 raw_subject:=c->>'sub';
 if jsonb_typeof(c->'sub') is distinct from 'string' or length(raw_subject) not between 1 and 255 or btrim(raw_subject)<>raw_subject
 or c->>'iss' is distinct from cfg.issuer or c->>'role' is distinct from 'authenticated'
 or c->'https://livestocks.app/email_verified' is distinct from 'true'::jsonb or jsonb_typeof(c->'scope') is distinct from 'string'
 or (c ? 'client_id' and c->>'client_id' is distinct from c->>'azp') then return null;end if;
 scopes:=string_to_array(c->>'scope',' ');
 if not scopes @> array['portfolio:read'] then return null;end if;
 select * into identity from private.identity_profiles where issuer=cfg.issuer and subject=raw_subject;
 if found then
  if identity.state<>'active' then return null;end if;
  canonical:=identity.profile_id;cutoff:=identity.min_auth_session_created_at;
 else canonical:=raw_subject;end if;
 select * into profile from public.user_profiles where id=canonical;
 if found then
  if profile.merge_state<>'active' then return null;end if;
  cutoff:=greatest(cutoff,profile.min_auth_session_created_at);
 end if;
 if cutoff>0 then
  if jsonb_typeof(c->'https://livestocks.app/auth_session_created_at') is distinct from 'number'
   or c->>'https://livestocks.app/auth_session_created_at' !~ '^[0-9]{1,16}$'
   or jsonb_typeof(c->'https://livestocks.app/auth_session_id') is distinct from 'string'
   or length(c->>'https://livestocks.app/auth_session_id') not between 1 and 255
   or jsonb_typeof(c->'iat') is distinct from 'number' or c->>'iat' !~ '^[0-9]{1,16}$' then return null;end if;
  origin:=(c->>'https://livestocks.app/auth_session_created_at')::bigint;
  if origin<=cutoff or origin>(c->>'iat')::bigint then return null;end if;
 end if;
 if c->>'azp'=cfg.website_client_id and private.has_audience(c->'aud',cfg.website_audience)
 and c->'https://livestocks.app/read_only'='false'::jsonb then
  if require_write and not scopes @> array['portfolio:write'] then return null;end if;return canonical;
 end if;
 if not require_write and private.is_configured_mcp_client(c->>'azp',cfg) and private.has_audience(c->'aud',cfg.mcp_audience)
 and c->'https://livestocks.app/read_only'='true'::jsonb and not scopes @> array['portfolio:write']
 and jsonb_typeof(c->'iat')='number' and c->>'iat' ~ '^[0-9]{1,16}$'
 and exists(select 1 from private.mcp_connections x where x.user_id=canonical and x.enabled and (c->>'iat')::bigint>x.valid_after)
 then return canonical;end if;
 return null;
end;
$$;

create or replace function private.better_auth_session_valid(p_subject text,p_session_id text,p_client_id text,p_grant_id uuid default null)
returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from livestocks_auth.session s join livestocks_auth."user" u on u.id=s."userId" and u."emailVerified"
 join private.auth_config cfg on cfg.singleton and cfg.auth_provider='better_auth' and (p_client_id=cfg.website_client_id or private.is_configured_mcp_client(p_client_id,cfg))
 left join private.identity_profiles i on i.issuer=cfg.issuer and i.subject=u.id
 left join public.user_profiles p on p.id=i.profile_id
 where s.id=p_session_id and s."userId"=p_subject and s."expiresAt">clock_timestamp()
 and ((i.subject is null and p_client_id=cfg.website_client_id and not exists(select 1 from public.user_profiles where id=p_subject))
  or (i.state='active' and p.merge_state='active' and (greatest(i.min_auth_session_created_at,p.min_auth_session_created_at)=0 or floor(extract(epoch from s."createdAt"))>greatest(i.min_auth_session_created_at,p.min_auth_session_created_at))))
 and (p_client_id=cfg.website_client_id or (private.check_oauth_approval(p_grant_id,p_subject,p_session_id,p_client_id)->>'valid')::boolean));
$$;

create or replace function public.server_revoke_canonical_mcp_approvals(p_profile_id text) returns integer
language plpgsql security definer set search_path='' as $$declare n integer;begin
 perform private.lock_active_profile(p_profile_id);
 update private.oauth_approvals a set revoked_at=clock_timestamp() from private.auth_config cfg
 where cfg.singleton and a.canonical_profile_id=p_profile_id and a.revoked_at is null
 and private.is_configured_mcp_client(a.client_id,cfg);
 get diagnostics n=row_count;return n;
end$$;

create or replace function private.chat_sync_principal() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=auth.jwt();cfg private.auth_config%rowtype;owner_id text;
begin
 select * into cfg from private.auth_config where singleton and auth_provider='better_auth';
 if not found or not private.is_configured_mcp_client(claims->>'azp',cfg)
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

create or replace function private.freeze_canonical_merge(p_job_id uuid,p_expected_version bigint,p_preview_hash text,p_settings_source_profile_id text,p_credential_source_profile_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.account_merge_jobs%rowtype;preview jsonb;cutoff bigint;
begin
 select * into strict j from private.account_merge_jobs where id=p_job_id for update;
 if j.frozen_at is not null then return private.merge_job_json(j.id);end if;
 if p_expected_version is null or j.state<>'review_ready' or j.version<>p_expected_version or j.preview_hash is distinct from p_preview_hash then raise exception 'Merge review is stale';end if;
 perform 1 from public.user_profiles where id in(j.primary_profile_id,j.secondary_profile_id) order by id for update;
 if exists(select 1 from public.user_profiles where id in(j.primary_profile_id,j.secondary_profile_id) and merge_state<>'active') then raise exception 'Account already frozen';end if;
 perform private.assert_merge_proofs(j.id);
 preview:=private.merge_preview_data(j.id);
 if preview->>'preview_hash' is distinct from p_preview_hash then raise exception 'Portfolio changed after merge preview';end if;
 if p_settings_source_profile_id not in(j.primary_profile_id,j.secondary_profile_id) or not exists(select 1 from public.settings where user_id=p_settings_source_profile_id and is_active) then raise exception 'Choose an existing active settings row';end if;
 if p_credential_source_profile_id is not null and (p_credential_source_profile_id not in(j.primary_profile_id,j.secondary_profile_id)
  or not exists(select 1 from private.user_credentials where user_id=p_credential_source_profile_id)) then raise exception 'Choose an existing credential';end if;
 if p_credential_source_profile_id is null and exists(select 1 from private.user_credentials where user_id in(j.primary_profile_id,j.secondary_profile_id)) then raise exception 'Credential selection required';end if;
 cutoff:=floor(extract(epoch from clock_timestamp()))::bigint+1;
 update public.user_profiles set merge_state='frozen' where id in(j.primary_profile_id,j.secondary_profile_id);
 update private.identity_profiles set state='blocked' where profile_id in(j.primary_profile_id,j.secondary_profile_id);
 insert into private.mcp_connections(user_id,enabled,valid_after,revoked_at) values(j.primary_profile_id,false,cutoff,now()),(j.secondary_profile_id,false,cutoff,now())
 on conflict(user_id) do update set enabled=false,valid_after=greatest(private.mcp_connections.valid_after,excluded.valid_after),revoked_at=now();
 update private.widget_tokens set revoked_at=coalesce(revoked_at,now()) where user_id in(j.primary_profile_id,j.secondary_profile_id);
 insert into private.account_merge_revocations(job_id,subject,client_id)
 select j.id,i.subject,clients.client_id from private.identity_profiles i cross join private.auth_config c
 cross join lateral(values(c.website_client_id),(c.mcp_client_id),
  (case when c.auth_provider='better_auth' then c.mcp_secondary_client_id end)) clients(client_id)
 where i.profile_id in(j.primary_profile_id,j.secondary_profile_id) and i.issuer=j.issuer and c.singleton and clients.client_id is not null;
 update private.account_merge_jobs set state='frozen',version=version+1,frozen_at=clock_timestamp(),before_manifest=private.merge_manifest(j.primary_profile_id,j.secondary_profile_id),
  settings_source_profile_id=p_settings_source_profile_id,credential_source_profile_id=p_credential_source_profile_id,
  credential_version=preview->'credential_versions'->>p_credential_source_profile_id where id=j.id;
 return private.merge_job_json(j.id);
end;
$$;

commit;
