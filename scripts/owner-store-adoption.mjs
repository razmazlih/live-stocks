/** Pure SQL generation and receipt verification. Never connects to a database. */
import { createHash } from 'node:crypto';
import { jwtVerify } from 'jose';
export const AUTH_SOURCE_SHA256='bec5796f998d5ba541ce6333319bb0b2544975bc3eb66115d652b8487cf6935e';
export const PROJECT='osvwctooasdxsztatirz';
export const CONFIRMATION_ISSUER='http://localhost:3109/api/auth';
export const CONFIRMATION_AUDIENCE='livestocks:legacy-owner-confirmation:v1';
export const AUTH_TABLES=['user','session','account','verification','jwks','oauthClient','oauthResource','oauthClientResource','oauthRefreshToken','oauthAccessToken','oauthConsent','oauthClientAssertion','rateLimit'];
const finances=['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'];
const quoted=value=>`'${String(value).replaceAll("'","''")}'`;
const check=(value,message)=>{if(!value)throw new Error(message);};
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function authPrefix(source){
 check(sha256(source)===AUTH_SOURCE_SHA256,'Auth migration differs from reviewed source');
 const start=source.indexOf('create schema livestocks_auth;');
 const end=source.indexOf('\nalter table private.auth_config add column auth_provider');
 check(start>0&&end>start,'Reviewed auth prefix boundary changed');
 return source.slice(start,end);
}
export function removeVerifiedAuthPrefix(source){const prefix=authPrefix(source);return source.replace(prefix,'-- Exact preprovisioned auth prefix adopted after catalog/ACL/owner verification.\n');}

// No data values or physical OIDs enter this catalog snapshot. The marker is
// written only immediately after creating a previously absent reviewed schema.
export function authCatalogSql(){return `select jsonb_build_object(
 'schema',(select jsonb_build_object('owner',pg_get_userbyid(n.nspowner),'acl',(select jsonb_agg(jsonb_build_array(case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) order by a.grantee,a.privilege_type) from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a)) from pg_namespace n where n.nspname='livestocks_auth'),
 'relations',(select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'persistence',c.relpersistence,'options',c.reloptions,
  'acl',(select jsonb_agg(jsonb_build_array(case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) order by a.grantee,a.privilege_type) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),
  'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'collation',a.attcollation::regcollation::text,'acl',a.attacl::text) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
  'constraints',(select jsonb_agg(jsonb_build_array(x.conname,x.contype,pg_get_constraintdef(x.oid,true),x.convalidated,x.condeferrable,x.condeferred) order by x.conname) from pg_constraint x where x.conrelid=c.oid),
  'indexes',(select jsonb_agg(jsonb_build_array(i.relname,pg_get_indexdef(x.indexrelid),x.indisvalid,x.indisready) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid),
  'policies',(select jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',(select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by r) from unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=c.oid),
  'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid,true),t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
  'rules',(select jsonb_agg(jsonb_build_array(r.rulename,pg_get_ruledef(r.oid,true)) order by r.rulename) from pg_rewrite r where r.ev_class=c.oid)) order by c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='livestocks_auth' and c.relkind not in('i','I','t')),
 'functions',(select coalesce(jsonb_agg(pg_get_functiondef(p.oid) order by p.proname,p.oid),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='livestocks_auth'),
 'types',(select coalesce(jsonb_agg(jsonb_build_array(t.typname,t.typtype,t.typnotnull,format_type(t.typbasetype,t.typtypmod),t.typdefault) order by t.typname),'[]'::jsonb) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='livestocks_auth'),
 'defaults',(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),d.defaclobjtype,d.defaclacl::text) order by d.defaclrole,d.defaclobjtype),'[]'::jsonb) from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='livestocks_auth'),
 'role',(select jsonb_build_object('login',rolcanlogin,'inherit',rolinherit,'super',rolsuper,'bypassRls',rolbypassrls,'createDb',rolcreatedb,'createRole',rolcreaterole,'replication',rolreplication,'connectionLimit',rolconnlimit,'validUntil',rolvaliduntil,'config',rolconfig) from pg_roles where rolname='livestocks_auth_backend'),
 'memberships',(select coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(m.roleid),pg_get_userbyid(m.member),m.admin_option) order by m.roleid,m.member),'[]'::jsonb) from pg_auth_members m where m.roleid=(select oid from pg_roles where rolname='livestocks_auth_backend') or m.member=(select oid from pg_roles where rolname='livestocks_auth_backend'))
)`;}
export function authRoleBoundarySql(){return `do $auth_boundary$ declare t text;begin
 if not exists(select 1 from pg_roles where rolname='livestocks_auth_backend' and rolcanlogin and not rolsuper and not rolinherit and not rolbypassrls and not rolcreatedb and not rolcreaterole and not rolreplication)
 or exists(select 1 from pg_auth_members where member=(select oid from pg_roles where rolname='livestocks_auth_backend')) then raise exception 'Auth backend role is not isolated';end if;
 foreach t in array array[${finances.map(quoted).join(',')}] loop
  if has_table_privilege('livestocks_auth_backend','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('livestocks_auth_backend','public.'||t,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Auth backend inherits financial access';end if;
 end loop;
 if has_schema_privilege('livestocks_auth_backend','public','CREATE') or has_schema_privilege('livestocks_auth_backend','private','CREATE') or has_schema_privilege('livestocks_auth_backend','livestocks_auth','CREATE') then raise exception 'Auth backend can create objects outside its role';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prosecdef and has_schema_privilege('livestocks_auth_backend',n.oid,'USAGE') and has_function_privilege('livestocks_auth_backend',p.oid,'EXECUTE')) then raise exception 'Auth backend inherits legacy definer execution';end if;
end;$auth_boundary$;`;}
export function preprovisionAuthSql(source,{backendPassword}={}){
 const prefix=authPrefix(source);
 if(backendPassword!==undefined)check(typeof backendPassword==='string'&&backendPassword.length>=24&&!backendPassword.includes('\0'),'Strong explicit backend credential required');
 return `-- AUTH STORE ONLY. No financial rows, tables, policies or RPC ACLs are changed.
-- Exact project ${PROJECT}; final execution must use the checked TLS connection.
set standard_conforming_strings=on;
begin read write;
set local search_path='';set local lock_timeout='30s';set local statement_timeout='60s';
select pg_advisory_xact_lock(73412311661002);
do $$begin
 if to_regnamespace('livestocks_auth') is not null or to_regclass('public.user_profiles') is not null or to_regclass('private.owner_store_provision') is not null
 or exists(select 1 from pg_roles where rolname='livestocks_auth_backend') then raise exception 'Unexpected pre-existing auth store or role; explicit review required';end if;
end$$;
create schema if not exists private;
${prefix}
${authRoleBoundarySql()}
create table private.owner_store_provision(singleton boolean primary key default true check(singleton),project_ref text not null,source_migration_sha256 text not null,prefix_sha256 text not null,catalog_fingerprint text not null,catalog_snapshot jsonb not null,provisioned_at timestamptz not null default clock_timestamp(),provisioned_by text not null default current_user,adopted_at timestamptz,owner_receipt_sha256 text,new_owner_subject text);
alter table private.owner_store_provision enable row level security;
revoke all on private.owner_store_provision from public,anon,authenticated,service_role,livestocks_auth_backend;
insert into private.owner_store_provision(singleton,project_ref,source_migration_sha256,prefix_sha256,catalog_fingerprint,catalog_snapshot)
 select true,${quoted(PROJECT)},${quoted(AUTH_SOURCE_SHA256)},${quoted(sha256(prefix))},encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),snapshot from (${authCatalogSql()}) c(snapshot);
${backendPassword===undefined?'-- Login password is not provisioned by this rehearsal.':`alter role livestocks_auth_backend password ${quoted(backendPassword)};`}
commit;
`;}
export function adoptionGuardSql(source,{readOnly=false}={}){const prefix=authPrefix(source);return `-- Adopt only the exact committed provenance-marked store, with writes drained.
${readOnly?'':`lock table ${AUTH_TABLES.map(name=>`livestocks_auth."${name}"`).join(',')} in share row exclusive mode;`}
do $adopt$ declare marker private.owner_store_provision%rowtype;actual jsonb;begin
 select * into strict marker from private.owner_store_provision where singleton ${readOnly?'':'for update'};
 if marker.project_ref<>${quoted(PROJECT)} or marker.source_migration_sha256<>${quoted(AUTH_SOURCE_SHA256)} or marker.prefix_sha256<>${quoted(sha256(prefix))} or marker.adopted_at is not null then raise exception 'Unreviewed or already adopted owner store';end if;
 if exists(select 1 from (values('anon'),('authenticated'),('service_role'),('livestocks_auth_backend')) r(name) where has_table_privilege(r.name,'private.owner_store_provision','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(r.name,'private.owner_store_provision','SELECT,INSERT,UPDATE,REFERENCES')) then raise exception 'Owner-store provenance permissions changed';end if;
 select (${authCatalogSql()}) into actual;
 if actual is distinct from marker.catalog_snapshot or encode(sha256(convert_to(actual::text,'UTF8')),'hex')<>marker.catalog_fingerprint then raise exception 'Owner store structure or permissions changed';end if;
end;$adopt$;
${authRoleBoundarySql()}`;}
export async function verifyOwnerConfirmation(artifact,legacyOwner,secret){
 check(typeof secret==='string'&&secret.length>=32,'Explicit Better Auth secret required');
 check(artifact?.proofType==='better_auth_final_store_confirmation'&&artifact.finalAuthStoreProject===PROJECT&&artifact.confirmationIssuer===CONFIRMATION_ISSUER,'Final-store confirmation artifact required');
 check(legacyOwner?.emailVerified===true&&typeof legacyOwner.userId==='string'&&typeof legacyOwner.email==='string','Original verified owner required');
 const {payload:p}=await jwtVerify(artifact.confirmationReceipt,new TextEncoder().encode(secret),{algorithms:['HS256'],issuer:CONFIRMATION_ISSUER,audience:CONFIRMATION_AUDIENCE,clockTolerance:0,
  requiredClaims:['sub','jti','iat','exp','sid','email','email_verified','legacy_subject','auth_session_created_at','confirmed_at','purpose','runId']});
 const now=Math.floor(Date.now()/1000),confirmed=Date.parse(p.confirmed_at)/1000;
 check(p.purpose==='confirmed'&&p.runId===p.jti&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.runId),'Confirmation purpose/run mismatch');
 check(typeof p.sub==='string'&&p.sub.length>0&&p.sub.length<=255&&typeof p.sid==='string'&&p.sid.length>0&&p.sid.length<=255&&p.email_verified===true&&p.email===legacyOwner.email.toLowerCase()&&p.legacy_subject===legacyOwner.userId,'Confirmed owner does not match original owner');
 check(Number.isSafeInteger(p.iat)&&p.iat>=now-900&&p.iat<=now+5&&Number.isSafeInteger(p.exp)&&p.exp>p.iat&&p.exp<=p.iat+900
  &&Number.isSafeInteger(p.auth_session_created_at)&&p.auth_session_created_at>=now-900&&p.auth_session_created_at<=p.iat&&Number.isFinite(confirmed)&&Math.abs(confirmed-p.iat)<=5,'Owner confirmation is not fresh');
 check(artifact.userId===p.sub&&artifact.authSessionId===p.sid&&artifact.authSessionCreatedAt===p.auth_session_created_at&&artifact.confirmationRunId===p.runId&&artifact.confirmedAt===p.confirmed_at&&artifact.emailVerified===true&&artifact.email.toLowerCase()===p.email&&artifact.legacyOwnerSubject===p.legacy_subject,'Artifact disagrees with its signed receipt');
 return {userId:p.sub,sessionId:p.sid,sessionCreatedAt:p.auth_session_created_at,runId:p.runId,confirmedAt:p.confirmed_at,expiresAt:p.exp,email:p.email,legacyOwnerSubject:p.legacy_subject,receiptSha256:sha256(artifact.confirmationReceipt)};
}
export function confirmationRowsSql(proof){
 check(proof&&/^[a-f0-9]{64}$/.test(proof.receiptSha256)&&typeof proof.userId==='string'&&typeof proof.sessionId==='string'&&Number.isSafeInteger(proof.sessionCreatedAt)&&Number.isSafeInteger(proof.expiresAt),'Verified confirmation fields required');
 return `do $owner_confirmation$ begin
 if to_timestamp(${proof.expiresAt})<=clock_timestamp() or ${quoted(proof.confirmedAt)}::timestamptz<clock_timestamp()-interval '15 minutes' then raise exception 'Owner confirmation expired before cutover';end if;
 if not exists(select 1 from livestocks_auth.verification v join livestocks_auth."user" u on u.id=${quoted(proof.userId)}
 join livestocks_auth.session s on s.id=${quoted(proof.sessionId)} and s."userId"=u.id
 where v.id=${quoted(proof.runId)} and v.identifier=${quoted('livestocks:owner-confirmation:'+proof.runId)} and v."expiresAt">clock_timestamp()
 and encode(sha256(convert_to(v.value,'UTF8')),'hex')=${quoted(proof.receiptSha256)} and u."emailVerified" and lower(u.email)=${quoted(proof.email)}
 and s."expiresAt">clock_timestamp() and floor(extract(epoch from s."createdAt"))=${proof.sessionCreatedAt}
 and exists(select 1 from livestocks_auth.account a where a."userId"=u.id and a."providerId"='google')) then raise exception 'Final-store Google owner/session/receipt check failed';end if;
end;$owner_confirmation$;`;
}
export function recordAdoptionSql(proof){return `update private.owner_store_provision set adopted_at=clock_timestamp(),owner_receipt_sha256=${quoted(proof.receiptSha256)},new_owner_subject=${quoted(proof.userId)} where singleton and adopted_at is null;`;}

/** pg_dump --no-privileges omits ACLs/roles; reconstruct only the pinned prefix's
 * grants in a disposable restore, then require the ORIGINAL catalog fingerprint. */
export function restoredAuthAclSql(source){authPrefix(source);return `begin read write;set local search_path='';
do $$begin if inet_server_addr() is null or inet_server_addr() not in('127.0.0.1'::inet,'::1'::inet) then raise exception 'Auth ACL reconstruction is local restore only';end if;end$$;
revoke all on schema livestocks_auth from public,anon,authenticated,service_role,livestocks_auth_backend;
grant usage on schema livestocks_auth,private to livestocks_auth_backend;
${AUTH_TABLES.map(name=>`revoke all on livestocks_auth."${name}" from public,anon,authenticated,service_role,livestocks_auth_backend;grant select,insert,update,delete on livestocks_auth."${name}" to livestocks_auth_backend;`).join('\n')}
do $members$ declare marker private.owner_store_provision%rowtype;m jsonb;begin
 select * into strict marker from private.owner_store_provision where singleton for update;
 if marker.project_ref<>${quoted(PROJECT)} or marker.source_migration_sha256<>${quoted(AUTH_SOURCE_SHA256)} or marker.prefix_sha256<>${quoted(sha256(authPrefix(source)))} or marker.adopted_at is not null
 or encode(sha256(convert_to(marker.catalog_snapshot::text,'UTF8')),'hex') is distinct from marker.catalog_fingerprint then raise exception 'Unreviewed restored provenance marker';end if;
 if marker.catalog_snapshot->'role' is distinct from '{"login":true,"inherit":false,"super":false,"bypassRls":false,"createDb":false,"createRole":false,"replication":false,"connectionLimit":-1,"validUntil":null,"config":null}'::jsonb then raise exception 'Unreviewed restored backend role attributes';end if;
 if jsonb_typeof(marker.catalog_snapshot->'memberships') is distinct from 'array' or jsonb_array_length(marker.catalog_snapshot->'memberships')>1 then raise exception 'Unreviewed role membership in restored marker';end if;
 for m in select jsonb_array_elements(marker.catalog_snapshot->'memberships') loop
  if m is distinct from '["livestocks_auth_backend","postgres",true]'::jsonb then raise exception 'Unreviewed role membership in restored marker';end if;
  grant livestocks_auth_backend to postgres with admin option;
 end loop;
end;$members$;
${adoptionGuardSql(source)}
commit;`;}
