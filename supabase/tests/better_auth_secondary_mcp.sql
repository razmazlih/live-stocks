-- Exercise the two exact MCP clients with synthetic users in disposable PostgreSQL.
\set ON_ERROR_STOP on
begin;

create function pg_temp.ok(value boolean, message text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'ASSERT %',message;end if;
end$$;
create function pg_temp.denied(query text, reason text) returns void language plpgsql as $$
begin
  begin execute query;
  exception when others then
    if strpos(sqlerrm,reason)=0 then raise;end if;
    return;
  end;
  raise exception 'Unexpected success: %',query;
end$$;

select pg_temp.ok((select mcp_secondary_client_id='livestocks-mcp-chatgpt-blue' from private.auth_config where singleton),
  'the migration enables the secondary client for the exact configured Better Auth primary');

set local role livestocks_auth_backend;
insert into livestocks_auth."user"(id,name,email,"emailVerified") values
  ('connector-a','Synthetic A','connector-a@example.invalid',true),
  ('connector-b','Synthetic B','connector-b@example.invalid',true);
insert into livestocks_auth.session(id,token,"userId","createdAt","updatedAt","expiresAt") values
  ('connector-session-a','fixture-A','connector-a',now()-interval '1 minute',now(),now()+interval '1 hour'),
  ('connector-session-b','fixture-B','connector-b',now()-interval '1 minute',now(),now()+interval '1 hour');
select pg_temp.denied(
  $$select private.ensure_oauth_approval('connector-a','connector-session-a','livestocks-mcp-chatgpt-blue-extra')$$,
  'Unapproved client');
select pg_temp.denied(
  $$select * from private.auth_config$$,'permission denied');
select set_config('test.secondary_grant',private.ensure_oauth_approval(
  'connector-a','connector-session-a','livestocks-mcp-chatgpt-blue')::text,true);
select set_config('test.primary_grant',private.ensure_oauth_approval(
  'connector-a','connector-session-a','livestocks-mcp-chatgpt')::text,true);
select pg_temp.ok(current_setting('test.secondary_grant')<>current_setting('test.primary_grant'),
  'same owner and session must consent to each client separately');
select pg_temp.ok(not (private.check_oauth_approval(current_setting('test.primary_grant')::uuid,
  'connector-a','connector-session-a','livestocks-mcp-chatgpt-blue')->>'valid')::boolean,
  'a primary approval cannot authorize the secondary client');
select private.ensure_oauth_approval('connector-b','connector-session-b','livestocks-mcp-chatgpt-blue');
reset role;
select public.server_identity_resolve('https://secondary-client.test/api/auth','connector-a',repeat('a',64));
select public.server_identity_resolve('https://secondary-client.test/api/auth','connector-b',repeat('a',64));
select public.server_bootstrap_web_account('https://secondary-client.test/api/auth','connector-a');
select public.server_bootstrap_web_account('https://secondary-client.test/api/auth','connector-b');
select public.server_mcp_connection('connector-a','bootstrap',1);
select public.server_mcp_connection('connector-b','bootstrap',1);
insert into public.positions(user_id,symbol,display,image_url,entry_price,quantity,entry_date,location)
select user_id,case when user_id='connector-a' then 'FIXTUREA' else 'FIXTUREB' end,'Synthetic','',10,1,current_date,id
from public.investment_sources where user_id in ('connector-a','connector-b');

select set_config('test.secondary_claims',jsonb_build_object(
  'sub','connector-a','sid','connector-session-a','iss','https://secondary-client.test/api/auth',
  'azp','livestocks-mcp-chatgpt-blue','aud','https://secondary-client.test/api/mcp','role','authenticated',
  'scope','portfolio:read portfolio:transactions','iat',floor(extract(epoch from now()))::bigint,
  'https://livestocks.app/read_only',true,'https://livestocks.app/email_verified',true,
  'https://livestocks.app/auth_session_id','connector-session-a',
  'https://livestocks.app/auth_session_created_at',(select floor(extract(epoch from "createdAt"))::bigint
    from livestocks_auth.session where id='connector-session-a'),
  'https://livestocks.app/grant_id',current_setting('test.secondary_grant'))::text,true);
select set_config('test.primary_claims',(current_setting('test.secondary_claims')::jsonb||jsonb_build_object(
  'azp','livestocks-mcp-chatgpt','https://livestocks.app/grant_id',current_setting('test.primary_grant')))::text,true);

create function pg_temp.prepare_trade() returns jsonb language plpgsql as $$
declare
  snapshot jsonb:=public.screenshot_sync_snapshot();
  source jsonb:=snapshot#>'{sources,0}';
  trade jsonb:=jsonb_build_object('location',source->>'id','side','BUY','symbol','TRADE',
    'quantity',2,'priceUsd',40,'executedOn',(now() at time zone 'Asia/Jerusalem')::date,'commissionUsd',2);
  plan jsonb:=jsonb_build_object('canApply',true,'location',source->>'id','sourceName',source->>'name',
    'transaction',trade,'changes',jsonb_build_array(jsonb_build_object('symbol','TRADE','previousQuantity',0,
      'previousAverageCostUsd',null,'quantity',2,'averageCostUsd',41)));
begin
  return public.create_chat_transaction_proposal('a17689b1-aeef-488f-82e5-c397e8f17b91',
    snapshot->>'fingerprint',trade,jsonb_build_object('input',trade,'plan',plan),encode(sha256(convert_to(repeat('a',43),'UTF8')),'hex'));
end$$;

set local role authenticated;
select set_config('request.jwt.claims',current_setting('test.secondary_claims'),true);
select pg_temp.ok((select array_agg(symbol) from public.positions)=array['FIXTUREA'],
  'secondary connector sees only its owner through RLS');
select pg_temp.denied($$insert into public.watchlist_groups(name) values('forbidden')$$,'Authorized website write required');
select set_config('request.jwt.claims',(current_setting('test.secondary_claims')::jsonb||
  '{"scope":"portfolio:read"}'::jsonb)::text,true);
select pg_temp.denied($$select pg_temp.prepare_trade()$$,'Authenticated transaction-recording connection required');
select set_config('request.jwt.claims',(current_setting('test.secondary_claims')::jsonb||
  '{"aud":"https://secondary-client.test/api/web"}'::jsonb)::text,true);
select pg_temp.ok((select count(*)=0 from public.positions),'a secondary client must have the MCP audience');
select set_config('request.jwt.claims',current_setting('test.secondary_claims'),true);
select pg_temp.ok(pg_temp.prepare_trade()->>'status'='pending','scoped secondary transaction enters review');
select set_config('request.jwt.claims',current_setting('test.primary_claims'),true);
select pg_temp.ok((select array_agg(symbol) from public.positions)=array['FIXTUREA'],
  'the primary connector still has owner-scoped reads');
select pg_temp.denied($$select public.confirm_chat_transaction_proposal('a17689b1-aeef-488f-82e5-c397e8f17b91',repeat('a',43))$$,
  'Transaction review unavailable in this session');
select set_config('request.jwt.claims',current_setting('test.secondary_claims'),true);
select pg_temp.ok(public.confirm_chat_transaction_proposal('a17689b1-aeef-488f-82e5-c397e8f17b91',repeat('a',43))->>'applied'='true',
  'only the approved originating client can save the reviewed trade');
reset role;

set local role service_role;
select public.server_mcp_connection('connector-a','disconnect',1);
select pg_temp.ok(not public.server_better_auth_token_valid('connector-a','connector-session-a','livestocks-mcp-chatgpt',
  current_setting('test.primary_grant')::uuid),'disconnect immediately revokes the primary approval');
select pg_temp.ok(not public.server_better_auth_token_valid('connector-a','connector-session-a','livestocks-mcp-chatgpt-blue',
  current_setting('test.secondary_grant')::uuid),'disconnect immediately revokes the secondary approval');
select pg_temp.ok(public.server_better_auth_token_valid('connector-a','connector-session-a','fixture-website'),
  'disconnect preserves the browser session');
reset role;

select set_config('test.merge_job',(public.server_merge_create('https://secondary-client.test/api/auth','connector-a','connector-b',
  'ecbc9350-2cec-4fe4-9e7c-e8c9b1b13372')->>'id'),true);
select public.server_merge_proof(current_setting('test.merge_job')::uuid,'connector-a',
  repeat('a',64),floor(extract(epoch from clock_timestamp()))::bigint,repeat('1',64));
select public.server_merge_proof(current_setting('test.merge_job')::uuid,'connector-b',
  repeat('a',64),floor(extract(epoch from clock_timestamp()))::bigint,repeat('2',64));
select set_config('test.merge_preview',public.server_merge_preview(current_setting('test.merge_job')::uuid)::text,true);
select public.server_merge_freeze(current_setting('test.merge_job')::uuid,
  (current_setting('test.merge_preview')::jsonb->>'version')::bigint,current_setting('test.merge_preview')::jsonb->>'preview_hash','connector-a');
select pg_temp.ok((select count(*)=6 and count(*) filter(where client_id='livestocks-mcp-chatgpt-blue')=2
  from private.account_merge_revocations where job_id=current_setting('test.merge_job')::uuid),
  'merge freeze queues the website and both MCP clients for each identity');
select pg_temp.ok(not exists(select 1 from livestocks_auth.session where "userId" in ('connector-a','connector-b')),
  'merge freeze still revokes both users live sessions');
select pg_temp.ok(not exists(select 1 from private.oauth_approvals where user_id in ('connector-a','connector-b') and revoked_at is null),
  'merge freeze still revokes every durable approval');

rollback;
