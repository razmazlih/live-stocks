-- Canonical LiveStocks accounts. Auth0 subjects remain real, distinct identities.
-- Original position IDs are accounting ledgers: NEVER concatenate their lots.
begin;

do $$begin
 if not exists(select 1 from pg_roles where rolname='livestocks_merge_executor') then
  create role livestocks_merge_executor nologin noinherit nobypassrls;
 elsif exists(select 1 from pg_roles where rolname='livestocks_merge_executor' and (rolcanlogin or rolsuper or rolbypassrls or rolinherit)) then
  raise exception 'Unsafe existing merge executor role';
 end if;
end$$;
grant usage, create on schema private, public to livestocks_merge_executor;
grant usage on schema auth to livestocks_merge_executor;

alter table public.user_profiles
  add column merge_state text not null default 'active' check(merge_state in ('active','frozen','merged')),
  add column merged_into_profile_id text references public.user_profiles(id) on delete restrict,
  add column primary_pinned boolean not null default false,
  add column min_auth_session_created_at bigint not null default 0 check(min_auth_session_created_at>=0);
update public.user_profiles set primary_pinned=true where id=nullif(current_setting('app.legacy_owner_subject',true),'');
revoke insert on public.user_profiles from authenticated;
grant insert(id) on public.user_profiles to authenticated;

create table private.identity_profiles(
 issuer text not null, subject text not null check(length(subject) between 1 and 255),
 profile_id text not null references public.user_profiles(id) on delete restrict,
 email_hash text check(email_hash ~ '^[a-f0-9]{64}$'), state text not null default 'active' check(state in ('active','blocked')),
 min_auth_session_created_at bigint not null default 0 check(min_auth_session_created_at>=0),
 version bigint not null default 1 check(version between 1 and 9007199254740991), created_at timestamptz not null default now(), primary key(issuer,subject));
create index identity_verified_email_idx on private.identity_profiles(issuer,email_hash) where email_hash is not null;
insert into private.identity_profiles(issuer,subject,profile_id)
 select c.issuer,p.id,p.id from public.user_profiles p cross join private.auth_config c where c.singleton;

alter table public.positions add column consolidated_into_position_id uuid;
alter table public.positions add constraint positions_consolidation_owner_fkey
 foreign key(consolidated_into_position_id,user_id) references public.positions(id,user_id)
 on delete restrict deferrable initially immediate;
alter table public.positions add constraint positions_not_self_consolidated check(consolidated_into_position_id is distinct from id);
drop index public.positions_symbol_location_identity_idx;
create unique index positions_symbol_location_identity_idx on public.positions(user_id,(upper(btrim(symbol))),location)
 where consolidated_into_position_id is null;
alter table public.settings add column is_active boolean not null default true;
drop index public.settings_user_id_idx;
create unique index settings_user_id_idx on public.settings(user_id) where is_active;
alter policy owner_read on public.settings using (is_active and user_id=(select private.authorized_subject(false)));
alter policy owner_update on public.settings using (is_active and user_id=(select private.authorized_subject(true))) with check(is_active and user_id=(select private.authorized_subject(true)));
alter policy owner_delete on public.settings using (is_active and user_id=(select private.authorized_subject(true)));
alter table public.position_lots alter constraint position_lots_position_owner_fkey deferrable initially immediate;
alter table public.position_plans alter constraint position_plans_position_owner_fkey deferrable initially immediate;
alter table public.watchlist_tickers alter constraint watchlist_tickers_group_owner_fkey deferrable initially immediate;

create table private.account_merge_jobs(
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique, issuer text not null,
 actor_subject text not null, other_subject text not null,
 primary_profile_id text not null references public.user_profiles(id), secondary_profile_id text not null references public.user_profiles(id),
 state text not null default 'proofs_pending' check(state in ('proofs_pending','review_ready','frozen','prepared','revocation_pending','completed','reconcile_required','cancelled')),
 version bigint not null default 1, preview_hash text, before_manifest jsonb,
 settings_source_profile_id text, credential_source_profile_id text, credential_version text,
 frozen_at timestamptz, data_prepared_at timestamptz, completed_at timestamptz, error_code text,
 created_at timestamptz not null default now(), check(primary_profile_id<>secondary_profile_id), check(actor_subject<>other_subject));
create table private.account_merge_participants(
 job_id uuid not null references private.account_merge_jobs(id), profile_id text not null references public.user_profiles(id),
 released_at timestamptz, primary key(job_id,profile_id));
create unique index one_active_merge_per_profile on private.account_merge_participants(profile_id) where released_at is null;
create table private.account_merge_proofs(
 job_id uuid not null references private.account_merge_jobs(id), subject text not null,
 email_hash text not null check(email_hash ~ '^[a-f0-9]{64}$'), auth_time bigint not null,
 nonce_hash text not null unique check(nonce_hash ~ '^[a-f0-9]{64}$'), identity_version bigint not null,
 proved_at timestamptz not null default now(), primary key(job_id,subject));
create table private.account_merge_revocations(
 job_id uuid not null references private.account_merge_jobs(id), subject text not null, client_id text not null,
 verified_at timestamptz, primary key(job_id,subject,client_id));
create table private.account_merge_row_history(
 job_id uuid not null references private.account_merge_jobs(id), table_name text not null, row_id uuid not null,
 original_owner text not null, original_row jsonb not null, primary key(job_id,table_name,row_id));
create table private.account_merge_credential_history(
 job_id uuid not null references private.account_merge_jobs(id), source_profile_id text not null,
 original_aad_subject text not null, encrypted_value text not null, original_updated_at timestamptz not null,
 primary key(job_id,source_profile_id));

-- Effective identity and original grant-origin guard. No fallback to iat on merged accounts.
create or replace function private.authorized_subject(require_write boolean default false)
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
 if not require_write and c->>'azp'=cfg.mcp_client_id and private.has_audience(c->'aud',cfg.mcp_audience)
 and c->'https://livestocks.app/read_only'='true'::jsonb and not scopes @> array['portfolio:write']
 and jsonb_typeof(c->'iat')='number' and c->>'iat' ~ '^[0-9]{1,16}$'
 and exists(select 1 from private.mcp_connections x where x.user_id=canonical and x.enabled and (c->>'iat')::bigint>x.valid_after)
 then return canonical;end if;
 return null;
end;
$$;

create function private.lock_active_profile(p_profile_id text) returns void language plpgsql security definer set search_path='' as $$
declare status text;
begin
 select merge_state into status from public.user_profiles where id=p_profile_id for share;
 if not found or status<>'active' then raise exception using errcode='55000',message='Account is temporarily unavailable';end if;
end;
$$;
create function private.account_write_fence() returns trigger language plpgsql security invoker set search_path='' as $$
declare owner_id text; allowed text[]:=array['user_id','consolidated_into_position_id','is_active'];
begin
 if current_user='livestocks_merge_executor' then
  if tg_op<>'UPDATE' then raise exception 'Merge executor cannot insert or delete financial records';end if;
  if (to_jsonb(new)-allowed) is distinct from (to_jsonb(old)-allowed) then raise exception 'Merge executor changed financial business fields';end if;
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
 -- Recheck AFTER waiting on the shared fence: a merge may have changed aliases/cutoff.
 if current_user not in ('postgres','service_role','supabase_admin') and owner_id is distinct from private.authorized_subject(true) then
  raise exception using errcode='42501',message='Account authorization changed while waiting';end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
create or replace function private.prevent_owner_change() returns trigger language plpgsql set search_path='' as $$
begin
 if new.user_id is distinct from old.user_id and current_user<>'livestocks_merge_executor' then raise exception using errcode='42501',message='Row ownership is immutable';end if;
 return new;
end;
$$;

do $install$
declare t text;
begin
 foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'] loop
  execute format('create trigger a_account_write_fence before insert or update or delete on public.%I for each row execute function private.account_write_fence()',t);
  execute format('create or replace function public.%I() returns trigger language plpgsql as $body$ begin if current_user<>''livestocks_merge_executor'' then new.updated_at:=timezone(''utc'',now());end if;return new;end;$body$', 'set_'||t||'_updated_at');
  execute format('grant select,update on public.%I to livestocks_merge_executor',t);
  execute format('create policy merge_executor_read on public.%I for select to livestocks_merge_executor using(true)',t);
  execute format('create policy merge_executor_update on public.%I for update to livestocks_merge_executor using(true) with check(true)',t);
 end loop;
end;
$install$;
grant select,update on public.user_profiles to livestocks_merge_executor;
create policy merge_executor_profiles_read on public.user_profiles for select to livestocks_merge_executor using(true);
create policy merge_executor_profiles_update on public.user_profiles for update to livestocks_merge_executor using(true) with check(true);

-- Configured-issuer registration only. A matching email hash NEVER links accounts.
create function public.server_identity_resolve(p_issuer text,p_subject text,p_email_hash text default null,p_auth_session_created_at bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i private.identity_profiles%rowtype; p public.user_profiles%rowtype; cutoff bigint;
begin
 if not exists(select 1 from private.auth_config where singleton and issuer=p_issuer) or p_subject is null or length(p_subject) not between 1 and 255 or btrim(p_subject)<>p_subject
 or (p_email_hash is not null and p_email_hash !~ '^[a-f0-9]{64}$') then raise exception 'Invalid trusted identity registration';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_issuer||':'||p_subject,0));
 select * into i from private.identity_profiles where issuer=p_issuer and subject=p_subject;
 if not found then
  insert into public.user_profiles(id) values(p_subject) on conflict(id) do nothing;
  select * into strict p from public.user_profiles where id=p_subject;
  if p.merge_state<>'active' then raise exception 'Retired identity cannot create a new profile';end if;
  insert into private.identity_profiles(issuer,subject,profile_id,email_hash) values(p_issuer,p_subject,p_subject,p_email_hash) returning * into i;
 end if;
 select * into strict p from public.user_profiles where id=i.profile_id;
 cutoff:=greatest(i.min_auth_session_created_at,p.min_auth_session_created_at);
 if p.merge_state='active' and i.state='active' and p_email_hash is not null and (cutoff=0 or p_auth_session_created_at>cutoff) and i.email_hash is distinct from p_email_hash then
  update private.identity_profiles set email_hash=p_email_hash,version=version+1 where issuer=p_issuer and subject=p_subject returning * into i;
 end if;
 return jsonb_build_object('profile_id',i.profile_id,'raw_subject',p_subject,'state',case when i.state<>'active' or p.merge_state<>'active' then 'blocked'
  when cutoff>0 and (p_auth_session_created_at is null or p_auth_session_created_at<=cutoff) then 'reauthentication_required' else 'active' end,
  'min_auth_session_created_at',cutoff,'identity_version',i.version);
end;
$$;
create function public.server_merge_candidates(p_issuer text,p_subject text) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('subject',other.subject,'profile_id',other.profile_id) order by other.subject),'[]'::jsonb)
 from private.identity_profiles own join private.identity_profiles other on other.issuer=own.issuer and other.email_hash=own.email_hash
 where own.issuer=p_issuer and own.subject=p_subject and own.state='active' and other.state='active' and own.email_hash is not null and other.profile_id<>own.profile_id;
$$;

create function private.merge_job_json(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select (to_jsonb(j)-array['before_manifest','credential_version'])||jsonb_build_object('revocations',coalesce((select jsonb_agg(to_jsonb(r)-'job_id' order by subject,client_id) from private.account_merge_revocations r where r.job_id=j.id),'[]'::jsonb))
 from private.account_merge_jobs j where j.id=p_id;
$$;
create function private.merge_has_data(p_id text) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.positions where user_id=p_id) or exists(select 1 from public.position_plans where user_id=p_id)
 or exists(select 1 from public.watchlist_groups where user_id=p_id) or exists(select 1 from private.user_credentials where user_id=p_id)
 or exists(select 1 from public.settings where user_id=p_id and is_active and (annual_growth_rate<>0.05 or currency<>'USD' or refresh_interval<>15));
$$;
create function public.server_merge_create(p_issuer text,p_actor_subject text,p_other_subject text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.identity_profiles%rowtype;b private.identity_profiles%rowtype;j private.account_merge_jobs%rowtype;primary_id text;secondary_id text;
begin
 select * into j from private.account_merge_jobs where request_id=p_request_id;
 if found then
  if j.issuer<>p_issuer or j.actor_subject<>p_actor_subject or j.other_subject<>p_other_subject then raise exception 'Merge request ID already used';end if;
  return private.merge_job_json(j.id);
 end if;
 select * into strict a from private.identity_profiles where issuer=p_issuer and subject=p_actor_subject and state='active';
 select * into strict b from private.identity_profiles where issuer=p_issuer and subject=p_other_subject and state='active';
 if a.profile_id=b.profile_id then return jsonb_build_object('state','completed','already_merged',true,'profile_id',a.profile_id);end if;
 if a.email_hash is null or a.email_hash is distinct from b.email_hash then raise exception 'Verified identity matching required';end if;
 perform 1 from public.user_profiles where id in(a.profile_id,b.profile_id) order by id for update;
 if exists(select 1 from public.user_profiles where id in(a.profile_id,b.profile_id) and merge_state<>'active') then raise exception 'Account already unavailable';end if;
 select id into strict primary_id from public.user_profiles where id in(a.profile_id,b.profile_id)
 order by primary_pinned desc,private.merge_has_data(id) desc,created_at,id limit 1;
 secondary_id:=case when primary_id=a.profile_id then b.profile_id else a.profile_id end;
 insert into private.account_merge_jobs(request_id,issuer,actor_subject,other_subject,primary_profile_id,secondary_profile_id)
 values(p_request_id,p_issuer,p_actor_subject,p_other_subject,primary_id,secondary_id) returning * into j;
 insert into private.account_merge_participants(job_id,profile_id) values(j.id,primary_id),(j.id,secondary_id);
 return private.merge_job_json(j.id);
end;
$$;
create function public.server_merge_read(p_job_id uuid) returns jsonb language sql security definer set search_path='' as $$select private.merge_job_json(p_job_id)$$;
create function public.server_merge_proof(p_job_id uuid,p_subject text,p_email_hash text,p_auth_time bigint,p_nonce_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.account_merge_jobs%rowtype;i private.identity_profiles%rowtype;
begin
 select * into strict j from private.account_merge_jobs where id=p_job_id for update;
 if j.state not in('proofs_pending','review_ready') then raise exception 'Merge proofs are closed';end if;
 if p_subject is null or p_auth_time is null or p_nonce_hash is null or p_subject not in(j.actor_subject,j.other_subject) or p_auth_time<extract(epoch from clock_timestamp())::bigint-300 or p_auth_time>extract(epoch from clock_timestamp())::bigint+5 then raise exception 'Fresh participant authentication required';end if;
 select * into strict i from private.identity_profiles where issuer=j.issuer and subject=p_subject and state='active';
 if i.profile_id not in(j.primary_profile_id,j.secondary_profile_id) or i.email_hash is null or i.email_hash is distinct from p_email_hash then raise exception 'Identity or email changed';end if;
 insert into private.account_merge_proofs(job_id,subject,email_hash,auth_time,nonce_hash,identity_version)
 values(j.id,p_subject,p_email_hash,p_auth_time,p_nonce_hash,i.version)
 on conflict(job_id,subject) do update set email_hash=excluded.email_hash,auth_time=excluded.auth_time,nonce_hash=excluded.nonce_hash,identity_version=excluded.identity_version,proved_at=now();
 update private.account_merge_jobs set version=version+1,state='proofs_pending',preview_hash=null where id=j.id;
 return private.merge_job_json(j.id);
end;
$$;

create function public.server_bootstrap_web_account(p_issuer text,p_subject text,p_auth_session_created_at bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare identity jsonb;
begin
 identity:=public.server_identity_resolve(p_issuer,p_subject,null,p_auth_session_created_at);
 if identity->>'state'<>'active' then return identity;end if;
 perform private.lock_active_profile(identity->>'profile_id');
 identity:=public.server_identity_resolve(p_issuer,p_subject,null,p_auth_session_created_at);
 if identity->>'state'<>'active' then return identity;end if;
 insert into public.settings(user_id) values(identity->>'profile_id') on conflict(user_id) where is_active do nothing;
 return identity;
end;
$$;

create function private.merge_manifest(p_primary text,p_secondary text) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:='{}';t text;n bigint;digest text;
begin
 foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'] loop
  execute format('select count(*),encode(sha256(convert_to(coalesce(string_agg((to_jsonb(r)-array[''user_id'',''consolidated_into_position_id'',''is_active''])::text,E''\n'' order by id),''''),''UTF8'')),''hex'') from public.%I r where user_id=$1 or user_id=$2',t)
   into n,digest using p_primary,p_secondary;
  result:=result||jsonb_build_object(t,jsonb_build_object('count',n,'digest',digest));
 end loop;
 return result;
end;
$$;
create function private.merge_preview_data(p_job_id uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare j private.account_merge_jobs%rowtype;manifest jsonb;counts jsonb;duplicates jsonb;versions jsonb;hash text;
begin
 select * into strict j from private.account_merge_jobs where id=p_job_id;
 manifest:=private.merge_manifest(j.primary_profile_id,j.secondary_profile_id);
 select coalesce(jsonb_object_agg(key,value->'count'),'{}') into counts from jsonb_each(manifest);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.symbol,x.location),'[]') into duplicates from
  (select upper(btrim(symbol)) symbol,location,count(*) count,array_agg(id order by created_at,id) position_ids
   from public.positions where user_id in(j.primary_profile_id,j.secondary_profile_id) group by upper(btrim(symbol)),location having count(*)>1) x;
 select coalesce(jsonb_object_agg(user_id,encode(sha256(convert_to(encrypted_value,'UTF8')),'hex')),'{}') into versions
  from private.user_credentials where user_id in(j.primary_profile_id,j.secondary_profile_id);
 hash:=encode(sha256(convert_to(jsonb_build_object('manifest',manifest,'versions',versions,'job',j.id,'primary',j.primary_profile_id,'secondary',j.secondary_profile_id)::text,'UTF8')),'hex');
 return jsonb_build_object('job_id',j.id,'version',j.version,'preview_hash',hash,'primary_profile_id',j.primary_profile_id,'secondary_profile_id',j.secondary_profile_id,
  'counts',counts,'duplicate_positions',duplicates,'settings_conflict',(select count(*)>1 from public.settings where user_id in(j.primary_profile_id,j.secondary_profile_id) and is_active),
  'credential_conflict',(select count(*)>1 from jsonb_object_keys(versions)),'credential_versions',versions);
end;
$$;
create function private.assert_merge_proofs(p_job_id uuid) returns void language plpgsql stable set search_path='' as $$
declare j private.account_merge_jobs%rowtype;n integer;emails integer;
begin
 select * into strict j from private.account_merge_jobs where id=p_job_id;
 select count(*),count(distinct p.email_hash) into n,emails from private.account_merge_proofs p
 join private.identity_profiles i on i.issuer=j.issuer and i.subject=p.subject and i.version=p.identity_version and i.email_hash=p.email_hash
 where p.job_id=j.id and p.subject in(j.actor_subject,j.other_subject) and p.proved_at>now()-interval '10 minutes'
 and i.state='active' and i.profile_id in(j.primary_profile_id,j.secondary_profile_id);
 if n<>2 or emails<>1 then raise exception 'Two fresh independent matching-email identity proofs are required';end if;
end;
$$;
create function public.server_merge_preview(p_job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.account_merge_jobs%rowtype;preview jsonb;
begin
 select * into strict j from private.account_merge_jobs where id=p_job_id for update;
 if j.state not in('proofs_pending','review_ready') then raise exception 'Merge preview is closed';end if;
 perform private.assert_merge_proofs(j.id);
 preview:=private.merge_preview_data(j.id);
 update private.account_merge_jobs set state='review_ready',preview_hash=preview->>'preview_hash' where id=j.id;
 return preview||jsonb_build_object('state','review_ready');
end;
$$;
create function public.server_merge_freeze(p_job_id uuid,p_expected_version bigint,p_preview_hash text,p_settings_source_profile_id text,p_credential_source_profile_id text default null)
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
 cross join lateral(values(c.website_client_id),(c.mcp_client_id)) clients(client_id)
 where i.profile_id in(j.primary_profile_id,j.secondary_profile_id) and i.issuer=j.issuer and c.singleton;
 update private.account_merge_jobs set state='frozen',version=version+1,frozen_at=clock_timestamp(),before_manifest=private.merge_manifest(j.primary_profile_id,j.secondary_profile_id),
  settings_source_profile_id=p_settings_source_profile_id,credential_source_profile_id=p_credential_source_profile_id,
  credential_version=preview->'credential_versions'->>p_credential_source_profile_id where id=j.id;
 return private.merge_job_json(j.id);
end;
$$;
create function public.server_merge_secret_material(p_job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.account_merge_jobs%rowtype;value text;
begin
 select * into strict j from private.account_merge_jobs where id=p_job_id;
 if j.frozen_at is null or j.completed_at is not null then raise exception 'Frozen merge required';end if;
 select encrypted_value into value from private.user_credentials where user_id=j.credential_source_profile_id;
 return jsonb_build_object('canonical_profile_id',j.primary_profile_id,'selected_source_profile_id',j.credential_source_profile_id,
  'selected_aad_subject',j.credential_source_profile_id,'selected_ciphertext',value,'credential_version',j.credential_version);
end;
$$;

-- This is the only function that changes financial ownership. The owner is a
-- NOLOGIN, non-BYPASSRLS role with SELECT/UPDATE, never financial INSERT/DELETE.
create function public.server_merge_prepare(p_job_id uuid,p_encrypted_value text default null,p_credential_version text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.account_merge_jobs%rowtype;t text;chosen_settings uuid;expected_secret text;
begin
 select * into strict j from private.account_merge_jobs where id=p_job_id for update;
 if j.data_prepared_at is not null then return private.merge_job_json(j.id);end if;
 if j.frozen_at is null or j.state not in('frozen','reconcile_required') then raise exception 'Committed merge freeze required';end if;
 perform 1 from public.user_profiles where id in(j.primary_profile_id,j.secondary_profile_id) order by id for update;
 if exists(select 1 from public.user_profiles where id in(j.primary_profile_id,j.secondary_profile_id) and merge_state<>'frozen') then raise exception 'Both profiles must remain frozen';end if;
 if private.merge_manifest(j.primary_profile_id,j.secondary_profile_id) is distinct from j.before_manifest then raise exception 'Frozen financial baseline changed';end if;
 if j.credential_source_profile_id is not null then
  select encode(sha256(convert_to(encrypted_value,'UTF8')),'hex') into expected_secret from private.user_credentials where user_id=j.credential_source_profile_id;
  if expected_secret is distinct from j.credential_version or p_credential_version is distinct from expected_secret
   or p_encrypted_value is null or p_encrypted_value !~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then raise exception 'Credential version or reencryption missing';end if;
 elsif p_encrypted_value is not null or p_credential_version is not null then raise exception 'Unexpected credential';end if;
 foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'] loop
  execute format('insert into private.account_merge_row_history(job_id,table_name,row_id,original_owner,original_row) select $1,$2,id,user_id,to_jsonb(r) from public.%I r where user_id=$3 or user_id=$4',t)
   using j.id,t,j.primary_profile_id,j.secondary_profile_id;
 end loop;
 insert into private.account_merge_credential_history(job_id,source_profile_id,original_aad_subject,encrypted_value,original_updated_at)
 select j.id,user_id,user_id,encrypted_value,updated_at from private.user_credentials where user_id in(j.primary_profile_id,j.secondary_profile_id);
 set constraints public.positions_consolidation_owner_fkey,public.position_lots_position_owner_fkey,public.position_plans_position_owner_fkey,public.watchlist_tickers_group_owner_fkey deferred;
 -- Rank one future purchase target, while retaining every original FIFO ledger.
 with ranked as(select id,first_value(id) over(partition by upper(btrim(symbol)),location
  order by (user_id=j.primary_profile_id and consolidated_into_position_id is null) desc,(consolidated_into_position_id is null) desc,created_at,id) winner
  from public.positions where user_id in(j.primary_profile_id,j.secondary_profile_id))
 update public.positions p set consolidated_into_position_id=case when ranked.id=ranked.winner then null else ranked.winner end
 from ranked where p.id=ranked.id;
 select id into strict chosen_settings from public.settings where user_id=j.settings_source_profile_id and is_active;
 update public.settings set is_active=false where user_id in(j.primary_profile_id,j.secondary_profile_id) and id<>chosen_settings;
 foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'] loop
  execute format('update public.%I set user_id=$1 where user_id=$2',t) using j.primary_profile_id,j.secondary_profile_id;
 end loop;
 delete from private.user_credentials where user_id in(j.primary_profile_id,j.secondary_profile_id);
 if p_encrypted_value is not null then insert into private.user_credentials(user_id,encrypted_value) values(j.primary_profile_id,p_encrypted_value);end if;
 if private.merge_manifest(j.primary_profile_id,j.secondary_profile_id) is distinct from j.before_manifest then raise exception 'Lossless financial verification failed';end if;
 update private.identity_profiles set profile_id=j.primary_profile_id,state='blocked',version=version+1 where profile_id in(j.primary_profile_id,j.secondary_profile_id);
 update public.user_profiles set merge_state='merged',merged_into_profile_id=j.primary_profile_id where id=j.secondary_profile_id;
 update private.account_merge_jobs set state='revocation_pending',version=version+1,data_prepared_at=clock_timestamp() where id=j.id;
 set constraints public.positions_consolidation_owner_fkey,public.position_lots_position_owner_fkey,public.position_plans_position_owner_fkey,public.watchlist_tickers_group_owner_fkey immediate;
 return private.merge_job_json(j.id);
end;
$$;
alter function public.server_merge_prepare(uuid,text,text) owner to livestocks_merge_executor;

-- Receipt is a server-verified list: {revoked:[{subject,client_id,verified_at}]}.
-- It must cover every identity belonging to BOTH profiles, including prior aliases.
create function public.server_merge_finish(p_job_id uuid,p_revocation_receipt jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.account_merge_jobs%rowtype;cutoff bigint;
begin
 select * into strict j from private.account_merge_jobs where id=p_job_id for update;
 if j.state='completed' then return private.merge_job_json(j.id);end if;
 if j.data_prepared_at is null or j.state not in('prepared','revocation_pending','reconcile_required') then raise exception 'Prepared frozen merge required';end if;
 perform 1 from public.user_profiles where id in(j.primary_profile_id,j.secondary_profile_id) order by id for update;
 if jsonb_typeof(p_revocation_receipt->'revoked') is distinct from 'array' then raise exception 'Verified revocation receipt required';end if;
 if exists(select 1 from private.account_merge_revocations r where r.job_id=j.id and not exists(
  select 1 from jsonb_array_elements(p_revocation_receipt->'revoked') item where item->>'subject'=r.subject and item->>'client_id'=r.client_id
   and (item->>'verified_at')::timestamptz>=j.frozen_at and (item->>'verified_at')::timestamptz<=clock_timestamp()+interval '5 seconds')) then raise exception 'Revocation receipt is incomplete';end if;
 update private.account_merge_revocations set verified_at=clock_timestamp() where job_id=j.id;
 cutoff:=floor(extract(epoch from clock_timestamp()))::bigint+1;
 update public.user_profiles set merge_state='active',min_auth_session_created_at=greatest(min_auth_session_created_at,cutoff) where id=j.primary_profile_id;
 update private.identity_profiles set state='active',min_auth_session_created_at=greatest(min_auth_session_created_at,cutoff),version=version+1 where profile_id=j.primary_profile_id;
 update private.account_merge_participants set released_at=clock_timestamp() where job_id=j.id;
 update private.account_merge_jobs set state='completed',version=version+1,completed_at=clock_timestamp(),error_code=null where id=j.id;
 -- Connections and widgets deliberately remain revoked; fresh explicit reconnect required.
 return private.merge_job_json(j.id)||jsonb_build_object('profile_id',j.primary_profile_id,'min_auth_session_created_at',cutoff);
end;
$$;
create function public.server_merge_fail(p_job_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.account_merge_jobs%rowtype;
begin
 if p_reason is null or p_reason !~ '^[a-z0-9_]{1,80}$' then raise exception 'Safe error code required';end if;
 select * into strict j from private.account_merge_jobs where id=p_job_id for update;
 if j.state='completed' then return private.merge_job_json(j.id);end if;
 update private.account_merge_jobs set state=case when frozen_at is null then 'cancelled' else 'reconcile_required' end,error_code=p_reason,version=version+1 where id=j.id;
 if j.frozen_at is null then update private.account_merge_participants set released_at=clock_timestamp() where job_id=j.id;end if;
 return private.merge_job_json(j.id);
end;
$$;

-- New purchases choose one target; old request retries retain their original ledger.
create or replace function public.record_position_purchase(
  p_request_id uuid, p_symbol text, p_display text, p_image_url text,
  p_location public.position_location, p_price numeric, p_quantity numeric,
  p_executed_at date, p_has_commission boolean default false,
  p_commission_amount numeric default 0
)
returns table(position_id uuid, lot_id uuid, reused boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_owner text := private.authorized_subject(true);
  v_symbol text := upper(btrim(p_symbol));
  v_position_id uuid;
  v_reused boolean := false;
  v_existing public.position_lots%rowtype;
  v_position public.positions%rowtype;
  v_commission numeric := case when p_has_commission then p_commission_amount else 0 end;
begin
  if v_owner is null then
    raise exception using errcode = '42501', message = 'Authorized website write access is required';
  end if;
  perform private.lock_active_profile(v_owner);
  if p_request_id is null or v_symbol is null or v_symbol = ''
     or nullif(btrim(p_display), '') is null or p_location is null
     or p_price is null or round(p_price, 4) <= 0 or p_price::text in ('NaN','Infinity','-Infinity')
     or p_quantity is null or round(p_quantity, 4) <= 0 or p_quantity::text in ('NaN','Infinity','-Infinity')
     or p_executed_at is null or not isfinite(p_executed_at)
     or p_has_commission is null or v_commission is null or v_commission < 0
     or v_commission::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode = '22023', message = 'Invalid purchase details';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner || ':' || p_request_id::text, 0));
  select l.* into v_existing from public.position_lots l where l.id = p_request_id and l.user_id = v_owner;
  if found then
    select p.* into strict v_position from public.positions p
      where p.id = v_existing.position_id and p.user_id = v_owner;
    if upper(btrim(v_position.symbol)) <> v_symbol or v_position.location <> p_location
       or v_existing.side <> 'BUY' or v_existing.price <> round(p_price,4)
       or v_existing.quantity <> round(p_quantity,4) or v_existing.executed_at <> p_executed_at
       or v_existing.has_commission <> p_has_commission
       or v_existing.commission_amount <> round(v_commission,2) then
      raise exception using errcode = '22023', message = 'Purchase request ID was already used with different details';
    end if;
    return query select v_existing.position_id, v_existing.id, true;
    return;
  end if;
  insert into public.positions(user_id,symbol,display,image_url,location,entry_price,quantity,entry_date)
    values(v_owner,v_symbol,btrim(p_display),coalesce(p_image_url,''),p_location,p_price,p_quantity,p_executed_at)
    on conflict(user_id,(upper(btrim(symbol))),location) where consolidated_into_position_id is null do nothing returning id into v_position_id;
  if v_position_id is null then
    v_reused := true;
    select p.* into strict v_position from public.positions p
      where p.user_id = v_owner and upper(btrim(p.symbol)) = v_symbol and p.location = p_location and p.consolidated_into_position_id is null for update;
    v_position_id := v_position.id;
    if v_position.quantity > 0 and not exists(select 1 from public.position_lots l where l.position_id = v_position_id and l.user_id = v_owner) then
      insert into public.position_lots(user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount)
        values(v_owner,v_position_id,'BUY',v_position.entry_price,v_position.quantity,v_position.entry_date,false,0);
    end if;
  end if;
  insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount)
    values(p_request_id,v_owner,v_position_id,'BUY',p_price,p_quantity,p_executed_at,p_has_commission,v_commission);
  return query select v_position_id,p_request_id,v_reused;
end;
$$;
revoke all on function public.record_position_purchase(uuid,text,text,text,public.position_location,numeric,numeric,date,boolean,numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.record_position_purchase(uuid,text,text,text,public.position_location,numeric,numeric,date,boolean,numeric)
  to authenticated;


-- Service operations share the same profile fence as browser writes.
create or replace function public.server_get_credentials(p_user_id text)
returns text language plpgsql security invoker set search_path = '' as $$
declare result text;
begin
 perform private.lock_active_profile(p_user_id);
 select encrypted_value into result from private.user_credentials where user_id = p_user_id;
 return result;
end;
$$;
create or replace function public.server_set_credentials(p_user_id text, p_encrypted_value text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.lock_active_profile(p_user_id);
  if p_encrypted_value is null then
    delete from private.user_credentials where user_id = p_user_id;
  else
    insert into private.user_credentials(user_id, encrypted_value) values(p_user_id,p_encrypted_value)
      on conflict(user_id) do update set encrypted_value = excluded.encrypted_value, updated_at = now();
  end if;
end;
$$;

create or replace function public.server_mcp_connection(p_user_id text, p_action text, p_valid_after bigint default 0)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare connection private.mcp_connections%rowtype;
begin
  perform private.lock_active_profile(p_user_id);
  if p_valid_after is null or p_valid_after < 0 then raise exception 'Invalid connection cutoff'; end if;
  if p_action = 'get' then
    select * into connection from private.mcp_connections where user_id = p_user_id;
    if not found then return null; end if;
  elsif p_action = 'bootstrap' then
    insert into private.mcp_connections(user_id) values(p_user_id) on conflict(user_id) do nothing;
    select * into strict connection from private.mcp_connections where user_id = p_user_id for update;
    if connection.enabled and p_valid_after > connection.valid_after then
      update private.mcp_connections set last_connected_at = now() where user_id = p_user_id returning * into connection;
    end if;
  elsif p_action = 'disconnect' then
    -- Create a disabled tombstone even if the first connection has not occurred.
    insert into private.mcp_connections(user_id,enabled,valid_after,revoked_at)
      values(p_user_id,false,p_valid_after,now())
      on conflict(user_id) do update set enabled = false, revoked_at = now(),
        valid_after = greatest(private.mcp_connections.valid_after,excluded.valid_after)
      returning * into connection;
  elsif p_action = 'reconnect' then
    -- Only the explicit website action may enable an existing disabled row.
    insert into private.mcp_connections(user_id,enabled,valid_after)
      values(p_user_id,true,p_valid_after)
      on conflict(user_id) do update set enabled = true, revoked_at = null, last_connected_at = null,
        valid_after = greatest(private.mcp_connections.valid_after,excluded.valid_after)
      returning * into connection;
  else
    raise exception 'Unknown connection action';
  end if;
  return to_jsonb(connection);
end;
$$;

create or replace function public.server_widget_tokens(p_user_id text,p_action text,p_id uuid default null,p_name text default null,p_token_hash text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare widget private.widget_tokens%rowtype; result jsonb;
begin
  perform private.lock_active_profile(p_user_id);
  if p_action = 'list' then
    select coalesce(jsonb_agg(to_jsonb(t) - 'token_hash' - 'user_id' order by t.created_at desc,t.id),'[]'::jsonb)
      into result from private.widget_tokens t where t.user_id = p_user_id;
    return result;
  elsif p_action = 'create' then
    insert into private.widget_tokens(user_id,token_hash,name,expires_at)
      values(p_user_id,p_token_hash,coalesce(nullif(btrim(p_name),''),'Widget'),now() + interval '90 days')
      returning * into widget;
  elsif p_action = 'revoke' then
    update private.widget_tokens set revoked_at = now() where id = p_id and user_id = p_user_id returning * into widget;
    if not found then return null; end if;
  else
    raise exception 'Unknown widget action';
  end if;
  return to_jsonb(widget) - 'token_hash' - 'user_id';
end;
$$;

-- The widget's authorization and financial read occur within one fenced call.
-- Separate resolve-then-read operations must not be used by the HTTP handler.
create function public.server_widget_snapshot(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare widget private.widget_tokens%rowtype;result jsonb;
begin
 select * into widget from private.widget_tokens where token_hash=p_token_hash and revoked_at is null and expires_at>clock_timestamp();
 if not found then return null;end if;
 perform private.lock_active_profile(widget.user_id);
 select * into widget from private.widget_tokens where token_hash=p_token_hash and revoked_at is null and expires_at>clock_timestamp() for update;
 if not found then return null;end if;
 update private.widget_tokens set last_used_at=clock_timestamp() where id=widget.id;
 select jsonb_build_object('user_id',widget.user_id,'expires_at',widget.expires_at,
  'positions',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.positions p where p.user_id=widget.user_id),'[]'::jsonb),
  'position_lots',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.position_lots l where l.user_id=widget.user_id),'[]'::jsonb),
  'settings',(select to_jsonb(s) from public.settings s where s.user_id=widget.user_id and s.is_active),
  'encrypted_credential',(select encrypted_value from private.user_credentials where user_id=widget.user_id),
  'credential_aad_subject',widget.user_id) into result;
 return result;
end;
$$;
create or replace function public.server_resolve_widget(p_token_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 result:=public.server_widget_snapshot(p_token_hash);
 if result is null then return null;end if;
 return jsonb_build_object('user_id',result->'user_id','expires_at',result->'expires_at');
end;
$$;

-- No schema exposure, PUBLIC execution, login membership or financial DELETE
-- permission is granted to the narrowly scoped ownership-transfer role.
do $acl$
declare t text;f record;
begin
 foreach t in array array['identity_profiles','account_merge_jobs','account_merge_participants','account_merge_proofs','account_merge_revocations','account_merge_row_history','account_merge_credential_history'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on private.%I to service_role',t);
 end loop;
 foreach t in array array['identity_profiles','account_merge_jobs','account_merge_revocations','account_merge_row_history','account_merge_credential_history','user_credentials'] loop
  execute format('grant select,insert,update on private.%I to livestocks_merge_executor',t);
  execute format('create policy merge_executor_internal on private.%I to livestocks_merge_executor using(true) with check(true)',t);
 end loop;
 grant delete on private.user_credentials to livestocks_merge_executor;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='public' and (p.proname like 'server_merge_%' or p.proname in('server_identity_resolve','server_bootstrap_web_account','server_widget_snapshot')))
 loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and (p.proname like 'merge_%' or p.proname in('assert_merge_proofs','lock_active_profile','account_write_fence'))
 loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end;
$acl$;
grant execute on function private.merge_manifest(text,text),private.merge_job_json(uuid) to livestocks_merge_executor;
grant execute on function private.lock_active_profile(text) to authenticated,service_role;
revoke create on schema public,private from livestocks_merge_executor;
commit;
