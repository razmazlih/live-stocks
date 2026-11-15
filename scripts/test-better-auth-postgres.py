#!/usr/bin/env python3
"""Run the real Better Auth handler gate using a disposable local-only PostgreSQL.

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
 for migration in sorted((root/'supabase/migrations').glob('*.sql')):sql(path=migration)
 sql("insert into private.auth_config(singleton,issuer,website_client_id,mcp_client_id,website_audience,mcp_audience,auth_provider)values(true,'http://localhost:3109/api/auth','livestocks-web-local','livestocks-mcp-local','http://localhost:3109/api/web','http://localhost:3109/api/mcp','better_auth')")
 state={'runtime':str(run),'port':port,'adminDatabaseUrl':url,'backendDatabaseUrl':url.replace('postgres@','livestocks_auth_backend@'),'origin':'http://localhost:3109','websiteClientId':'livestocks-web-local','mcpClientId':'livestocks-mcp-local','productionAccess':False}
 output=run/'state.json';output.write_text(json.dumps(state));output.chmod(0o600)
 config=run/'vitest.config.mjs'
 config.write_text('export default '+json.dumps({'root':str(root),'envDir':False,'resolve':{'alias':{'@':str(root)}},'esbuild':{'jsx':'automatic'},'test':{'environment':'node','setupFiles':[str(root/'vitest.setup.ts')],'globals':True}}))
 test=subprocess.Popen(['node',str(root/'node_modules/vitest/vitest.mjs'),'run','__tests__/better-auth-postgres.test.ts','__tests__/sign-in-methods-postgres.test.ts','--config',str(config)],cwd=root,env=env|{'BETTER_AUTH_LOCAL_TEST_STATE':str(output)},text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
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
 print('PASS actual Better Auth handler, limited PostgreSQL role, web/MCP JWTs, resource/PKCE/refresh/session boundaries')
finally:
 signal.signal(signal.SIGTERM,signal.SIG_IGN);signal.signal(signal.SIGINT,signal.SIG_IGN)
 if started:
  try:call(['pg_ctl','-D',str(run/'data'),'-m','immediate','-w','-t','30','stop'])
  except Exception:
   print('Shutdown not confirmed; retained synthetic runtime:',run,file=sys.stderr)
   raise
 shutil.rmtree(run)
 print('PASS local runtime cleanup; no production access')
