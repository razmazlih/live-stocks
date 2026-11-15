/** Synthetic-only hosted fixture. Financial migrations are NEVER applied here.
 * Function bodies come from committed migrations; only the profile-table name
 * changes. Reserved helper/schema collisions abort before any DDL.
 */
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export const FIXTURE_TABLE='livestocks_ba_gate_20261115';
const PROFILE='private.hosted_gate_profiles';
const rename=source=>source.replaceAll('public.user_profiles',PROFILE);
function statement(source,start){const at=source.indexOf(start);if(at<0)throw Error('Fixture source statement missing');return source.slice(at,source.indexOf(';',at)+1);}
function fn(source,name){const re=new RegExp('create (?:or replace )?function '+name.replaceAll('.','\\.')+'\\(');const at=source.search(re);if(at<0)throw Error('Fixture function missing: '+name);const text=source.slice(at);const open=text.indexOf('$$');const close=text.indexOf('$$',open+2);if(open<0||close<0)throw Error('Unsupported fixture function delimiter');return text.slice(0,text.indexOf(';',close)+1);}
export async function buildHostedFixture(root){
 const runId=randomUUID();
 const [original,canonical,provider]=await Promise.all(['20261114114916_auth0_user_isolation.sql','20261114145729_canonical_profiles_and_lossless_merge.sql','20261114151506_better_auth_private_sessions.sql'].map(name=>readFile(join(root,'supabase/migrations',name),'utf8')));
 const generated=provider.slice(provider.indexOf('create schema livestocks_auth;'),provider.indexOf('alter table private.auth_config add column'));
 const approvals=provider.slice(provider.indexOf('create table private.oauth_approvals('),provider.indexOf('-- Only initial login/explicit consent'));
 const profileAlter=canonical.slice(canonical.indexOf('alter table public.user_profiles\n'),canonical.indexOf('update public.user_profiles set primary_pinned'));
 const funcs=[fn(original,'private.has_audience'),fn(canonical,'private.lock_active_profile'),...['private.ensure_oauth_approval','private.check_oauth_approval','private.revoke_oauth_approvals','public.server_identity_resolve','private.canonical_authorized_subject','private.better_auth_session_valid','private.authorized_subject'].map(name=>fn(provider,name))];
 const sql=rename(`begin;
set local lock_timeout='3s';set local statement_timeout='15s';
-- Reject collisions before creating anything. This is not a reset/reuse script.
do $$begin
 if exists(select 1 from pg_namespace where nspname in('private','livestocks_auth'))
 or exists(select 1 from pg_roles where rolname='livestocks_auth_backend')
 or to_regclass('public.${FIXTURE_TABLE}') is not null
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='server_identity_resolve')
 then raise exception 'Hosted fixture reserved namespace collision';end if;
end$$;
create schema private;
create table private.hosted_gate_marker(run_id uuid primary key);
insert into private.hosted_gate_marker values('${runId}');
alter table private.hosted_gate_marker enable row level security;
revoke all on schema private from public,anon,authenticated;
grant usage on schema private to authenticated,service_role;
${statement(original,'create table public.user_profiles (')}
${profileAlter}
alter table public.user_profiles enable row level security;
${statement(original,'create table private.auth_config (')}
alter table private.auth_config add column auth_provider text not null default 'better_auth' check(auth_provider='better_auth');
${statement(original,'create table private.mcp_connections (')}
${statement(canonical,'create table private.identity_profiles(')}
alter table private.auth_config enable row level security;
alter table private.mcp_connections enable row level security;
alter table private.identity_profiles enable row level security;
${generated}
${approvals}
${funcs.join('\n')}
revoke all on all tables in schema private from public,anon,authenticated,livestocks_auth_backend;
revoke all on all functions in schema private from public,anon,authenticated,service_role;
revoke all on function public.server_identity_resolve(text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.server_identity_resolve(text,text,text,bigint) to service_role;
grant execute on function private.authorized_subject(boolean) to authenticated;
grant execute on function private.ensure_oauth_approval(text,text,text),private.check_oauth_approval(uuid,text,text,text),private.revoke_oauth_approvals(text,text,text) to livestocks_auth_backend;
create table public.${FIXTURE_TABLE}(id uuid primary key default gen_random_uuid(),user_id text not null default private.authorized_subject(true) references public.user_profiles(id),label text not null);
alter table public.${FIXTURE_TABLE} enable row level security;
revoke all on public.${FIXTURE_TABLE} from public,anon;
grant select,insert,update,delete on public.${FIXTURE_TABLE} to authenticated;
create policy owner_read on public.${FIXTURE_TABLE} for select to authenticated using(user_id=(select private.authorized_subject(false)));
create policy owner_insert on public.${FIXTURE_TABLE} for insert to authenticated with check(user_id=(select private.authorized_subject(true)));
create policy owner_update on public.${FIXTURE_TABLE} for update to authenticated using(user_id=(select private.authorized_subject(true))) with check(user_id=(select private.authorized_subject(true)));
create policy owner_delete on public.${FIXTURE_TABLE} for delete to authenticated using(user_id=(select private.authorized_subject(true)));
notify pgrst,'reload schema';
commit;`);
 return {sql,runId,cleanup:`begin;set local lock_timeout='3s';set local statement_timeout='15s';do $$begin if not exists(select 1 from private.hosted_gate_marker where run_id='${runId}'::uuid) then raise exception 'Fixture ownership mismatch';end if;end$$;drop table public.${FIXTURE_TABLE};drop function public.server_identity_resolve(text,text,text,bigint);drop schema livestocks_auth cascade;drop schema private cascade;drop role livestocks_auth_backend;notify pgrst,'reload schema';commit;`,scope:'HOSTED_PROVIDER_AND_ISOLATED_FIXTURE_RLS',sourceFunctions:funcs.length};
}
