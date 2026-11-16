#!/usr/bin/env node
/** Actual Auth0 tokens -> disposable local PostgREST -> real PostgreSQL RLS.
 * No hosted database/provider writes. No .env loading. Never a hosted-gateway proof.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { closeSync, openSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createLocalJWKSet } from 'jose';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const issuer = 'https://dev-c8o5jwbmbzkzac2s.us.auth0.com/';
const version = '16.5';
const archiveSha256 = 'd8095cb439de0a3151036df542139e7afca5cebb109ce7f1bae52b3a97e9846a';
const archiveUrl = 'https://github.com/PostgREST/postgrest/releases/download/v16.5/postgrest-v16.5-macos-aarch64.tar.xz';
const cleanEnv = { PATH: process.env.PATH, LC_ALL: 'C', PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null', PGCONNECT_TIMEOUT: '5' };
const tableNames = ['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'];
const report = { generatedAt: new Date().toISOString(), environment: 'LOCAL_REST_WITH_REAL_AUTH0', status: 'INCOMPLETE',
  hostedSupabaseGatewayVerified: false, providerWrites: false, hostedDatabaseWrites: false,
  limitations: ['Does not prove hosted Supabase third-party gateway acceptance.',
    'Consumes existing signed Auth0 tokens; does not test login, consent, refresh or real ChatGPT host authorization.',
    'Reconnect cutoff is tested with the existing token; issuance of a newer token is a separate provider test.'], cases: [] };
let phase = 'input'; let runtime; let pgDirectory; let postgrest; let stopped;
let cancelled = false; let dbUrl; let restUrl;
let postgrestEnv=cleanEnv;
class GateError extends Error {}
function check(value, message) { if (!value) throw new GateError(message); }
function command(binary, args, options = {}) {
  if (cancelled) throw new GateError('Interrupted');
  try { return execFileSync(binary,args,{ env:cleanEnv,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60_000,...options }); }
  catch { throw new GateError(`${binary} failed; raw output suppressed`); }
}
function literal(value) { return `'${value.replaceAll("'","''")}'`; }
function sql(query) { return command('psql',[dbUrl,'-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-c',query]); }
function record(name, evidence = {}) { report.cases.push({name,result:'PASS',...evidence}); }
async function freePort() {
  const server=createServer();
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
  const port=server.address().port;
  await new Promise((ok,bad)=>server.close(error=>error?bad(error):ok()));
  return port;
}
async function fetchJson(url) {
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20_000)});
  check(response.ok,'Trusted HTTPS metadata fetch failed'); return response.json();
}
async function loadTokens(path) {
  const actual=await realpath(path); const repository=await realpath(root);
  for(const candidate of [resolve(path),actual]) {
    const rel=relative(repository,candidate);
    check(rel.startsWith(`..${sep}`)||rel==='..','Token input must be outside the repository');
  }
  const stat=await lstat(actual);
  check(stat.isFile() && (stat.mode&0o077)===0 && stat.uid===process.getuid(),'Token input must be a private file owned by the current user');
  check(stat.size<1_000_000,'Token input is unexpectedly large');
  const input=JSON.parse(await readFile(actual,'utf8')); const config=input.config;
  check(config?.issuer===issuer,'Expected the explicitly selected Auth0 tenant issuer');
  const source=await readFile(join(root,'lib/auth/auth0-token.ts'),'utf8');
  // Run the actual application verifier without maintaining a second claim policy.
  const javascript=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
    .replace(/from\s+(['"])jose\1/g,`from ${JSON.stringify(import.meta.resolve('jose'))}`);
  const {createAuth0TokenVerifier}=await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
  const jwks=await fetchJson(new URL('.well-known/jwks.json',issuer));
  const verify=createAuth0TokenVerifier({...config,jwks:createLocalJWKSet(jwks)});
  const a=await verify(input.webAToken,'web'); const b=await verify(input.webBToken,'web');
  const mcp=input.mcpAToken?await verify(input.mcpAToken,'mcp'):null;
  check(a.userId!==b.userId && (!mcp||a.userId===mcp.userId),'Require two distinct users and matching website/MCP owner A');
  check(Math.min(a.expiresAt,b.expiresAt,mcp?.expiresAt??Infinity)>Date.now()/1000+120,'Provide fresh tokens with at least two minutes remaining');
  return {input,config,jwks,a,b,mcp};
}
async function binary() {
  check(process.platform==='darwin'&&process.arch==='arm64','Pinned official native binary supports macOS ARM64 only');
  const response=await fetch(archiveUrl,{signal:AbortSignal.timeout(60_000)});
  check(response.ok,'Official PostgREST archive download failed');
  const archive=Buffer.from(await response.arrayBuffer());
  check(createHash('sha256').update(archive).digest('hex')===archiveSha256,'Official PostgREST archive checksum mismatch');
  const path=join(runtime,'postgrest.tar.xz');await writeFile(path,archive,{mode:0o600});
  const entries=command('tar',['-tJf',path]).trim().split('\n');
  check(entries.every(name=>!name.startsWith('/')&&!name.split('/').includes('..')),'Unsafe archive path');
  command('tar',['-xJf',path,'-C',runtime]);
  const entry=entries.find(name=>/(^|\/)postgrest$/.test(name));check(entry,'Archive has no PostgREST executable');
  const executable=join(runtime,entry);await chmod(executable,0o700);
  // Use the existing ABI-compatible libpq only for this child process. No
  // Homebrew installation, global symlink, or official binary modification.
  const libdir=await realpath(command('pg_config',['--libdir']).trim());
  await lstat(join(libdir,'libpq.5.dylib'));
  postgrestEnv={...cleanEnv,DYLD_LIBRARY_PATH:libdir};
  const actualVersion=command(executable,['--version'],{env:postgrestEnv}).trim();check(/\b16\.5\b/.test(actualVersion),'Unexpected PostgREST version');
  report.postgrest={version,archiveSha256,binarySha256:createHash('sha256').update(await readFile(executable)).digest('hex')};
  report.postgresClient=command('pg_config',['--version']).trim();
  return executable;
}
async function request(path,token,method='GET',body) {
  if(cancelled)throw new GateError('Interrupted');
  const headers={'Content-Type':'application/json','Prefer':'return=representation'};
  if(token)headers.Authorization=`Bearer ${token}`;
  const response=await fetch(`${restUrl}/${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10_000)});
  let data;try{data=await response.json();}catch{data=null;}
  check(response.status<500,'Local REST infrastructure returned an error');
  return {ok:response.ok,status:response.status,data};
}
function one(response,message) {check(response.ok&&Array.isArray(response.data)&&response.data.length===1,message);return response.data[0];}
function empty(response,message) {check(response.ok&&Array.isArray(response.data)&&response.data.length===0,message);}
function denied(response,message) {check(response.status===403&&response.data?.code==='42501',message);}

async function main() {
  if(process.argv.includes('--help')){
    console.log('Local-only real Auth0 REST gate: node scripts/test-auth0-rest.mjs --tokens /private/path/tokens.json\n'
      +'Input JSON (mode0600 outside repository): {webAToken,webBToken,mcpAToken,config:{issuer,websiteClientId,mcpClientId,websiteAudience,mcpAudience}}.\n'
      +'Uses existing actual Auth0 tokens, pinned official native PostgREST, a fresh local PostgreSQL cluster and synthetic data only.\n'
      +'Requires macOS ARM64 and native initdb/pg_ctl/psql/tar. No .env loading or hosted mutations.\n'
      +'If mcpAToken is omitted, website cases run but the overall result remains INCOMPLETE.\n'
      +'Sanitized report: output/auth0-rest/latest.json. Hosted Supabase gateway remains unverified.');return;
  }
  check(process.argv.length===4&&process.argv[2]==='--tokens','Provide only --tokens with the protected JSON file path');
  process.umask(0o077);
  const reportPath=join(root,'output/auth0-rest/latest.json');
  await mkdir(dirname(reportPath),{recursive:true});
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  try {
    const {input,config,jwks,a,b,mcp}=await loadTokens(process.argv[3]);
    report.auth0={issuer:config.issuer,websiteClientId:config.websiteClientId,mcpClientId:config.mcpClientId,
      websiteAudience:config.websiteAudience,mcpAudience:config.mcpAudience};
    record('actual_auth0_signatures_and_exact_application_claims',{distinctUsers:true,matchedMcpOwner:Boolean(mcp),mcpTokenVerified:Boolean(mcp),literalAuthenticatedRole:true});
    runtime=await mkdtemp('/private/tmp/livestocks-auth0-rest-');pgDirectory=join(runtime,'postgres');
    phase='native_runtime'; const executable=await binary();
    const pgPort=await freePort();const restPort=await freePort();
    check(pgPort!==restPort,'Fresh local ports collided; rerun');
    dbUrl=`postgres://postgres@127.0.0.1:${pgPort}/postgres?hostaddr=127.0.0.1&sslmode=disable`;
    restUrl=`http://127.0.0.1:${restPort}`;
    command('initdb',['-D',pgDirectory,'-U','postgres','--auth=trust','--no-locale','-E','UTF8']);
    command('pg_ctl',['-D',pgDirectory,'-l',join(runtime,'postgres.log'),'-o',`-h 127.0.0.1 -p ${pgPort} -c unix_socket_directories=''`,'-w','-t','30','start']);
    sql("create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;"
      +"create role authenticator login noinherit nosuperuser nobypassrls nocreatedb nocreaterole;grant anon,authenticated to authenticator;"
      +"create schema auth;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;"
      +"grant usage on schema auth,public to anon,authenticated,service_role;");
    phase='migrations';
    for(const file of (await readdir(join(root,'supabase/migrations'))).filter(file=>file.endsWith('.sql')).sort()) {
      command('psql',[dbUrl,'-X','-q','-v','ON_ERROR_STOP=1','-f',join(root,'supabase/migrations',file)]);
    }
    const instance=randomBytes(16).toString('hex');
    sql(`insert into private.auth_config(issuer,website_client_id,mcp_client_id,website_audience,mcp_audience) values(${[config.issuer,config.websiteClientId,config.mcpClientId,config.websiteAudience,config.mcpAudience].map(literal).join(',')});`
      +`create function public.gate_identity() returns jsonb language sql stable security invoker set search_path='' as $$select jsonb_build_object('instance','${instance}','role',current_user,'subject',auth.jwt()->>'sub')$$;`
      +'revoke all on function public.gate_identity() from public;grant execute on function public.gate_identity() to anon,authenticated;');
    check(sql("select not rolsuper and not rolbypassrls and not rolinherit and not pg_has_role('authenticator','service_role','MEMBER') from pg_roles where rolname='authenticator'").trim()==='t','Authenticator must not bypass database authorization');
    phase='postgrest_startup';
    const logFd=openSync(join(runtime,'postgrest.log'),'a',0o600);
    postgrest=spawn(executable,[],{cwd:runtime,env:{...postgrestEnv,
      PGRST_DB_URI:`postgres://authenticator@127.0.0.1:${pgPort}/postgres?hostaddr=127.0.0.1&sslmode=disable`,
      PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_DB_CONFIG:'false',
      PGRST_JWT_SECRET:JSON.stringify(jwks),PGRST_JWT_ROLE_CLAIM_KEY:'.role',
      PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(restPort),PGRST_LOG_LEVEL:'error',PGRST_OPENAPI_MODE:'disabled',
    },stdio:['ignore',logFd,logFd]});closeSync(logFd);
    stopped=new Promise(resolveExit=>postgrest.once('exit',resolveExit));
    let spawnFailed=false;postgrest.once('error',()=>{spawnFailed=true;});
    let ready=false;
    for(let attempt=0;attempt<60;attempt++) {
      if(postgrest.exitCode!==null||spawnFailed)break;
      try {const result=await request('rpc/gate_identity',null,'POST',{});if(result.ok&&result.data?.instance===instance&&result.data.role==='anon'){ready=true;break;}}catch{}
      await delay(250);
    }
    check(ready,'Official local PostgREST did not become ready');
    const identityCases=[['web_a',input.webAToken,a],['web_b',input.webBToken,b]];
    if(mcp)identityCases.push(['mcp_a',input.mcpAToken,mcp]);
    for(const [name,token,owner] of identityCases) {
      const identity=await request('rpc/gate_identity',token,'POST',{});
      check(identity.ok&&identity.data?.instance===instance&&identity.data.role==='authenticated'&&identity.data.subject===owner.userId,'Actual token failed direct PostgREST role/subject mapping');
      record(`${name}_direct_rest_signature_and_role`,{databaseRole:'authenticated'});
    }
    phase='web_fixtures'; const fixtures=[];
    for(const [token,owner,label] of [[input.webAToken,a,'A'],[input.webBToken,b,'B']]) {
      one(await request('user_profiles',token,'POST',{id:owner.userId}),'Website profile bootstrap failed');
      const source=one(await request('investment_sources?archived_at=is.null',token),'Default investment source missing');
      check(source.user_id===owner.userId,'Default investment source belongs to another owner');
      const purchase={p_request_id:randomUUID(),p_symbol:'SYNTHETIC',p_display:`Synthetic ${label}`,p_image_url:'',p_location:source.id,p_price:10,p_quantity:2,p_executed_at:'2026-01-01',p_has_commission:false,p_commission_amount:0};
      const ids=one(await request('rpc/record_position_purchase',token,'POST',purchase),'Website purchase RPC failed');
      one(await request('rpc/record_position_purchase',token,'POST',purchase),'Website retry RPC failed');
      const rows={investment_sources:source};
      rows.positions=one(await request(`positions?id=eq.${ids.position_id}`,token),'Position lookup failed');
      rows.position_lots=one(await request(`position_lots?id=eq.${ids.lot_id}`,token),'Lot lookup failed');
      rows.position_plans=one(await request('position_plans',token,'POST',{symbol:'PLAN',location:source.id,target_price:20,target_quantity:1,target_date:'2027-01-01'}),'Standalone plan failed');
      rows.settings=one(await request('settings',token,'POST',{annual_growth_rate:0.05}),'Settings creation failed');
      rows.watchlist_groups=one(await request('watchlist_groups',token,'POST',{name:`Synthetic ${label}`}),'Group creation failed');
      rows.watchlist_tickers=one(await request('watchlist_tickers',token,'POST',{group_id:rows.watchlist_groups.id,symbol:'WATCH'}),'Ticker creation failed');
      fixtures.push(rows);
    }
    check(fixtures[0].positions.id!==fixtures[1].positions.id,'Same instrument/brokerage merged users');
    record('website_two_user_creation_and_idempotent_purchase',{tables:6,separateInstrumentIdentity:true});
    const changes={positions:{display:'Updated synthetic'},position_lots:{price:12},position_plans:{target_price:22},settings:{annual_growth_rate:0.06},watchlist_groups:{name:'Updated group'},watchlist_tickers:{note:'Updated note'}};
    phase='six_table_isolation';
    for(const table of tableNames) {
      for(const [token,owner,own,other] of [[input.webAToken,a,fixtures[0],fixtures[1]],[input.webBToken,b,fixtures[1],fixtures[0]]]) {
        const row=one(await request(`${table}?select=id,user_id`,token),'Website saw unexpected table rows');check(row.user_id===owner.userId,'Website read another owner');
        empty(await request(`${table}?id=eq.${other[table].id}`,token),'Foreign row lookup was visible');
        empty(await request(`${table}?id=eq.${other[table].id}`,token,'PATCH',changes[table]),'Cross-owner update changed a row');
        empty(await request(`${table}?id=eq.${other[table].id}`,token,'DELETE'),'Cross-owner delete changed a row');
        one(await request(`${table}?id=eq.${own[table].id}`,token,'PATCH',changes[table]),'Owner update failed');
      }
      const anon=await request(table);check(anon.status===401&&anon.data?.code==='42501','Anonymous table access was not denied');
      record(`${table}_web_isolation_and_write`,{bothUsers:true,anonymousDenied:true});
    }
    const crossParent=await request('position_lots',input.webBToken,'POST',{user_id:b.userId,position_id:fixtures[0].positions.id,side:'BUY',price:1,quantity:1,executed_at:'2026-01-01'});
    check(crossParent.status===409&&crossParent.data?.code==='23503','Cross-owner parent FK was not enforced');
    record('cross_owner_parent_reference_denied');
    if(!mcp){report.status='INCOMPLETE';report.pending=['Actual MCP owner-A token and all MCP cases'];return;}
    phase='mcp_capabilities';
    empty(await request('positions',input.mcpAToken),'MCP read without connection');
    sql(`select public.server_mcp_connection(${literal(a.userId)},'bootstrap',${mcp.issuedAt})`);
    for(const table of tableNames) {
      const before=one(await request(table,input.mcpAToken),'MCP read failed');check(before.user_id===a.userId,'MCP read wrong owner');
      const insertion={...fixtures[0][table],id:randomUUID(),...changes[table]};
      if(table==='positions')insertion.symbol='MCP_FORBIDDEN';
      denied(await request(table,input.mcpAToken,'POST',insertion),'MCP insert was not explicitly denied by RLS');
      empty(await request(`${table}?id=eq.${before.id}`,input.mcpAToken,'PATCH',changes[table]),'MCP updated data');
      empty(await request(`${table}?id=eq.${before.id}`,input.mcpAToken,'DELETE'),'MCP deleted data');
      one(await request(`${table}?id=eq.${before.id}`,input.webAToken),'MCP denial did not preserve row');
      record(`${table}_mcp_owner_read_write_denied`);
    }
    denied(await request('rpc/record_position_purchase',input.mcpAToken,'POST',{p_request_id:randomUUID(),p_symbol:'FORBIDDEN',p_display:'Forbidden',p_image_url:'',p_location:fixtures[0].investment_sources.id,p_price:1,p_quantity:1,p_executed_at:'2026-01-01'}),'MCP write RPC was not denied');
    denied(await request('rpc/server_get_credentials',input.mcpAToken,'POST',{p_user_id:a.userId}),'Private service-only RPC accessible to MCP');
    record('mcp_write_rpc_and_private_service_rpc_denied');
    phase='revocation';
    sql(`select public.server_mcp_connection(${literal(a.userId)},'disconnect',${mcp.issuedAt});select public.server_mcp_connection(${literal(a.userId)},'bootstrap',${mcp.issuedAt+1});`);
    for(const table of tableNames)empty(await request(table,input.mcpAToken),'Disconnected MCP retained data access');
    sql(`select public.server_mcp_connection(${literal(a.userId)},'reconnect',${mcp.issuedAt})`);
    for(const table of tableNames) {
      empty(await request(table,input.mcpAToken),'Existing token bypassed reconnect cutoff');
      one(await request(table,input.webAToken),'MCP revocation affected website access');
    }
    record('mcp_disconnect_sticky_and_reconnect_cutoff',{tables:6,websiteUnaffected:true});
    const pieces=input.webAToken.split('.');pieces[2]=(pieces[2][0]==='A'?'B':'A')+pieces[2].slice(1);
    check((await request('positions',pieces.join('.'))).status===401,'Forged JWT signature was accepted');
    record('direct_rest_rejects_forged_signature');
    phase='owner_delete';
    for(const table of ['watchlist_tickers','watchlist_groups','position_plans','position_lots','positions','settings']) {
      one(await request(`${table}?id=eq.${fixtures[0][table].id}`,input.webAToken,'DELETE'),'Owner delete failed');
      one(await request(table,input.webBToken),'Owner deletion affected the other user');
    }
    record('website_owner_delete_all_six_tables',{otherUserPreserved:true});
    report.status='PASS_LOCAL_REST_WITH_REAL_AUTH0';
  } catch(error) {
    report.status=phase==='input'||phase==='native_runtime'||phase==='migrations'||phase==='postgrest_startup'?'INCOMPLETE':'FAIL';
    report.failedPhase=phase;report.reason=error instanceof GateError?error.message:'Gate could not complete; sensitive details suppressed';
  } finally {
    if(postgrest) {
      postgrest.kill('SIGTERM');await Promise.race([stopped,delay(3000)]);
      if(postgrest.exitCode===null){postgrest.kill('SIGKILL');await Promise.race([stopped,delay(3000)]);}
    }
    let clean=!(postgrest?.pid&&postgrest.exitCode===null&&postgrest.signalCode===null);
    if(pgDirectory) {
      try {execFileSync('pg_ctl',['-D',pgDirectory,'-m','immediate','-w','-t','30','stop'],{env:cleanEnv,stdio:'ignore',timeout:35_000});}
      catch {try {await lstat(join(pgDirectory,'postmaster.pid'));clean=false;}catch{}}
    }
    if(runtime&&clean)await rm(runtime,{recursive:true,force:true});
    if(!clean){report.cleanup='INCOMPLETE';report.status='INCOMPLETE';console.error(`Inspect this run's retained local runtime: ${runtime}`);}
    else report.cleanup='COMPLETE';
    await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify(report,null,2));
    process.exitCode=report.status==='PASS_LOCAL_REST_WITH_REAL_AUTH0'?0:report.status==='FAIL'?1:2;
  }
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{cancelled=true;postgrest?.kill('SIGTERM');});
main().catch(()=>{console.error('Local REST gate could not start; sensitive details suppressed');process.exitCode=2;});
