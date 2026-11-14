-- Better Auth 1.7.23 schema compiled by its public getMigrations API against
-- an empty disposable PostgreSQL database. No auth data is exposed to REST.
begin;
create schema livestocks_auth;
revoke all on schema livestocks_auth from public,anon,authenticated,service_role;
do $$begin
 if not exists(select 1 from pg_roles where rolname='livestocks_auth_backend') then
  create role livestocks_auth_backend login noinherit nosuperuser nobypassrls nocreatedb nocreaterole;
 elsif exists(select 1 from pg_roles where rolname='livestocks_auth_backend' and (rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolinherit)) then
  raise exception 'Unsafe existing authentication backend role';
 end if;
end$$;
-- No password is embedded/generated. Protected deployment provisioning is separate.
grant usage on schema livestocks_auth,private to livestocks_auth_backend;
set local search_path=livestocks_auth;
create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);

create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "jwks" ("id" text not null primary key, "publicKey" text not null, "privateKey" text not null, "createdAt" timestamptz not null, "expiresAt" timestamptz, "alg" text, "crv" text);

create table "oauthClient" ("id" text not null primary key, "clientId" text not null unique, "clientSecret" text, "clientDiscoveryId" text, "disabled" boolean, "skipConsent" boolean, "enableEndSession" boolean, "subjectType" text, "scopes" jsonb, "clientCredentialsScopes" jsonb, "userId" text references "user" ("id") on delete cascade, "createdAt" timestamptz, "updatedAt" timestamptz, "name" text, "uri" text, "icon" text, "contacts" jsonb, "tos" text, "policy" text, "softwareId" text, "softwareVersion" text, "softwareStatement" text, "redirectUris" jsonb not null, "postLogoutRedirectUris" jsonb, "backchannelLogoutUri" text, "backchannelLogoutSessionRequired" boolean, "tokenEndpointAuthMethod" text, "applicationType" text, "jwks" text, "jwksUri" text, "grantTypes" jsonb, "responseTypes" jsonb, "requirePKCE" boolean, "dpopBoundAccessTokens" boolean, "referenceId" text, "metadata" jsonb);

create table "oauthResource" ("id" text not null primary key, "identifier" text not null unique, "name" text not null, "accessTokenTtl" integer, "refreshTokenTtl" integer, "signingAlgorithm" text, "signingKeyId" text, "allowedScopes" jsonb, "customClaims" jsonb, "dpopBoundAccessTokensRequired" boolean, "disabled" boolean, "createdAt" timestamptz, "updatedAt" timestamptz, "policyVersion" integer, "metadata" jsonb);

create table "oauthClientResource" ("id" text not null primary key, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "resourceId" text not null references "oauthResource" ("identifier") on delete cascade, "metadata" jsonb, "createdAt" timestamptz);

create table "oauthRefreshToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "sessionId" text references "session" ("id") on delete set null, "userId" text not null references "user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "rotatedAt" timestamptz, "rotationReplayResponse" text, "rotationReplayExpiresAt" timestamptz, "authTime" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);

create table "oauthAccessToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "sessionId" text references "session" ("id") on delete set null, "userId" text references "user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "refreshId" text references "oauthRefreshToken" ("id") on delete cascade, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);

create table "oauthConsent" ("id" text not null primary key, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "userId" text references "user" ("id") on delete cascade, "referenceId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "scopes" jsonb not null, "createdAt" timestamptz not null, "updatedAt" timestamptz not null);

create table "oauthClientAssertion" ("id" text not null primary key, "expiresAt" timestamptz not null);

create table "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "session_userId_idx" on "session" ("userId");

create index "account_userId_idx" on "account" ("userId");

create index "verification_identifier_idx" on "verification" ("identifier");

create index "oauthClient_userId_idx" on "oauthClient" ("userId");

create index "oauthClientResource_clientId_idx" on "oauthClientResource" ("clientId");

create index "oauthClientResource_resourceId_idx" on "oauthClientResource" ("resourceId");

create index "oauthRefreshToken_clientId_idx" on "oauthRefreshToken" ("clientId");

create index "oauthRefreshToken_sessionId_idx" on "oauthRefreshToken" ("sessionId");

create index "oauthRefreshToken_userId_idx" on "oauthRefreshToken" ("userId");

create index "oauthRefreshToken_authorizationCodeId_idx" on "oauthRefreshToken" ("authorizationCodeId");

create index "oauthAccessToken_clientId_idx" on "oauthAccessToken" ("clientId");

create index "oauthAccessToken_sessionId_idx" on "oauthAccessToken" ("sessionId");

create index "oauthAccessToken_userId_idx" on "oauthAccessToken" ("userId");

create index "oauthAccessToken_authorizationCodeId_idx" on "oauthAccessToken" ("authorizationCodeId");

create index "oauthAccessToken_refreshId_idx" on "oauthAccessToken" ("refreshId");

create index "oauthConsent_clientId_idx" on "oauthConsent" ("clientId");

create index "oauthConsent_userId_idx" on "oauthConsent" ("userId");

create unique index "oauthClientResource_clientId_resourceId_uidx" on "oauthClientResource" ("clientId", "resourceId");
set local search_path='';
do $acl$ declare t record;begin
 for t in select tablename from pg_tables where schemaname='livestocks_auth' loop
  execute format('alter table livestocks_auth.%I enable row level security',t.tablename);
  execute format('revoke all on livestocks_auth.%I from public,anon,authenticated,service_role',t.tablename);
  execute format('grant select,insert,update,delete on livestocks_auth.%I to livestocks_auth_backend',t.tablename);
  execute format('create policy backend_only on livestocks_auth.%I to livestocks_auth_backend using(true) with check(true)',t.tablename);
 end loop;
end;$acl$;

alter table private.auth_config add column auth_provider text not null default 'auth0' check(auth_provider in('auth0','better_auth'));
-- Provider switching is explicit and all-or-none. Existing identity aliases stay
-- registered with their original issuer; email never transfers portfolio data.
do $$declare
 issuer text:=nullif(current_setting('app.better_auth_issuer',true),'');
 web_client text:=nullif(current_setting('app.better_auth_website_client_id',true),'');
 mcp_client text:=nullif(current_setting('app.better_auth_mcp_client_id',true),'');
 web_aud text:=nullif(current_setting('app.better_auth_website_audience',true),'');
 mcp_aud text:=nullif(current_setting('app.better_auth_mcp_audience',true),'');
 owner_subject text:=nullif(current_setting('app.better_auth_legacy_owner_subject',true),'');
 legacy_profile text:=nullif(current_setting('app.legacy_owner_subject',true),'');
begin
 if issuer is not null or web_client is not null or mcp_client is not null or web_aud is not null or mcp_aud is not null then
  if issuer is null or web_client is null or mcp_client is null or web_aud is null or mcp_aud is null then raise exception 'Complete reviewed Better Auth configuration required';end if;
  insert into private.auth_config(singleton,issuer,website_client_id,mcp_client_id,website_audience,mcp_audience,auth_provider)
   values(true,issuer,web_client,mcp_client,web_aud,mcp_aud,'better_auth')
   on conflict(singleton) do update set issuer=excluded.issuer,website_client_id=excluded.website_client_id,mcp_client_id=excluded.mcp_client_id,website_audience=excluded.website_audience,mcp_audience=excluded.mcp_audience,auth_provider='better_auth';
 end if;
 if owner_subject is not null then
  if issuer is null or legacy_profile is null or not exists(select 1 from public.user_profiles where id=legacy_profile and primary_pinned and merge_state='active') then
   raise exception 'Explicit verified legacy owner binding requires pinned profile and provider configuration';end if;
  insert into private.identity_profiles(issuer,subject,profile_id) values(issuer,owner_subject,legacy_profile);
 end if;
end$$;

create table private.oauth_approvals(
 id uuid primary key default gen_random_uuid(),
 user_id text not null, session_id text not null, client_id text not null,
 canonical_profile_id text not null references public.user_profiles(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 revoked_at timestamptz, check(expires_at>created_at));
-- Keep revoked approvals for audit even after the corresponding session is deleted.
create unique index oauth_approvals_live_identity_idx on private.oauth_approvals(user_id,session_id,client_id) where revoked_at is null;
create index oauth_approvals_profile_idx on private.oauth_approvals(canonical_profile_id);
alter table private.oauth_approvals enable row level security;
revoke all on private.oauth_approvals from public,anon,authenticated,livestocks_auth_backend;
grant select,insert,update on private.oauth_approvals to service_role;
create function private.approval_immutable() returns trigger language plpgsql set search_path='' as $$begin
 if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
  raise exception 'Approval identity and revocation are immutable';end if;return new;
end$$;
create trigger approval_immutable before update on private.oauth_approvals for each row execute function private.approval_immutable();

-- Only initial login/explicit consent may call ensure; refresh calls check only.
create function private.ensure_oauth_approval(p_user_id text,p_session_id text,p_client_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare cfg private.auth_config%rowtype;s livestocks_auth.session%rowtype;identity jsonb;result uuid;
begin
 select * into strict cfg from private.auth_config where singleton and auth_provider='better_auth';
 if p_client_id is null or p_client_id not in(cfg.website_client_id,cfg.mcp_client_id) then raise exception 'Unapproved client';end if;
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
create function private.check_oauth_approval(p_id uuid,p_user_id text,p_session_id text,p_client_id text) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('valid',true,'created_at',a.created_at,'expires_at',least(a.expires_at,s."expiresAt"),'auth_session_created_at',floor(extract(epoch from s."createdAt"))::bigint,'profile_id',i.profile_id)
 from private.oauth_approvals a join livestocks_auth.session s on s.id=a.session_id and s."userId"=a.user_id
 join livestocks_auth."user" u on u.id=a.user_id and u."emailVerified"
 join private.auth_config cfg on cfg.singleton and cfg.auth_provider='better_auth' and a.client_id in(cfg.website_client_id,cfg.mcp_client_id)
 join private.identity_profiles i on i.issuer=cfg.issuer and i.subject=a.user_id and i.profile_id=a.canonical_profile_id and i.state='active'
 join public.user_profiles p on p.id=i.profile_id and p.merge_state='active'
 where a.id=p_id and a.user_id=p_user_id and a.session_id=p_session_id and a.client_id=p_client_id and a.revoked_at is null
 and a.expires_at>clock_timestamp() and s."expiresAt">clock_timestamp()
 and (greatest(i.min_auth_session_created_at,p.min_auth_session_created_at)=0 or floor(extract(epoch from s."createdAt"))>greatest(i.min_auth_session_created_at,p.min_auth_session_created_at))),jsonb_build_object('valid',false));
$$;
create function private.revoke_oauth_approvals(p_user_id text,p_client_id text default null,p_session_id text default null) returns integer
language plpgsql security definer set search_path='' as $$declare n integer;begin
 if p_user_id is null or p_user_id='' then raise exception 'Exact user required';end if;
 update private.oauth_approvals set revoked_at=clock_timestamp() where user_id=p_user_id and revoked_at is null
 and (p_client_id is null or client_id=p_client_id) and (p_session_id is null or session_id=p_session_id);
 get diagnostics n=row_count;return n;
end$$;

create or replace function public.server_identity_resolve(p_issuer text,p_subject text,p_email_hash text default null,p_auth_session_created_at bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i private.identity_profiles%rowtype; p public.user_profiles%rowtype; cutoff bigint;
begin
 if not exists(select 1 from private.auth_config where singleton and issuer=p_issuer) or p_subject is null or length(p_subject) not between 1 and 255 or btrim(p_subject)<>p_subject
 or (p_email_hash is not null and p_email_hash !~ '^[a-f0-9]{64}$') then raise exception 'Invalid trusted identity registration';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_issuer||':'||p_subject,0));
 select * into i from private.identity_profiles where issuer=p_issuer and subject=p_subject;
 if not found then
  if exists(select 1 from private.auth_config where singleton and auth_provider='better_auth') and exists(select 1 from public.user_profiles where id=p_subject) then
   raise exception 'Existing profile requires an explicit verified issuer binding';end if;
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

create function private.canonical_authorized_subject(require_write boolean default false)
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


create function private.better_auth_session_valid(p_subject text,p_session_id text,p_client_id text,p_grant_id uuid default null)
returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from livestocks_auth.session s join livestocks_auth."user" u on u.id=s."userId" and u."emailVerified"
 join private.auth_config cfg on cfg.singleton and cfg.auth_provider='better_auth' and p_client_id in(cfg.website_client_id,cfg.mcp_client_id)
 left join private.identity_profiles i on i.issuer=cfg.issuer and i.subject=u.id
 left join public.user_profiles p on p.id=i.profile_id
 where s.id=p_session_id and s."userId"=p_subject and s."expiresAt">clock_timestamp()
 and ((i.subject is null and p_client_id=cfg.website_client_id and not exists(select 1 from public.user_profiles where id=p_subject))
  or (i.state='active' and p.merge_state='active' and (greatest(i.min_auth_session_created_at,p.min_auth_session_created_at)=0 or floor(extract(epoch from s."createdAt"))>greatest(i.min_auth_session_created_at,p.min_auth_session_created_at))))
 and (p_client_id=cfg.website_client_id or (private.check_oauth_approval(p_grant_id,p_subject,p_session_id,p_client_id)->>'valid')::boolean));
$$;
create function public.server_better_auth_token_valid(p_subject text,p_session_id text,p_client_id text,p_grant_id uuid default null)
returns boolean language sql security definer set search_path='' as $$
 select private.better_auth_session_valid(p_subject,p_session_id,p_client_id,p_grant_id);
$$;
create or replace function private.authorized_subject(require_write boolean default false)
returns text language plpgsql stable security definer set search_path='' as $$
declare canonical text;c jsonb:=auth.jwt();grant_id uuid;origin bigint;
begin
 canonical:=private.canonical_authorized_subject(require_write);
 if canonical is null then return null;end if;
 if not exists(select 1 from private.auth_config where singleton and auth_provider='better_auth') then return canonical;end if;
 if not exists(select 1 from private.identity_profiles i join private.auth_config cfg on cfg.singleton and i.issuer=cfg.issuer where i.subject=c->>'sub') then return null;end if;
 if jsonb_typeof(c->'sid') is distinct from 'string' or length(c->>'sid') not between 1 and 255
 or c->>'https://livestocks.app/auth_session_id' is distinct from c->>'sid'
 or jsonb_typeof(c->'https://livestocks.app/auth_session_created_at') is distinct from 'number'
 or c->>'https://livestocks.app/auth_session_created_at' !~ '^[0-9]{1,16}$' then return null;end if;
 if c ? 'https://livestocks.app/grant_id' then
  if c->>'https://livestocks.app/grant_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;
  grant_id:=(c->>'https://livestocks.app/grant_id')::uuid;
 end if;
 if not private.better_auth_session_valid(c->>'sub',c->>'sid',c->>'azp',grant_id) then return null;end if;
 select floor(extract(epoch from "createdAt"))::bigint into origin from livestocks_auth.session where id=c->>'sid' and "userId"=c->>'sub';
 if origin is distinct from (c->>'https://livestocks.app/auth_session_created_at')::bigint then return null;end if;
 return canonical;
end;
$$;
create function public.server_revoke_canonical_mcp_approvals(p_profile_id text) returns integer
language plpgsql security definer set search_path='' as $$declare n integer;begin
 perform private.lock_active_profile(p_profile_id);
 update private.oauth_approvals set revoked_at=clock_timestamp() where canonical_profile_id=p_profile_id and revoked_at is null
 and client_id=(select mcp_client_id from private.auth_config where singleton);
 get diagnostics n=row_count;return n;
end$$;

-- Freeze and durable revocation are one database transaction; token issuance
-- racing with a revoked session/grant cannot produce a token accepted by RLS.
alter function public.server_merge_freeze(uuid,bigint,text,text,text) set schema private;
alter function private.server_merge_freeze(uuid,bigint,text,text,text) rename to freeze_canonical_merge;
create function public.server_merge_freeze(p_job_id uuid,p_expected_version bigint,p_preview_hash text,p_settings_source_profile_id text,p_credential_source_profile_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 result:=private.freeze_canonical_merge(p_job_id,p_expected_version,p_preview_hash,p_settings_source_profile_id,p_credential_source_profile_id);
 if result->>'state'='completed' then return result;end if;
 update private.oauth_approvals set revoked_at=clock_timestamp() where revoked_at is null and canonical_profile_id in(result->>'primary_profile_id',result->>'secondary_profile_id');
 delete from livestocks_auth.session where "userId" in(select i.subject from private.identity_profiles i join private.auth_config cfg on cfg.singleton and cfg.auth_provider='better_auth' and i.issuer=cfg.issuer where i.profile_id in(result->>'primary_profile_id',result->>'secondary_profile_id'));
 return result;
end$$;

create or replace function public.server_mcp_connection(p_user_id text, p_action text, p_valid_after bigint default 0)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare connection private.mcp_connections%rowtype;
begin
  perform private.lock_active_profile(p_user_id);
  if p_action='disconnect' then perform public.server_revoke_canonical_mcp_approvals(p_user_id);end if;
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


revoke all on function private.approval_immutable(),private.ensure_oauth_approval(text,text,text),private.check_oauth_approval(uuid,text,text,text),private.revoke_oauth_approvals(text,text,text),private.better_auth_session_valid(text,text,text,uuid),private.canonical_authorized_subject(boolean),private.freeze_canonical_merge(uuid,bigint,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.ensure_oauth_approval(text,text,text),private.check_oauth_approval(uuid,text,text,text),private.revoke_oauth_approvals(text,text,text) to livestocks_auth_backend;
revoke all on function public.server_better_auth_token_valid(text,text,text,uuid),public.server_revoke_canonical_mcp_approvals(text),public.server_merge_freeze(uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.server_better_auth_token_valid(text,text,text,uuid),public.server_revoke_canonical_mcp_approvals(text),public.server_merge_freeze(uuid,bigint,text,text,text) to service_role;
commit;
