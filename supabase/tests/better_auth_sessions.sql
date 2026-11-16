-- Database half of the real-session integration: synthetic users only.
\set ON_ERROR_STOP on
begin;
insert into private.auth_config(singleton,issuer,website_client_id,mcp_client_id,website_audience,mcp_audience,auth_provider)
values(true,'https://local-auth.test/api/auth','website-local','mcp-local','https://local-auth.test/api/web','https://local-auth.test/api/mcp','better_auth')
on conflict(singleton) do update set issuer=excluded.issuer,website_client_id=excluded.website_client_id,mcp_client_id=excluded.mcp_client_id,website_audience=excluded.website_audience,mcp_audience=excluded.mcp_audience,auth_provider=excluded.auth_provider;
create function pg_temp.ok(v boolean,m text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERT %',m;end if;end$$;
create function pg_temp.denied(q text) returns void language plpgsql as $$begin begin execute q;exception when others then return;end;raise exception 'Unexpected success: %',q;end$$;
set local role livestocks_auth_backend;
insert into livestocks_auth."user"(id,name,email,"emailVerified") values('local-a','Synthetic A','a@example.invalid',true),('local-b','Synthetic B','b@example.invalid',true),('local-unverified','Unverified','u@example.invalid',false);
insert into livestocks_auth.session(id,token,"userId","createdAt","updatedAt","expiresAt") values
 ('session-a','synthetic-cookie-a','local-a',now()-interval '1 minute',now(),now()+interval '1 hour'),
 ('session-b','synthetic-cookie-b','local-b',now()-interval '1 minute',now(),now()+interval '1 hour'),
 ('session-unverified','synthetic-cookie-u','local-unverified',now()-interval '1 minute',now(),now()+interval '1 hour'),
 ('session-expired','synthetic-cookie-expired','local-a',now()-interval '2 hour',now(),now()-interval '1 hour');
select pg_temp.denied('select * from public.positions');
select pg_temp.denied('select * from private.user_credentials');
select pg_temp.denied('select * from private.oauth_approvals');
select pg_temp.denied($q$select public.server_better_auth_token_valid('local-a','session-a','website-local')$q$);
reset role;
set local role service_role;
select pg_temp.ok(public.server_better_auth_token_valid('local-a','session-a','website-local'),'new verified first-login web session allowed before profile exists');
select pg_temp.ok(not public.server_better_auth_token_valid('local-a','session-b','website-local'),'cross-user session rejected');
select pg_temp.ok(not public.server_better_auth_token_valid('local-a','session-expired','website-local'),'expired session rejected');
select pg_temp.ok(not public.server_better_auth_token_valid('local-unverified','session-unverified','website-local'),'unverified user rejected');
select pg_temp.ok(not public.server_better_auth_token_valid('local-a','session-a','evil-client'),'unapproved client rejected');
select public.server_bootstrap_web_account('https://local-auth.test/api/auth','local-a');
select public.server_mcp_connection('local-a','bootstrap',1);
reset role;
set local role livestocks_auth_backend;
select set_config('test.approval',private.ensure_oauth_approval('local-a','session-a','mcp-local')::text,true);
select pg_temp.ok(private.ensure_oauth_approval('local-a','session-a','mcp-local')::text=current_setting('test.approval'),'initial consent ensure idempotent');
select pg_temp.ok((private.check_oauth_approval(current_setting('test.approval')::uuid,'local-a','session-a','mcp-local')->>'valid')::boolean,'approval exact match');
select pg_temp.ok(not (private.check_oauth_approval(current_setting('test.approval')::uuid,'local-b','session-a','mcp-local')->>'valid')::boolean,'approval cannot cross subject');
select pg_temp.denied($q$select private.ensure_oauth_approval('local-unverified','session-unverified','mcp-local')$q$);
-- MCP-first registration must create its own empty profile without a prior web visit.
select private.ensure_oauth_approval('local-b','session-b','mcp-local');
reset role;
select pg_temp.ok(exists(select 1 from private.identity_profiles where subject='local-b' and profile_id='local-b'),'MCP-first verified account safely registered');
insert into public.positions(user_id,symbol,display,image_url,entry_price,quantity,entry_date) values('local-a','SYNTH','Synthetic','',1,1,current_date);
select set_config('test.web',jsonb_build_object('sub','local-a','sid','session-a','iss','https://local-auth.test/api/auth','azp','website-local','aud','https://local-auth.test/api/web','role','authenticated','scope','portfolio:read portfolio:write','iat',floor(extract(epoch from now()))::bigint,'https://livestocks.app/read_only',false,'https://livestocks.app/email_verified',true,'https://livestocks.app/auth_session_id','session-a','https://livestocks.app/auth_session_created_at',(select floor(extract(epoch from "createdAt"))::bigint from livestocks_auth.session where id='session-a'))::text,true);
select set_config('test.mcp',(current_setting('test.web')::jsonb||jsonb_build_object('azp','mcp-local','aud','https://local-auth.test/api/mcp','scope','portfolio:read','https://livestocks.app/read_only',true,'https://livestocks.app/grant_id',current_setting('test.approval')))::text,true);
set local role authenticated;
select set_config('request.jwt.claims',current_setting('test.web'),true);
select pg_temp.ok((select count(*)=1 from public.positions),'website signed session fields permit own RLS');
select set_config('request.jwt.claims',(current_setting('test.web')::jsonb||jsonb_build_object('https://livestocks.app/auth_session_created_at',1))::text,true);
select pg_temp.ok((select count(*)=0 from public.positions),'forged grant origin fails even on unmerged profile');
select set_config('request.jwt.claims',current_setting('test.mcp'),true);
select pg_temp.ok((select count(*)=1 from public.positions),'MCP live approval permits only own read');
select pg_temp.denied($q$insert into public.watchlist_groups(name) values('forbidden')$q$);
select pg_temp.denied('select * from livestocks_auth.session');
select pg_temp.denied('select * from private.oauth_approvals');
select pg_temp.denied($q$select private.ensure_oauth_approval('local-a','session-a','mcp-local')$q$);
select set_config('request.jwt.claims',(current_setting('test.mcp')::jsonb-'https://livestocks.app/grant_id')::text,true);
select pg_temp.ok((select count(*)=0 from public.positions),'MCP missing approval denied');
reset role;
set local role service_role;
select pg_temp.ok(public.server_revoke_canonical_mcp_approvals('local-a')=1,'canonical revoke covers approved MCP identity');
select pg_temp.ok(not public.server_better_auth_token_valid('local-a','session-a','mcp-local',current_setting('test.approval')::uuid),'already-minted MCP token invalid after approval revocation');
select pg_temp.ok(public.server_better_auth_token_valid('local-a','session-a','website-local'),'MCP disconnect preserves web session');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',current_setting('test.mcp'),true);
select pg_temp.ok((select count(*)=0 from public.positions),'same old signed claims denied immediately after revoke');
reset role;
set local role livestocks_auth_backend;
delete from livestocks_auth.session where id='session-a';
reset role;
set local role service_role;
select pg_temp.ok(not public.server_better_auth_token_valid('local-a','session-a','website-local'),'deleted session invalidates old web token');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',current_setting('test.web'),true);
select pg_temp.ok((select count(*)=0 from public.positions),'old web JWT cannot bypass live session deletion');
reset role;
-- Explicit issuer binding is required for any pre-existing profile ID.
insert into public.user_profiles(id) values('collision');
set local role service_role;
select pg_temp.denied($q$select public.server_identity_resolve('https://local-auth.test/api/auth','collision')$q$);
reset role;
rollback;
