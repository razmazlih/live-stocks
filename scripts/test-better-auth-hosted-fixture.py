#!/usr/bin/env python3
"""Verify the non-destructive hosted fixture with real Better Auth and local PG.

No .env loading, hosted URLs, external email delivery or existing DB reuse.
Requires native initdb/pg_ctl/psql and the repository's installed dependencies.
"""
import pathlib,tempfile,os,subprocess,socket,json,shutil,sys,signal
root=pathlib.Path(__file__).resolve().parent.parent;
if len(sys.argv)!=1: raise ValueError('Local-only runner accepts no arguments or database URLs')
run=pathlib.Path(tempfile.mkdtemp(prefix='livestocks-better-auth-native-'));run.chmod(0o700)
env={'PATH':os.environ['PATH'],'LC_ALL':'C'};started=False
def interrupted(_signum,_frame):raise InterruptedError('Cleaning up local provider runtime')
signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
def call(args):
 r=subprocess.run(args,env=env,capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stderr[-3000:])
 return r.stdout
s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close()
url=f'postgres://postgres@127.0.0.1:{port}/postgres?sslmode=disable'
def sql(q=None,path=None):return call(['psql',url,'-X','-q','-v','ON_ERROR_STOP=1']+(['-f',str(path)] if path else ['-c',q]))
try:
 call(['initdb','-D',str(run/'data'),'-U','postgres','--auth=trust','--no-locale','-E','UTF8'])
 call(['pg_ctl','-D',str(run/'data'),'-l',str(run/'postgres.log'),'-o',f"-h 127.0.0.1 -p {port} -c unix_socket_directories=''",'-w','start']);started=True
 sql("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth,public to anon,authenticated,service_role;")
 legacy=['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers']
 for table in legacy:sql(f"create table public.{table}(id integer primary key,label text);insert into public.{table} values(1,'untouched legacy sentinel');")
 before=sql("select tablename from pg_tables where schemaname='public' order by tablename")
 fixture=json.loads(call(['node','--input-type=module','-e',"import {buildHostedFixture} from './scripts/lib/better-auth-hosted-fixture.mjs';console.log(JSON.stringify(await buildHostedFixture(process.cwd())))"]))
 sql(fixture['sql'])
 if 'untouched legacy sentinel' not in sql('table public.positions'):raise RuntimeError('Legacy fixture changed')
 sql("insert into private.auth_config(singleton,issuer,website_client_id,mcp_client_id,website_audience,mcp_audience,auth_provider)values(true,'http://localhost:3109/api/auth','livestocks-web-local','livestocks-mcp-local','http://localhost:3109/api/web','http://localhost:3109/api/mcp','better_auth')")
 state={'runtime':str(run),'port':port,'adminDatabaseUrl':url,'backendDatabaseUrl':url.replace('postgres@','livestocks_auth_backend@'),'origin':'http://localhost:3109','websiteClientId':'livestocks-web-local','mcpClientId':'livestocks-mcp-local','productionAccess':False}
 output=run/'state.json';output.write_text(json.dumps(state));output.chmod(0o600)
 config=run/'vitest.config.mjs'
 config.write_text('export default '+json.dumps({'root':str(root),'envDir':False,'resolve':{'alias':{'@':str(root)}},'esbuild':{'jsx':'automatic'},'test':{'environment':'node','setupFiles':[str(root/'vitest.setup.ts')],'globals':True}}))
 test=subprocess.Popen(['node',str(root/'node_modules/vitest/vitest.mjs'),'run','__tests__/better-auth-postgres.test.ts','--config',str(config)],cwd=root,env=env|{'BETTER_AUTH_LOCAL_TEST_STATE':str(output),'PASSWORD_AUTH_ENABLED':'true'},text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
 try: test_stdout,test_stderr=test.communicate(timeout=120)
 except BaseException:
  os.killpg(test.pid,signal.SIGTERM)
  try:test.communicate(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(test.pid,signal.SIGKILL);test.communicate()
  raise
 if test.returncode:
  fd,log_path=tempfile.mkstemp(prefix='livestocks-provider-gate-failure-',suffix='.log')
  with os.fdopen(fd,'w') as log:log.write(test_stdout+test_stderr)
  print('Provider gate failed; protected synthetic diagnostics:',log_path,file=sys.stderr)
  raise RuntimeError('Local provider gate failed')
 sql("""do $$declare c jsonb;web jsonb;owner text;sid text;grantid uuid;n integer;begin
 select jsonb_build_object('sub',s."userId",'iss',cfg.issuer,'aud',cfg.website_audience,'azp',cfg.website_client_id,'role','authenticated','scope','portfolio:read portfolio:write','sid',s.id,'https://livestocks.app/auth_session_id',s.id,'https://livestocks.app/auth_session_created_at',floor(extract(epoch from s."createdAt"))::bigint,'https://livestocks.app/email_verified',true,'https://livestocks.app/read_only',false,'iat',floor(extract(epoch from now()))::bigint),s."userId",s.id into strict c,owner,sid from livestocks_auth.session s cross join private.auth_config cfg where s."expiresAt">now() limit 1;
 web:=c;perform set_config('request.jwt.claims',c::text,true);set local role authenticated;
 insert into public.livestocks_ba_gate_20261115(label)values('local synthetic owner');
 select count(*) into n from public.livestocks_ba_gate_20261115;if n<>1 then raise exception 'Fixture web visibility failed';end if;
 begin insert into public.livestocks_ba_gate_20261115(user_id,label)values('wrong-owner','denied');raise exception 'Cross-owner insert accepted';exception when insufficient_privilege then null;end;
 reset role;
 insert into private.mcp_connections(user_id)values(owner);
 select id into strict grantid from private.oauth_approvals where user_id=owner and session_id=sid and revoked_at is null limit 1;
 c:=c||jsonb_build_object('aud',(select mcp_audience from private.auth_config),'azp',(select mcp_client_id from private.auth_config),'scope','portfolio:read','https://livestocks.app/read_only',true,'https://livestocks.app/grant_id',grantid);
 perform set_config('request.jwt.claims',c::text,true);set local role authenticated;
 select count(*) into n from public.livestocks_ba_gate_20261115;if n<>1 then raise exception 'Fixture MCP read failed';end if;
 delete from public.livestocks_ba_gate_20261115;get diagnostics n=row_count;if n<>0 then raise exception 'Fixture MCP delete accepted';end if;
 begin insert into public.livestocks_ba_gate_20261115(label)values('denied');raise exception 'MCP insert accepted';exception when insufficient_privilege then null;end;
 reset role;perform private.revoke_oauth_approvals(owner,null,null);
 set local role authenticated;select count(*) into n from public.livestocks_ba_gate_20261115;if n<>0 then raise exception 'Revoked approval remained visible';end if;
 reset role;delete from livestocks_auth.session where id=sid;perform set_config('request.jwt.claims',web::text,true);
 set local role authenticated;select count(*) into n from public.livestocks_ba_gate_20261115;if n<>0 then raise exception 'Deleted session remained visible';end if;reset role;
 end$$;""")
 sql(fixture['cleanup'])
 for table in legacy:
  if 'untouched legacy sentinel' not in sql('table public.'+table):raise RuntimeError('Legacy fixture changed during cleanup')
 if sql("select tablename from pg_tables where schemaname='public' order by tablename")!=before:raise RuntimeError('Existing table inventory changed')
 print('PASS isolated fixture provider, native limited role, signed JWTs/PKCE/refresh, existing table preservation and fixture cleanup')
finally:
 signal.signal(signal.SIGTERM,signal.SIG_IGN);signal.signal(signal.SIGINT,signal.SIG_IGN)
 if started:
  try:call(['pg_ctl','-D',str(run/'data'),'-m','immediate','-w','-t','30','stop'])
  except Exception:
   print('Shutdown not confirmed; retained synthetic runtime:',run,file=sys.stderr)
   raise
 shutil.rmtree(run)
 print('PASS local runtime cleanup; no production access')
