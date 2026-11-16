-- Run as the disposable database owner after applying every migration.
-- Tests use real roles/RLS, synthetic Auth0 claims, and roll back all fixtures.
-- This proves database authorization, not hosted Auth0 signature acceptance.
\set ON_ERROR_STOP on
begin;

insert into private.auth_config(singleton,issuer,website_client_id,mcp_client_id,website_audience,mcp_audience)
values(true,'https://test.auth0.com/','website-test','mcp-test','https://test.example/api/web','https://test.example/api/mcp')
on conflict(singleton) do update set issuer=excluded.issuer, website_client_id=excluded.website_client_id,
  mcp_client_id=excluded.mcp_client_id, website_audience=excluded.website_audience,mcp_audience=excluded.mcp_audience;

create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'ASSERT: %', message; end if; end;
$$;
create function pg_temp.expect_denied(statement text, message text)
returns void language plpgsql as $$
begin
  begin execute statement;
  exception when insufficient_privilege or foreign_key_violation or unique_violation or not_null_violation then return;
  end;
  raise exception 'EXPECTED DENIAL: %', message;
end;
$$;
create function pg_temp.web_claims(subject text)
returns jsonb language sql as $$
  select jsonb_build_object('iss','https://test.auth0.com/','aud','https://test.example/api/web',
    'sub',subject,'azp','website-test','role','authenticated','scope','portfolio:read portfolio:write',
    'iat',floor(extract(epoch from now()))::bigint,'exp',floor(extract(epoch from now()))::bigint+3600,
    'https://livestocks.app/read_only',false,'https://livestocks.app/email_verified',true);
$$;
create function pg_temp.mcp_claims(subject text, issued bigint default 1000)
returns jsonb language sql as $$
  select pg_temp.web_claims(subject) || jsonb_build_object('aud',jsonb_build_array('https://test.example/api/mcp','https://test.auth0.com/userinfo'),
    'azp','mcp-test','scope','portfolio:read','iat',issued,'https://livestocks.app/read_only',true);
$$;

-- Anonymous access is rejected even if claims imitate an authenticated token.
set local role anon;
select set_config('request.jwt.claims',pg_temp.web_claims('auth0|isolation-a')::text,true);
select pg_temp.expect_denied('select * from public.positions','anonymous positions read');
select pg_temp.expect_denied('select * from public.settings','anonymous settings read');
select pg_temp.expect_denied('select * from public.user_profiles','anonymous profile read');
select pg_temp.expect_denied('select public.record_position_purchase(gen_random_uuid(),''A'',''A'','''',''bank_one'',1,1,current_date)','anonymous RPC');
reset role;

-- User A: website can create only its own profile and six kinds of owned rows.
set local role authenticated;
select set_config('request.jwt.claims',pg_temp.web_claims('auth0|isolation-a')::text,true);
insert into public.user_profiles(id) values('auth0|isolation-a');
select pg_temp.expect_denied('insert into public.user_profiles(id) values(''auth0|forged'')','profile subject spoof');
insert into public.settings(id,annual_growth_rate) values('10000000-0000-4000-8000-000000000001',0.1234);
select pg_temp.expect_denied('insert into public.settings(annual_growth_rate) values(0.1)','one settings row per user');
select * from public.record_position_purchase('20000000-0000-4000-8000-000000000001','shared','User A','','bank_one',10,2,'2026-01-01',true,8);
select * from public.record_position_purchase('20000000-0000-4000-8000-000000000001',' SHARED ','User A','','bank_one',10,2,'2026-01-01',true,8);
select pg_temp.assert_true((select count(*)=1 from public.positions),'purchase retry preserved one position');
select pg_temp.assert_true((select count(*)=1 from public.position_lots),'purchase retry preserved one lot');
insert into public.position_plans(id,symbol,target_price,target_quantity,target_date)
  values('30000000-0000-4000-8000-000000000001','NEW',10,1,'2027-01-01');
insert into public.watchlist_groups(id,name) values('40000000-0000-4000-8000-000000000001','A group');
insert into public.watchlist_tickers(id,group_id,symbol)
  values('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','AAA');
select pg_temp.assert_true((select user_id='auth0|isolation-a' from public.settings),'default owner comes from verified subject');
select pg_temp.expect_denied('update public.positions set user_id=''auth0|isolation-b''','ownership cannot be reassigned');
select pg_temp.expect_denied('update public.user_profiles set id=''auth0|other''','profile identity immutable');
select pg_temp.expect_denied('select * from private.user_credentials','credentials hidden');
select pg_temp.expect_denied('select * from private.auth_config','trusted config hidden');
select pg_temp.expect_denied('select * from private.mcp_connections','connection controls hidden');
select pg_temp.expect_denied('select * from private.widget_tokens','widget credentials hidden');
select pg_temp.expect_denied('select public.server_get_credentials(''auth0|isolation-a'')','service credential RPC hidden');
select pg_temp.expect_denied('select public.server_set_credentials(''auth0|isolation-a'',''forged'')','service write RPC hidden');
select pg_temp.expect_denied('select public.server_mcp_connection(''auth0|isolation-a'',''reconnect'',0)','service connection RPC hidden');
select pg_temp.expect_denied('select public.server_widget_tokens(''auth0|isolation-a'',''list'')','service widget RPC hidden');
select pg_temp.expect_denied('select public.server_resolve_widget(repeat(''a'',64))','widget resolver hidden');
reset role;

-- Keep fixture IDs in a session setting, never expose them via a privileged RPC.
select set_config('test.a_position',(select id::text from public.positions where user_id='auth0|isolation-a'),true);
set local role authenticated;
select set_config('request.jwt.claims',pg_temp.web_claims('google-oauth2|isolation-b')::text,true);
insert into public.user_profiles(id) values('google-oauth2|isolation-b');
do $$
declare t text; n bigint;
begin
  foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'] loop
    execute format('select count(*) from public.%I',t) into n;
    perform pg_temp.assert_true(n=0,'User B cannot read user A '||t);
    execute format('update public.%I set user_id=user_id',t);
    get diagnostics n = row_count;
    perform pg_temp.assert_true(n=0,'User B cannot update user A '||t);
    execute format('delete from public.%I',t);
    get diagnostics n = row_count;
    perform pg_temp.assert_true(n=0,'User B cannot delete user A '||t);
  end loop;
end;
$$;
select pg_temp.expect_denied('insert into public.settings(user_id) values(''auth0|isolation-a'')','spoofed settings owner');
select pg_temp.expect_denied(format('insert into public.position_lots(position_id,side,price,quantity,executed_at) values(%L,''BUY'',1,1,current_date)',current_setting('test.a_position')),'cross-owner lot FK');
select pg_temp.expect_denied(format('insert into public.position_plans(position_id,symbol,target_price,target_quantity,target_date) values(%L,''SHARED'',1,1,current_date)',current_setting('test.a_position')),'cross-owner plan FK');
select pg_temp.expect_denied('insert into public.watchlist_tickers(group_id,symbol) values(''40000000-0000-4000-8000-000000000001'',''BAD'')','cross-owner watchlist FK');
-- Same symbol and brokerage belong to different users without sharing identity.
select * from public.record_position_purchase('20000000-0000-4000-8000-000000000002','shared','User B','','bank_one',20,3,'2026-02-01');
select pg_temp.assert_true((select id::text <> current_setting('test.a_position') from public.positions),'same instrument is isolated by owner');
insert into public.settings(annual_growth_rate) values(0.25);
select pg_temp.assert_true((select annual_growth_rate=0.25 from public.settings),'settings are independent');
insert into public.watchlist_groups(id,name) values('40000000-0000-4000-8000-000000000002','B group');
insert into public.watchlist_tickers(id,group_id,symbol) values('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','BBB');
select pg_temp.expect_denied('update public.watchlist_tickers set group_id=''40000000-0000-4000-8000-000000000001''','cannot reparent a ticker across owners');
select pg_temp.expect_denied(format('update public.position_lots set position_id=%L',current_setting('test.a_position')),'cannot reparent an existing lot across owners');
select pg_temp.expect_denied('select public.record_position_purchase(''20000000-0000-4000-8000-000000000001'',''DIFFERENT'',''B'','''',''bank_one'',20,3,''2026-02-01'')','foreign request UUID never returns another owner result');
select pg_temp.assert_true((select count(*)=1 from public.positions),'foreign request collision rolls back inserted position');
reset role;

-- A token with any incorrect signed authorization attribute sees nothing.
set local role authenticated;
do $$
declare patch jsonb;
begin
  for patch in select value from jsonb_array_elements('[
    {"iss":"https://other.auth0.com/"}, {"azp":"unknown-client"},
    {"aud":"https://test.example/api/mcp"}, {"aud":["https://test.example/api/web",123]},
    {"https://livestocks.app/email_verified":false}, {"https://livestocks.app/email_verified":"true"},
    {"https://livestocks.app/read_only":true}, {"https://livestocks.app/read_only":"false"},
    {"role":"anon"}, {"scope":"portfolio:read-other portfolio:write"}, {"sub":""}, {"sub":123}
  ]'::jsonb) loop
    perform set_config('request.jwt.claims',(pg_temp.web_claims('auth0|isolation-a') || patch)::text,true);
    perform pg_temp.assert_true((select count(*)=0 from public.positions),'invalid claims cannot read positions: '||patch::text);
  end loop;
  perform set_config('request.jwt.claims',(pg_temp.web_claims('auth0|isolation-a') - 'https://livestocks.app/read_only')::text,true);
  perform pg_temp.assert_true((select count(*)=0 from public.settings),'missing capability flag denied');
  perform set_config('request.jwt.claims',(pg_temp.web_claims('auth0|isolation-a') || jsonb_build_object('sub',repeat('x',256)))::text,true);
  perform pg_temp.assert_true((select count(*)=0 from public.positions),'oversized opaque subject denied');
end;
$$;
select set_config('request.jwt.claims',(pg_temp.web_claims('auth0|isolation-a') || '{"scope":"portfolio:read"}'::jsonb)::text,true);
select pg_temp.assert_true((select count(*)=1 from public.positions),'website read-only scope still reads its own data');
select pg_temp.expect_denied('insert into public.watchlist_groups(name) values(''forbidden'')','website missing write scope cannot insert');
reset role;

-- Missing trusted configuration fails closed; restore it only as the DB owner.
create temporary table saved_auth_config as select * from private.auth_config;
delete from private.auth_config;
set local role authenticated;
select set_config('request.jwt.claims',pg_temp.web_claims('auth0|isolation-a')::text,true);
select pg_temp.assert_true((select count(*)=0 from public.positions),'missing trusted configuration denies reads');
reset role;
insert into private.auth_config select * from saved_auth_config;

-- Service-only wrappers exercise credential storage without exposing plaintext.
set local role service_role;
select public.server_set_credentials('auth0|isolation-a','encrypted-test-envelope');
select pg_temp.assert_true(public.server_get_credentials('auth0|isolation-a')='encrypted-test-envelope','service stores encrypted credential');
select public.server_set_credentials('auth0|isolation-a',null);
select pg_temp.assert_true(public.server_get_credentials('auth0|isolation-a') is null,'service deletes credential');
reset role;

-- A valid MCP JWT initially sees no data until the server enables a connection.
set local role authenticated;
select set_config('request.jwt.claims',pg_temp.mcp_claims('auth0|isolation-a')::text,true);
select pg_temp.assert_true((select count(*)=0 from public.positions),'MCP requires enabled server connection');
reset role;
set local role service_role;
select public.server_mcp_connection('auth0|isolation-a','bootstrap',1000);
reset role;
set local role authenticated;
select set_config('request.jwt.claims',pg_temp.mcp_claims('auth0|isolation-a')::text,true);
do $$
declare t text; n bigint;
begin
  foreach t in array array['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'] loop
    execute format('select count(*) from public.%I',t) into n;
    perform pg_temp.assert_true(n=1,'MCP reads only owner data in '||t);
    execute format('update public.%I set user_id=user_id',t);
    get diagnostics n = row_count;
    perform pg_temp.assert_true(n=0,'MCP cannot update '||t);
    execute format('delete from public.%I',t);
    get diagnostics n = row_count;
    perform pg_temp.assert_true(n=0,'MCP cannot delete '||t);
  end loop;
end;
$$;
select pg_temp.expect_denied('insert into public.watchlist_groups(name) values(''MCP write'')','MCP cannot insert');
select pg_temp.expect_denied('insert into public.positions(user_id,symbol,display,image_url,entry_price,quantity,entry_date) values(''auth0|isolation-a'',''MCP'',''MCP'','''',1,1,current_date)','MCP cannot insert explicit-owner position');
select pg_temp.expect_denied(format('insert into public.position_lots(user_id,position_id,side,price,quantity,executed_at) values(''auth0|isolation-a'',%L,''BUY'',1,1,current_date)',current_setting('test.a_position')),'MCP cannot insert explicit-owner lot');
select pg_temp.expect_denied('insert into public.position_plans(user_id,symbol,target_price,target_quantity,target_date) values(''auth0|isolation-a'',''MCP'',1,1,current_date)','MCP cannot insert explicit-owner standalone plan');
select pg_temp.expect_denied('insert into public.settings(user_id) values(''auth0|isolation-a'')','MCP cannot insert explicit-owner settings');
select pg_temp.expect_denied('insert into public.watchlist_tickers(user_id,group_id,symbol) values(''auth0|isolation-a'',''40000000-0000-4000-8000-000000000001'',''MCP'')','MCP cannot insert explicit-owner ticker');
select pg_temp.expect_denied('select public.record_position_purchase(gen_random_uuid(),''X'',''X'','''',''bank_one'',1,1,current_date)','MCP cannot use write RPC');
select pg_temp.expect_denied('insert into public.user_profiles(id) values(''auth0|isolation-a'')','MCP cannot bootstrap profile directly');
select set_config('request.jwt.claims',(pg_temp.mcp_claims('auth0|isolation-a') || '{"scope":"portfolio:read portfolio:write"}'::jsonb)::text,true);
select pg_temp.expect_denied('insert into public.watchlist_groups(name) values(''scope escalation'')','MCP write scope does not override client capability');
reset role;

-- Disconnect is sticky even when the old token tries automatic bootstrap.
set local role service_role;
select public.server_mcp_connection('auth0|isolation-a','disconnect',1000);
select pg_temp.assert_true((public.server_mcp_connection('auth0|isolation-a','bootstrap',2000)->>'enabled')::boolean=false,'bootstrap never reenables revoked access');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',pg_temp.mcp_claims('auth0|isolation-a',2000)::text,true);
select pg_temp.assert_true((select count(*)=0 from public.positions),'disabled connection denies even later token');
reset role;
set local role service_role;
select public.server_mcp_connection('auth0|isolation-a','reconnect',2000);
reset role;
set local role authenticated;
select set_config('request.jwt.claims',pg_temp.mcp_claims('auth0|isolation-a',2000)::text,true);
select pg_temp.assert_true((select count(*)=0 from public.positions),'token exactly at cutoff denied');
select set_config('request.jwt.claims',pg_temp.mcp_claims('auth0|isolation-a',2001)::text,true);
select pg_temp.assert_true((select count(*)=1 from public.positions),'new token after explicit reconnect accepted');
do $$
declare patch jsonb;
begin
  for patch in select value from jsonb_array_elements('[
    {"iat":2000},{"iat":"2001"},{"iat":null},{"iat":-1},{"iat":9999999999999999999999999999999},
    {"azp":"website-test"},{"aud":"https://test.example/api/web"},
    {"https://livestocks.app/read_only":false},{"https://livestocks.app/email_verified":false}
  ]'::jsonb) loop
    perform set_config('request.jwt.claims',(pg_temp.mcp_claims('auth0|isolation-a',2001) || patch)::text,true);
    perform pg_temp.assert_true((select count(*)=0 from public.positions),'invalid MCP claim denied: '||patch::text);
  end loop;
end;
$$;
reset role;

-- Service widget paths never return stored hashes; revocation is owner-scoped.
set local role service_role;
select set_config('test.widget_id',(public.server_widget_tokens('auth0|isolation-a','create',null,'Test',repeat('a',64))->>'id'),true);
select pg_temp.assert_true(not (public.server_widget_tokens('auth0|isolation-a','list')->0 ? 'token_hash'),'widget metadata excludes hashes');
select pg_temp.assert_true(public.server_resolve_widget(repeat('a',64))->>'user_id'='auth0|isolation-a','valid widget resolves exact owner');
select pg_temp.assert_true((public.server_resolve_widget(repeat('a',64))->>'expires_at')::timestamptz > now(),'widget resolver returns the real expiry');
select pg_temp.assert_true(public.server_widget_tokens('google-oauth2|isolation-b','revoke',current_setting('test.widget_id')::uuid) is null,'other owner cannot revoke widget');
select pg_temp.assert_true(public.server_resolve_widget(repeat('a',64))->>'user_id'='auth0|isolation-a','cross-owner revoke did not change widget');
select public.server_widget_tokens('auth0|isolation-a','revoke',current_setting('test.widget_id')::uuid);
select pg_temp.assert_true(public.server_resolve_widget(repeat('a',64)) is null,'revoked widget denied');
select public.server_widget_tokens('auth0|isolation-a','create',null,'Expired',repeat('b',64));
update private.widget_tokens set created_at=now()-interval '2 days', expires_at=now()-interval '1 day' where token_hash=repeat('b',64);
select pg_temp.assert_true(public.server_resolve_widget(repeat('b',64)) is null,'expired widget denied');
reset role;

-- Referential data survives failed profile deletion; existing business values stay.
select pg_temp.expect_denied('delete from public.user_profiles where id=''auth0|isolation-a''','profile FK preserves financial history');
select pg_temp.assert_true((select count(*)=1 from public.position_lots where user_id='auth0|isolation-a'),'cross-user and MCP writes left original lot intact');
select pg_temp.assert_true((select price=10 and quantity=2 and commission_amount=8 from public.position_lots where user_id='auth0|isolation-a'),'original financial values intact');
select pg_temp.assert_true(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='settings' and column_name='finnhub_token'),'plaintext provider token absent from public table');
select pg_temp.assert_true(not exists(select 1 from pg_policies where schemaname='public' and tablename in ('positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers') and roles::text like '%public%'),'no inherited permissive public policies');

rollback;
\echo 'PASS: Auth0 opaque subjects, six-table isolation, parent ownership, retries, capability checks, revocation, private credentials and widget lifecycle'
