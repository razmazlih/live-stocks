-- Synthetic, real-role regression. Never run against a hosted database.
\set ON_ERROR_STOP on
begin;
insert into private.auth_config values(true,'https://merge.test/','web','mcp','https://merge.test/api/web','https://merge.test/api/mcp')
on conflict(singleton) do update set issuer=excluded.issuer,website_client_id=excluded.website_client_id,mcp_client_id=excluded.mcp_client_id,website_audience=excluded.website_audience,mcp_audience=excluded.mcp_audience;
create function pg_temp.ok(v boolean,m text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERT %',m;end if;end$$;
create function pg_temp.denied(q text) returns void language plpgsql as $$begin
 begin execute q;exception when others then return;end;
 raise exception 'Unexpected success: %',q;
end$$;
create function pg_temp.claims(subject text,origin bigint default null) returns jsonb language sql as $$
 select jsonb_build_object('iss','https://merge.test/','sub',subject,'azp','web','aud','https://merge.test/api/web','role','authenticated','scope','portfolio:read portfolio:write','iat',coalesce(origin,1000),'https://livestocks.app/read_only',false,'https://livestocks.app/email_verified',true)
 ||case when origin is null then '{}'::jsonb else jsonb_build_object('https://livestocks.app/auth_session_id','synthetic-session','https://livestocks.app/auth_session_created_at',origin) end;
$$;
set local role service_role;
select public.server_identity_resolve('https://merge.test/','auth0|merge-a',repeat('a',64));
select public.server_identity_resolve('https://merge.test/','google|merge-b',repeat('a',64));
select public.server_identity_resolve('https://merge.test/','auth0|merge-c',repeat('b',64));
select public.server_bootstrap_web_account('https://merge.test/','auth0|merge-a');
select public.server_bootstrap_web_account('https://merge.test/','google|merge-b');
select public.server_bootstrap_web_account('https://merge.test/','auth0|merge-c');
select pg_temp.denied($q$select public.server_identity_resolve('https://evil.test/','auth0|new')$q$);
reset role;
update public.user_profiles set primary_pinned=true where id='auth0|merge-a';
insert into public.positions(id,user_id,symbol,display,image_url,entry_price,quantity,entry_date,location,created_at,updated_at) values
 ('a0000000-0000-4000-8000-000000000001','auth0|merge-a','SAME','A','','10',10,'2020-01-01','bank_one','2020-01-01Z','2020-02-01Z'),
 ('b0000000-0000-4000-8000-000000000001','google|merge-b',' same ','B','','20',20,'2020-01-02','bank_one','2020-01-02Z','2020-02-02Z'),
 ('b0000000-0000-4000-8000-000000000002','google|merge-b','SAME','B bank two','','30',30,'2020-01-03','bank_two','2020-01-03Z','2020-02-03Z'),
 ('c0000000-0000-4000-8000-000000000001','auth0|merge-c','OTHER','C','','40',40,'2020-01-04','bank_one','2020-01-04Z','2020-02-04Z');
insert into public.position_lots(id,user_id,position_id,side,price,quantity,executed_at,created_at,updated_at) values
 ('a1000000-0000-4000-8000-000000000001','auth0|merge-a','a0000000-0000-4000-8000-000000000001','BUY',10,10,'2020-01-01','2020-01-01Z','2020-02-01Z'),
 ('a1000000-0000-4000-8000-000000000002','auth0|merge-a','a0000000-0000-4000-8000-000000000001','SELL',30,3,'2020-01-03','2020-01-03Z','2020-02-03Z'),
 ('b1000000-0000-4000-8000-000000000001','google|merge-b','b0000000-0000-4000-8000-000000000001','BUY',20,20,'2020-01-02','2020-01-02Z','2020-02-02Z'),
 ('b1000000-0000-4000-8000-000000000002','google|merge-b','b0000000-0000-4000-8000-000000000001','SELL',40,5,'2020-01-04','2020-01-04Z','2020-02-04Z');
insert into public.position_plans(user_id,position_id,symbol,target_price,target_quantity,target_date)
 values('google|merge-b','b0000000-0000-4000-8000-000000000001','SAME',50,1,'2030-01-01'),('auth0|merge-a',null,'FUTURE',60,2,'2030-01-02');
update public.settings set currency='ILS',annual_growth_rate=.12 where user_id='google|merge-b';
insert into public.watchlist_groups(id,user_id,name) values('a2000000-0000-4000-8000-000000000001','auth0|merge-a','Same group'),('b2000000-0000-4000-8000-000000000001','google|merge-b','Same group');
insert into public.watchlist_tickers(user_id,group_id,symbol) values('auth0|merge-a','a2000000-0000-4000-8000-000000000001','SAME'),('google|merge-b','b2000000-0000-4000-8000-000000000001','SAME');
insert into private.user_credentials(user_id,encrypted_value) values('auth0|merge-a','v1.oldA.iv.tag'),('google|merge-b','v1.oldB.iv.tag');
create temp table merge_fixture(stage text primary key,value jsonb);
create function pg_temp.snapshot() returns jsonb language sql as $$select jsonb_build_object(
 'positions',(select jsonb_agg(to_jsonb(p) order by p.id) from public.positions p where user_id in('auth0|merge-a','google|merge-b')),
 'position_lots',(select jsonb_agg(to_jsonb(l) order by l.id) from public.position_lots l where user_id in('auth0|merge-a','google|merge-b')))$$;
insert into merge_fixture values('before',pg_temp.snapshot());
select set_config('test.before_manifest',private.merge_manifest('auth0|merge-a','google|merge-b')::text,true);
set local role service_role;
select public.server_widget_tokens('auth0|merge-a','create',null,'Synthetic',repeat('a',64));
select public.server_widget_tokens('google|merge-b','create',null,'Synthetic',repeat('b',64));
select public.server_mcp_connection('auth0|merge-a','bootstrap',1);
select public.server_mcp_connection('google|merge-b','bootstrap',1);
select pg_temp.denied($q$select public.server_merge_create('https://merge.test/','auth0|merge-a','auth0|merge-c','00000000-0000-4000-8000-000000000001')$q$);
select set_config('test.job',(public.server_merge_create('https://merge.test/','auth0|merge-a','google|merge-b','00000000-0000-4000-8000-000000000002')->>'id'),true);
select pg_temp.ok(public.server_merge_create('https://merge.test/','auth0|merge-a','google|merge-b','00000000-0000-4000-8000-000000000002')->>'id'=current_setting('test.job'),'create retry stable');
select pg_temp.denied($q$select public.server_merge_preview(current_setting('test.job')::uuid)$q$);
select pg_temp.denied($q$select public.server_merge_proof(current_setting('test.job')::uuid,'google|merge-b',repeat('b',64),floor(extract(epoch from clock_timestamp()))::bigint,repeat('1',64))$q$);
select public.server_merge_proof(current_setting('test.job')::uuid,'auth0|merge-a',repeat('a',64),floor(extract(epoch from clock_timestamp()))::bigint,repeat('1',64));
select pg_temp.denied($q$select public.server_merge_proof(current_setting('test.job')::uuid,'google|merge-b',repeat('a',64),floor(extract(epoch from clock_timestamp()))::bigint,repeat('1',64))$q$);
select public.server_merge_proof(current_setting('test.job')::uuid,'google|merge-b',repeat('a',64),floor(extract(epoch from clock_timestamp()))::bigint,repeat('2',64));
select set_config('test.preview',public.server_merge_preview(current_setting('test.job')::uuid)::text,true);
select pg_temp.ok((current_setting('test.preview')::jsonb)->>'primary_profile_id'='auth0|merge-a','pinned primary stable');
select pg_temp.ok((current_setting('test.preview')::jsonb)->'counts'->>'positions'='3','all banks retained');
select pg_temp.denied($q$select public.server_merge_freeze(current_setting('test.job')::uuid,999,'bad','auth0|merge-a','google|merge-b')$q$);
select public.server_merge_freeze(current_setting('test.job')::uuid,(current_setting('test.preview')::jsonb->>'version')::bigint,current_setting('test.preview')::jsonb->>'preview_hash','google|merge-b','google|merge-b');
select pg_temp.denied($q$select public.server_set_credentials('auth0|merge-a','changed')$q$);
select pg_temp.denied($q$select public.server_mcp_connection('google|merge-b','reconnect',0)$q$);
select pg_temp.denied($q$select public.server_widget_tokens('auth0|merge-a','create',null,'No',repeat('c',64))$q$);
select pg_temp.ok(public.server_widget_snapshot(repeat('a',64)) is null,'widget revoked before transfer');
select pg_temp.ok(public.server_identity_resolve('https://merge.test/','auth0|merge-a')->>'state'='blocked','frozen identity blocked');
select set_config('test.secret',public.server_merge_secret_material(current_setting('test.job')::uuid)::text,true);
select pg_temp.denied($q$select public.server_merge_prepare(current_setting('test.job')::uuid,'v1.new.iv.tag','wrong')$q$);
reset role;
set local role authenticated;
select set_config('request.jwt.claims',pg_temp.claims('google|merge-b')::text,true);
select pg_temp.ok((select count(*)=0 from public.positions),'frozen RLS denies reads');
select pg_temp.denied($q$select public.record_position_purchase(gen_random_uuid(),'NO','NO','','bank_one',1,1,current_date)$q$);
select pg_temp.denied($q$select public.server_merge_prepare(current_setting('test.job')::uuid)$q$);
reset role;
-- The executor cannot DELETE a financial row, or modify quantities/timestamps.
set local role livestocks_merge_executor;
select pg_temp.denied($q$delete from public.position_lots where user_id='auth0|merge-a'$q$);
select pg_temp.denied($q$update public.positions set quantity=999 where user_id='auth0|merge-a'$q$);
reset role;
savepoint injected_rollback;
set local role service_role;
select public.server_merge_prepare(current_setting('test.job')::uuid,'v1.new.iv.tag',current_setting('test.secret')::jsonb->>'credential_version');
reset role;
rollback to savepoint injected_rollback;
select pg_temp.ok(private.merge_manifest('auth0|merge-a','google|merge-b')=current_setting('test.before_manifest')::jsonb,'rolled back preparation preserves exact business data');
select pg_temp.ok((select merge_state='frozen' from public.user_profiles where id='google|merge-b'),'rollback retains committed freeze boundary');
select pg_temp.ok((select count(*)=0 from private.account_merge_row_history),'rollback removes partial archives');
set local role service_role;
select public.server_merge_prepare(current_setting('test.job')::uuid,'v1.new.iv.tag',current_setting('test.secret')::jsonb->>'credential_version');
select public.server_merge_prepare(current_setting('test.job')::uuid); -- idempotent retry
select pg_temp.denied($q$select public.server_merge_finish(current_setting('test.job')::uuid,'{"revoked":[]}')$q$);
reset role;
select pg_temp.ok(private.merge_manifest('auth0|merge-a','google|merge-b')=current_setting('test.before_manifest')::jsonb,'all IDs values timestamps and parents preserved');
select pg_temp.ok((select count(*)=0 from public.positions where user_id='google|merge-b'),'physical transfer complete');
select pg_temp.ok((select consolidated_into_position_id='a0000000-0000-4000-8000-000000000001' from public.positions where id='b0000000-0000-4000-8000-000000000001'),'duplicate retained as separate ledger');
select pg_temp.ok((select count(*)=2 from public.settings where user_id='auth0|merge-a'),'both settings retained');
select pg_temp.ok((select currency='ILS' from public.settings where user_id='auth0|merge-a' and is_active),'chosen settings active');
select pg_temp.ok((select count(*)=2 from private.account_merge_credential_history),'both ciphertext AAD archives retained');
select pg_temp.ok((select count(*)=15 from private.account_merge_row_history),'all six tables archived once');
select pg_temp.ok((select count(*)=4 from private.account_merge_revocations),'both subjects and clients queued');
insert into merge_fixture values('after',pg_temp.snapshot());
select set_config('test.receipt',(select jsonb_build_object('revoked',jsonb_agg(jsonb_build_object('subject',subject,'client_id',client_id,'verified_at',clock_timestamp()))) from private.account_merge_revocations)::text,true);
set local role service_role;
select public.server_merge_finish(current_setting('test.job')::uuid,current_setting('test.receipt')::jsonb);
select public.server_merge_finish(current_setting('test.job')::uuid,'{}');
select pg_temp.ok(public.server_identity_resolve('https://merge.test/','google|merge-b')->>'state'='reauthentication_required','missing origin rejects merged resolver');
reset role;
select set_config('test.cutoff',(select min_auth_session_created_at::text from public.user_profiles where id='auth0|merge-a'),true);
set local role authenticated;
select set_config('request.jwt.claims',pg_temp.claims('auth0|merge-a')::text,true);
select pg_temp.ok((select count(*)=0 from public.positions),'old primary JWT cannot inherit combined portfolio');
select set_config('request.jwt.claims',pg_temp.claims('google|merge-b',current_setting('test.cutoff')::bigint)::text,true);
select pg_temp.ok((select count(*)=0 from public.positions),'origin at cutoff rejected');
select set_config('request.jwt.claims',pg_temp.claims('google|merge-b',current_setting('test.cutoff')::bigint+1)::text,true);
select pg_temp.ok((select count(*)=3 from public.positions),'fresh secondary resolves all combined ledgers');
select pg_temp.ok((select count(*)=1 from public.settings),'inactive settings hidden');
select pg_temp.ok((select count(*)=4 from public.position_lots),'lots retain independent parents');
select pg_temp.ok((select position_id='b0000000-0000-4000-8000-000000000001' from public.record_position_purchase('b1000000-0000-4000-8000-000000000001','SAME','old B','','bank_one',20,20,'2020-01-02',true,8)),'old request returns original secondary ledger');
select pg_temp.ok((select position_id='a0000000-0000-4000-8000-000000000001' from public.record_position_purchase('d1000000-0000-4000-8000-000000000001','SAME','new','','bank_one',50,2,'2026-01-01')),'new request selects partial-index canonical target');
select set_config('request.jwt.claims',pg_temp.claims('auth0|merge-c')::text,true);
select pg_temp.ok((select count(*)=1 from public.positions),'unrelated account remains isolated');
reset role;
select pg_temp.ok(not exists(select 1 from private.mcp_connections where user_id in('auth0|merge-a','google|merge-b') and enabled),'MCP still requires explicit fresh reconnect');
select pg_temp.ok(not exists(select 1 from private.widget_tokens where revoked_at is null),'widgets remain revoked');
select 'MERGE_FIXTURE:'||jsonb_object_agg(stage,value)::text from merge_fixture;
rollback;
