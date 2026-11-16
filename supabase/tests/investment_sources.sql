-- Synthetic-only regression. Execute after all migrations; never against a hosted DB.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(v boolean,m text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERT %',m;end if;end$$;
create function pg_temp.denied(q text) returns void language plpgsql as $$begin begin execute q;exception when others then return;end;raise exception 'Unexpected success: %',q;end$$;
insert into private.auth_config(singleton,issuer,website_client_id,mcp_client_id,website_audience,mcp_audience,auth_provider)
 values(true,'https://sources.test/','web','mcp','web-audience','mcp-audience','auth0')
 on conflict(singleton) do update set issuer=excluded.issuer,website_client_id=excluded.website_client_id,mcp_client_id=excluded.mcp_client_id,website_audience=excluded.website_audience,mcp_audience=excluded.mcp_audience,auth_provider='auth0';
select public.server_identity_resolve('https://sources.test/','sources-test-a');
select public.server_identity_resolve('https://sources.test/','sources-test-b');
select public.server_bootstrap_web_account('https://sources.test/','sources-test-a');
select public.server_bootstrap_web_account('https://sources.test/','sources-test-b');
select pg_temp.ok((select count(*)=1 and min(name)='מקור ראשי' from public.investment_sources where user_id='sources-test-a'),'one initial source');
select set_config('request.jwt.claims',jsonb_build_object('iss','https://sources.test/','sub','sources-test-a','azp','web','aud','web-audience','role','authenticated','scope','portfolio:read portfolio:write','iat',1000,'https://livestocks.app/read_only',false,'https://livestocks.app/email_verified',true)::text,true);
set local role authenticated;
select pg_temp.ok((select count(*)=1 from public.investment_sources),'source read isolation');
insert into public.investment_sources(name) values('  בית השקעות  '),('בנק נוסף');
select pg_temp.ok((select count(*)=3 from public.investment_sources),'three arbitrary sources');
select pg_temp.denied($q$insert into public.investment_sources(name)values('בית השקעות')$q$);
select pg_temp.denied($q$insert into public.investment_sources(name)values('  ')$q$);
select pg_temp.denied($q$insert into public.investment_sources(name)values(repeat('א',81))$q$);
select pg_temp.denied($q$update public.investment_sources set user_id='sources-test-b'$q$);
select pg_temp.denied($q$delete from public.investment_sources$q$);
select * from public.record_position_purchase('71000000-0000-4000-8000-000000000001','SAME','Same','',(select id from public.investment_sources where name='בית השקעות'),10,3,'2026-01-01');
select * from public.record_position_purchase('71000000-0000-4000-8000-000000000001','SAME','Same','',(select id from public.investment_sources where name='בית השקעות'),10,3,'2026-01-01');
select * from public.record_position_purchase('71000000-0000-4000-8000-000000000002','SAME','Same','',(select id from public.investment_sources where name='בנק נוסף'),20,4,'2026-01-01');
select pg_temp.ok((select count(*)=2 from public.positions where symbol='SAME'),'same symbol stays separate by source and retry is idempotent');
select pg_temp.denied($q$update public.investment_sources set archived_at=now() where name='בית השקעות'$q$);
insert into public.position_lots(position_id,side,price,quantity,executed_at) select id,'SELL',12,3,'2026-02-01' from public.positions where location=(select id from public.investment_sources where name='בית השקעות');
-- positions.quantity remains stale (3); actual lots are closed.
update public.investment_sources set archived_at=now() where name='בית השקעות';
select pg_temp.ok((select archived_at is not null from public.investment_sources where name='בית השקעות'),'archive computes lots instead of stale row quantity');
select pg_temp.denied($q$select public.record_position_purchase(gen_random_uuid(),'NEW','New','',(select id from public.investment_sources where name='בית השקעות'),10,1,'2026-03-01')$q$);
-- An existing successful request can still replay after archive.
select * from public.record_position_purchase('71000000-0000-4000-8000-000000000001','SAME','Same','',(select id from public.investment_sources where name='בית השקעות'),10,3,'2026-01-01');
update public.investment_sources set archived_at=null,name='בית השקעות חדש' where name='בית השקעות';
insert into public.position_lots(position_id,side,price,quantity,executed_at,basis_acquired_on,has_commission,commission_amount) select id,'RECONCILE',0,0,'2026-03-01',null,false,0 from public.positions where location=(select id from public.investment_sources where name='בנק נוסף');
update public.investment_sources set archived_at=now() where name='בנק נוסף';
select pg_temp.ok((select archived_at is not null from public.investment_sources where name='בנק נוסף'),'zero reconciliation closes actual balance');
insert into public.position_plans(symbol,target_price,target_quantity,target_date,location)values('PLAN',10,2,'2027-01-01',(select id from public.investment_sources where name='בית השקעות חדש'));
select pg_temp.denied($q$update public.investment_sources set archived_at=now() where name='בית השקעות חדש'$q$);
update public.position_plans set status='cancelled' where symbol='PLAN';
update public.investment_sources set archived_at=now() where name='בית השקעות חדש';
select pg_temp.denied($q$update public.investment_sources set archived_at=now() where name='מקור ראשי'$q$);
select pg_temp.denied($q$update public.position_plans set status='pending' where symbol='PLAN'$q$);
select pg_temp.denied($q$update public.positions set quantity=quantity+1 where location=(select id from public.investment_sources where name='בית השקעות חדש')$q$);
select pg_temp.ok(jsonb_array_length(public.screenshot_sync_snapshot()->'sources')=3,'snapshot contains complete source catalog');
reset role;
-- Foreign sources are rejected by SQL even when UUIDs are known.
select id as foreign_source from public.investment_sources where user_id='sources-test-b' \gset
set local role authenticated;
select pg_temp.denied(format('select public.record_position_purchase(gen_random_uuid(),''FOREIGN'',''Foreign'','''',%L::uuid,10,1,''2026-01-01'')',:'foreign_source'));
reset role;
-- Merge uses the real restricted executor, preserves source IDs, and disambiguates duplicate names.
update public.user_profiles set merge_state='frozen' where id in('sources-test-a','sources-test-b');
insert into private.account_merge_jobs(id,request_id,issuer,actor_subject,other_subject,primary_profile_id,secondary_profile_id,state,frozen_at,before_manifest,settings_source_profile_id)
 values('72000000-0000-4000-8000-000000000001',gen_random_uuid(),'https://sources.test/','sources-test-a','sources-test-b','sources-test-a','sources-test-b','frozen',now(),private.merge_manifest('sources-test-a','sources-test-b'),'sources-test-a');
create temporary table source_ids_before as select id from public.investment_sources where user_id in('sources-test-a','sources-test-b');
set local role service_role;
select public.server_merge_prepare('72000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.ok((select count(*)=4 from public.investment_sources where user_id='sources-test-a'),'merge transfers every independent source');
select pg_temp.ok(not exists(select id from source_ids_before except select id from public.investment_sources),'merge preserves source UUIDs');
select pg_temp.ok(not exists(select 1 from public.investment_sources where user_id='sources-test-b'),'secondary source ownership transferred');
select pg_temp.ok((select count(*)=4 from private.account_merge_row_history where table_name='investment_sources'),'merge keeps original source records');
rollback;
