#!/usr/bin/env node
/** Approved TEST project only. Bounded cleaner pause; automatic restore in finally.
 * No dotenv. No production DB URL, SQL, user or data. Requires explicit pause flag.
 */
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,readdir,realpath,lstat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {createRemoteJWKSet,decodeJwt} from 'jose';
import {hashPassword} from 'better-auth/crypto';
import {buildHostedFixture,FIXTURE_TABLE} from './lib/better-auth-hosted-fixture.mjs';
import {createGateCommandContext} from './lib/better-auth-gate-command.mjs';
import {createGateVercelLifecycle} from './lib/better-auth-gate-vercel.mjs';
import {restoreHostedProjects} from './lib/better-auth-gate-restoration.mjs';
import {trustedDatabaseCertificate} from './prepare-account-migration.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const TEST='qdcvlhghabchxstoedzq',CLEANER='fkhwimpzfhofxnbckfuf';
const ORIGIN='https://livestocks-auth-gate.vercel.app',ISSUER=ORIGIN+'/api/auth';
const LEGACY_TABLES=['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'];
const TABLES=[FIXTURE_TABLE];
const directory=await mkdtemp('/private/tmp/livestocks-better-auth-hosted-');
process.umask(0o077);
const report={status:'INCOMPLETE',scope:'HOSTED_PROVIDER_AND_ISOLATED_FIXTURE_RLS',fullHostedFinancialMigration:false,startedAt:new Date().toISOString(),projectRef:TEST,issuer:ISSUER,productionMutations:false,cases:[],cleanup:{}};
let phase='preflight',pat,auth,pool,cleanerTouched=false,testTouched=false,backendProvisioned=false,fixtureCreated=false,fixture,integrationId,integrationAttempted=false,integrationAcknowledged=false,fixtureAttempted=false,config,apiKey,cancelled=false,activeDeadline=0;
const users=[],knownSecrets=new Set();
function assert(value,message){if(!value)throw new Error(message);}
function budget(maximum){assert(!cancelled||phase==='cleanup','Interrupted; restoring approved project states');if(!activeDeadline||phase==='cleanup')return maximum;const remaining=activeDeadline-Date.now();assert(remaining>0,'Hosted active gate deadline reached; restoring projects');return Math.min(maximum,remaining);}
async function save(){await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2),{mode:0o600});}
async function record(name,extra={}){report.cases.push({name,status:'PASS',at:new Date().toISOString(),...extra});await save();console.log(JSON.stringify({phase:name,status:'PASS',...extra}));}
async function management(ref,path='',method='GET',body){
 if(cancelled&&phase!=='cleanup')throw Error('Interrupted; restoring approved project states');
 assert([TEST,CLEANER].includes(ref),'Fixed test/cleanup target required');
 if(ref===CLEANER)assert((method==='GET'&&path==='')||(method==='POST'&&['/pause','/restore','/database/query'].includes(path)),'Cleaner operation not allowed');
 if(ref===CLEANER&&path==='/database/query')assert(body?.query==='select 1 as healthy','Cleaner SQL must be health-only');
 const response=await fetch('https://api.supabase.com/v1/projects/'+ref+path,{method,headers:{Authorization:'Bearer '+pat,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(budget(30000))});
 const data=await response.json().catch(()=>null);
 if(!response.ok){const serialized=JSON.stringify({at:new Date().toISOString(),phase,ref,path,status:response.status,data});let redacted=serialized;for(const secret of [...knownSecrets].filter(Boolean).sort((a,b)=>b.length-a.length))redacted=redacted.split(secret).join('[REDACTED]');const artifact='management-error-'+randomUUID()+'.json';await writeFile(join(directory,artifact),redacted,{mode:0o600,flag:'wx'});report.managementFailures??=[];report.managementFailures.push({phase,status:response.status,artifact});await save();throw Error('Management request failed at '+phase+' HTTP '+response.status);}
 return data;
}
const sql=(query,parameters)=>management(TEST,'/database/query','POST',{query,...(parameters?{parameters}:{})});
async function waitStatus(ref,status,minutes=5){const until=Date.now()+minutes*60000;while(Date.now()<until){const p=await management(ref);if(p.status===status)return;await delay(4000);}throw Error('Project did not reach '+status);}
async function request(path,body,cookie='',form=false){
 const response=await fetch(path.startsWith('https://')?path:ISSUER+path,{method:body?'POST':'GET',headers:{Origin:ORIGIN,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'}:{})},...(body?{body:form?new URLSearchParams(body).toString():JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(budget(20000))});
 const data=await response.clone().json().catch(()=>({}));return {response,data,cookie:response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};
}
async function rest(path,token,method='GET',body){const response=await fetch('https://'+TEST+'.supabase.co/rest/v1/'+path,{method,headers:{apikey:apiKey,'Content-Type':'application/json',Prefer:'return=representation',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(budget(15000))});return {ok:response.ok,status:response.status,data:await response.json().catch(()=>null)};}
function one(r){assert(r.ok&&Array.isArray(r.data)&&r.data.length===1,'Expected exactly one authorized row');return r.data[0];}
function empty(r){assert(r.ok&&Array.isArray(r.data)&&r.data.length===0,'Unexpected row visibility');}
async function verifyReadiness(){
 const health=await fetch(ORIGIN+'/health',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(budget(15000))});const identity=await health.json();
 assert(health.ok&&identity.runId===config.BETTER_AUTH_GATE_RUN_ID,'Frozen source run ID mismatch');
 report.readiness=[];const until=Date.now()+60000;
 for(const path of ['/health/ready','/health/provider']){
  for(;;){
   const response=await fetch(ORIGIN+path,{headers:{'x-livestocks-gate-probe':config.BETTER_AUTH_GATE_PROBE_SECRET},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(budget(20000))});const data=await response.json().catch(()=>({}));
   const allowedCategories=new Set(['READY','RUN_ID_MISMATCH','CONFIGURATION_INVALID','STORAGE_CONTRACT_MISMATCH','DISCOVERY_INVALID','AUTH_CONTEXT_UNAVAILABLE','UNCLASSIFIED_FAILURE','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID']);
   const code=typeof data.category==='string'&&(allowedCategories.has(data.category)||/^[0-9A-Z]{5}$/.test(data.category))?data.category:'UNKNOWN';
   const snapshot={path,status:response.status,sourceMatches:data.runId===config.BETTER_AUTH_GATE_RUN_ID,environmentMatches:data.environmentRunIdMatches===true,category:code,requestId:/^[a-f0-9-]{36}$/.test(data.requestId)?data.requestId:null};report.readiness.push(snapshot);await save();
   if(response.ok&&snapshot.sourceMatches&&snapshot.environmentMatches&&code==='READY')break;
   const retriable=response.status===503&&snapshot.sourceMatches&&snapshot.environmentMatches&&['ECONNRESET','ECONNREFUSED','ETIMEDOUT','57P01','57P03','08000','08001','08003','08006'].includes(code);
   assert(retriable&&Date.now()<until,'Synthetic provider readiness failed: '+code);await delay(2000);
  }
 }
 await record('guarded_source_environment_storage_provider_ready');
}
async function main(){
 if(process.argv.includes('--help')){console.log('Usage: node scripts/test-better-auth-hosted.mjs --service-directory /private/tmp/livestocks-hosted-issuer-... --allow-cleaner-pause\nRequires a NEW explicit user-approved pause window. Fixed test project only; native TLS, real deployed provider and hosted REST. Finally pauses TEST/restores cleaner. Protected report in a unique /private/tmp/livestocks-better-auth-hosted-* directory.');return;}
 assert(process.argv.length===5&&process.argv[2]==='--service-directory'&&process.argv[4]==='--allow-cleaner-pause','Explicit service directory and approved pause flag required');
 const service=await realpath(process.argv[3]);assert(/^\/private\/tmp\/livestocks-hosted-issuer-[A-Za-z0-9]+$/.test(service),'Only prepared private service directory allowed');
 assert((await lstat(service)).isDirectory(),'Service directory required');
 await mkdir(directory,{recursive:true,mode:0o700});assert(((await lstat(directory)).mode&0o077)===0,'Private gate directory required');await save();
 const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-a','supabase','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();pat=raw.startsWith('go-keyring-base64:')?Buffer.from(raw.slice(18),'base64').toString():raw;
 assert(/^sbp_(oauth_)?[a-f0-9]{40}$/.test(pat),'Saved CLI credential unavailable');knownSecrets.add(pat);
 const [beforeTest,beforeCleaner]=await Promise.all([management(TEST),management(CLEANER)]);assert(beforeTest.status==='INACTIVE'&&beforeCleaner.status==='ACTIVE_HEALTHY','Unexpected prestate; no automatic pause');
 const health=await fetch(ORIGIN+'/health',{redirect:'error'});assert(health.ok&&(await health.json()).productionData===false,'Public isolated service not ready');
 report.prestate={test:beforeTest.status,cleaner:beforeCleaner.status};
 const prepared=JSON.parse(await readFile(join(service,'source-manifest.json'),'utf8'));
 for(const [name,expected] of Object.entries(prepared.sourceHashes||{})){const actual=createHash('sha256').update(await readFile(resolve(root,name))).digest('hex');assert(actual===expected,'Prepared provider source changed; rebuild before a pause');}
 assert(Object.keys(prepared.sourceHashes||{}).length>0&&/^[a-f0-9-]{36}$/.test(prepared.gateRunId),'Prepared source/run manifest missing');report.gateRunId=prepared.gateRunId;
 report.sourceHashes=prepared.sourceHashes;report.migrationHashes={};
 for(const name of (await readdir(join(root,'supabase/migrations'))).filter(n=>n.endsWith('.sql')).sort())report.migrationHashes[name]=createHash('sha256').update(await readFile(join(root,'supabase/migrations',name))).digest('hex');
 await save();
 // Build the exact application module before downtime. Remove only Next's server-only marker.
 const output=await build({stdin:{contents:'export * from "./lib/auth/better-auth.ts"; export {createAuth0TokenVerifier} from "./lib/auth/auth0-token.ts";',resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'isolated-node',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));b.onResolve({filter:/^(better-auth|@better-auth\/|pg$|jose$|nodemailer$|@vercel\/functions$)/},({path})=>({path:fileURLToPath(import.meta.resolve(path)),external:true}));}}]});
 await writeFile(join(directory,'auth.mjs'),output.outputFiles[0].text,{mode:0o600});auth=await import(pathToFileURL(join(directory,'auth.mjs')).href);
 const password=randomBytes(40).toString('base64url');config={APP_BASE_URL:ORIGIN,PASSWORD_AUTH_ENABLED:'true',BETTER_AUTH_GATE_RUN_ID:prepared.gateRunId,BETTER_AUTH_GATE_PROBE_SECRET:randomBytes(32).toString('hex'),BETTER_AUTH_SECRET:randomBytes(48).toString('hex'),BETTER_AUTH_WEBSITE_CLIENT_ID:'livestocks-web-hosted-gate',BETTER_AUTH_MCP_CLIENT_ID:'livestocks-mcp-hosted-gate',BETTER_AUTH_MCP_CLIENT_SECRET:randomBytes(48).toString('hex')};
 knownSecrets.add(password);for(const [key,value] of Object.entries(config))if(key.includes('SECRET'))knownSecrets.add(value);
 if(process.env.BETTER_AUTH_GATE_CA_FILE){const caPath=await trustedDatabaseCertificate(process.env.BETTER_AUTH_GATE_CA_FILE);config.BETTER_AUTH_DATABASE_CA=await readFile(caPath,'utf8');report.databaseCaSha256=createHash('sha256').update(config.BETTER_AUTH_DATABASE_CA).digest('hex');}
 fixture=await buildHostedFixture(root);
 const activeMinutes=Number(process.env.BETTER_AUTH_GATE_ACTIVE_MINUTES||20);const diagnosticHoldSeconds=Number(process.env.BETTER_AUTH_GATE_DIAGNOSTIC_HOLD_SECONDS||0);
 assert(Number.isInteger(activeMinutes)&&activeMinutes>=8&&activeMinutes<=60,'Invalid bounded active budget');
 assert(Number.isInteger(diagnosticHoldSeconds)&&diagnosticHoldSeconds>=0&&diagnosticHoldSeconds<=600,'Invalid diagnostic hold budget');
 assert((activeMinutes===20&&diagnosticHoldSeconds===0)||process.env.BETTER_AUTH_GATE_RESTORE_BY,'Extended/diagnostic run requires absolute approved restore deadline');
 activeDeadline=Date.now()+activeMinutes*60000;
 if(process.env.BETTER_AUTH_GATE_RESTORE_BY){const restoreBy=Date.parse(process.env.BETTER_AUTH_GATE_RESTORE_BY);assert(Number.isFinite(restoreBy),'Invalid approved restoration deadline');activeDeadline=Math.min(activeDeadline,restoreBy-18*60000);assert(activeDeadline-Date.now()>=8*60000,'Insufficient approved time for active gate and conservative cleanup');report.approvedRestoreBy=new Date(restoreBy).toISOString();}
 const deadline=activeDeadline;report.activeDeadline=new Date(activeDeadline).toISOString();report.activeBudgetMinutes=Math.floor((activeDeadline-Date.now())/60000);report.fixtureRunId=fixture.runId;
 const context=await createGateCommandContext({serviceDirectory:service,reportDirectory:directory,budgetMs:maximum=>budget(phase==='cleanup'?Math.min(maximum,45000):maximum)});
 let cloud;
 try{
  cloud=createGateVercelLifecycle(context);report.cloudRunId=context.runId;await cloud.assertCleanPrestate();
  for(const [key,value] of Object.entries(config))await cloud.addEnvironment(key,value);
  phase='pause_cleaner';report.pauseRequestedAt=new Date().toISOString();await save();cleanerTouched=true;await management(CLEANER,'/pause','POST',{});await waitStatus(CLEANER,'INACTIVE');await record('cleaner_paused');
  phase='restore_test';testTouched=true;await management(TEST,'/restore','POST',{});await waitStatus(TEST,'ACTIVE_HEALTHY');await record('test_restored');
  phase='test_database_readiness';
  let stableSamples=0,postmasterStart=null;const stableUntil=Math.min(activeDeadline,Date.now()+4*60000);
  while(Date.now()<stableUntil&&stableSamples<3&&!cancelled){
   try{
    const current=(await sql('select pg_postmaster_start_time()::text as started_at,extract(epoch from clock_timestamp()-pg_postmaster_start_time())::integer as uptime_seconds'))[0];
    if(current.uptime_seconds>=60&&current.started_at===postmasterStart)stableSamples++;else stableSamples=current.uptime_seconds>=60?1:0;
    postmasterStart=current.started_at;report.databaseReadiness={stableSamples,uptimeSeconds:current.uptime_seconds};await save();
   }catch{stableSamples=0;postmasterStart=null;}
   if(stableSamples<3)await delay(5000);
  }
  assert(stableSamples===3,'TEST database did not reach stable post-restore readiness');await record('test_database_stable_after_restore',{stableSamples});
  phase='schema_preflight';
  const rows=await sql("select tablename from pg_tables where schemaname='public' order by tablename");
  report.originalPublicTables=rows.map(row=>row.tablename);report.preflightCounts={};
  for(const [table,count] of await Promise.all(LEGACY_TABLES.filter(table=>rows.some(row=>row.tablename===table)).map(async table=>[table,(await sql('select count(*)::integer as n from public.'+table))[0].n])))report.preflightCounts[table]=count;
  await save();
  // No existing financial migration, ALTER, reset, or data change. The fixture
  // transaction rejects reserved namespace collisions before creating objects.
  phase='fixture_preflight';
  report.administrativeRole=(await sql("select current_user,session_user,rolsuper,rolcreaterole,current_setting('createrole_self_grant',true) as self_grant from pg_roles where rolname=current_user"))[0];await save();
  report.reservedNamespacePrestate=(await sql("select exists(select 1 from pg_namespace where nspname='private') as private_schema,exists(select 1 from pg_namespace where nspname='livestocks_auth') as auth_schema,exists(select 1 from pg_roles where rolname='livestocks_auth_backend') as backend_role,to_regclass('public.livestocks_ba_gate_20261115') is not null as fixture_table,to_regclass('private.hosted_gate_marker') is not null as marker_table"))[0];await save();console.log(JSON.stringify({phase:'reserved_namespace_prestate',...report.reservedNamespacePrestate}));
  phase='fixture_ddl';fixtureAttempted=true;await sql(fixture.sql);fixtureCreated=true;report.fixtureDdlAcknowledged=true;await save();
  phase='fixture_auth_config';
  await sql("insert into private.auth_config(singleton,issuer,website_client_id,mcp_client_id,website_audience,mcp_audience,auth_provider) values(true,$1,$2,$3,$4,$5,'better_auth')",[ISSUER,config.BETTER_AUTH_WEBSITE_CLIENT_ID,config.BETTER_AUTH_MCP_CLIENT_ID,ORIGIN+'/api/web',ORIGIN+'/api/mcp']);report.authConfigAcknowledged=true;await save();
  phase='fixture_backend_credential';await sql("alter role livestocks_auth_backend login password '"+password+"'");backendProvisioned=true;report.backendCredentialAcknowledged=true;await save();
  phase='fixture_pooler_discovery';const pools=await management(TEST,'/config/database/pooler');const candidate=pools.find(p=>p.pool_mode==='session')||pools.find(p=>p.database_type==='PRIMARY');assert(candidate,'Test pooler unavailable');
  const conn=new URL(candidate.connection_string||candidate.connectionString);assert(conn.hostname.endsWith('.pooler.supabase.com'),'Unexpected pooler host');conn.username='livestocks_auth_backend.'+TEST;conn.password=password;conn.port='5432';conn.search='';config.BETTER_AUTH_DATABASE_URL=conn.href;knownSecrets.add(conn.href);
  await writeFile(join(directory,'config.json'),JSON.stringify(config),{mode:0o600});Object.assign(process.env,config);process.env.NODE_ENV='production';
  phase='native_tls_role';pool=auth.createAuthPool(auth.betterAuthConfiguration());
  const access=(await pool.query(`select current_user as role,
   exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[])
    and (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and has_column_privilege(current_user,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')))) as financial_access,
   (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege(current_user,p.oid,'EXECUTE')) as callable_public_definers,
   has_table_privilege(current_user,'livestocks_auth.user','SELECT') as auth_read`,[LEGACY_TABLES])).rows[0];
  assert(access.role==='livestocks_auth_backend'&&!access.financial_access&&access.callable_public_definers===0&&access.auth_read,'Backend role privilege boundary failed');
  await record('native_tls_limited_role',{financialTableAndColumnAccess:false,callablePublicSecurityDefiners:0});
  await cloud.addEnvironment('BETTER_AUTH_DATABASE_URL',conn.href);
  phase='deploy_configured_issuer';const deployment=await cloud.deploy();report.configuredDeploymentUrl=deployment.url;report.deploymentReadiness=deployment;await save();
  await verifyReadiness();
  const discovery=await request('/.well-known/openid-configuration');report.discoveryResponse={status:discovery.response.status,contentType:discovery.response.headers.get('content-type'),issuer:typeof discovery.data.issuer==='string'?discovery.data.issuer:null,jwksUri:typeof discovery.data.jwks_uri==='string'?discovery.data.jwks_uri:null,code:discovery.data.code==='AUTH_UNAVAILABLE'?'AUTH_UNAVAILABLE':null};await save();assert(discovery.response.ok&&discovery.data.issuer===ISSUER&&discovery.data.jwks_uri===ISSUER+'/jwks','Public OIDC discovery mismatch');await record('public_fixed_oidc_discovery');
  const jwks=await request('/jwks');assert(jwks.response.ok&&jwks.data.keys?.length>0&&jwks.data.keys.every(k=>k.kid&&k.kty!=='oct'),'Asymmetric public JWKS required');
  phase='custom_oidc';const prior=await management(TEST,'/config/auth/third-party-auth');assert(!prior.some(x=>x.oidc_issuer_url===ISSUER),'Existing test issuer requires review');
  integrationAttempted=true;const integration=await management(TEST,'/config/auth/third-party-auth','POST',{oidc_issuer_url:ISSUER});integrationId=integration.id;assert(typeof integrationId==='string','Missing integration ID');integrationAcknowledged=true;await record('test_custom_oidc_added');
  const keys=await management(TEST,'/api-keys');apiKey=keys.find(k=>k.name==='anon')?.api_key;assert(apiKey,'Test anonymous API key unavailable');
  phase='synthetic_users';
  for(let index=0;index<2;index++){
   const id='hosted-gate-'+randomUUID(),email=id+'@example.invalid',pw=randomBytes(32).toString('base64url')+'Aa1!',hash=await hashPassword(pw);users.push(id);
   await sql('insert into livestocks_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") values($1,$2,$3,true,now(),now());',[id,'Synthetic gate',email]);
   await sql('insert into livestocks_auth.account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") values($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,hash]);
   const login=await request('/sign-in/email',{email,password:pw});assert(login.response.ok&&login.data.user?.id===id&&login.cookie,'Real hosted password login failed');
   const website=await auth.getWebsiteDatabaseToken(new Headers({cookie:login.cookie}));
   await sql('select public.server_identity_resolve($1,$2,null,$3)',[ISSUER,id,Math.floor(new Date(website.session.session.createdAt).getTime()/1000)]);
   users[index]={id,cookie:login.cookie,webToken:website.token};
  }
  const [a,b]=users;await auth.seedMcpClient(new Headers({cookie:a.cookie}),['https://client.example.invalid/callback']);
  const verify=auth.createAuth0TokenVerifier({...auth.betterAuthConfiguration(),jwks:createRemoteJWKSet(new URL(ISSUER+'/jwks')),requireLiveSessionEvidence:true,companionAudience:ISSUER+'/oauth2/userinfo'});
  await verify(a.webToken,'web');await verify(b.webToken,'web');await record('two_real_hosted_password_sessions_and_web_jwts');
  async function authorize(target=ORIGIN+'/api/mcp'){
   const verifier=randomBytes(32).toString('base64url'),params=new URLSearchParams({client_id:config.BETTER_AUTH_MCP_CLIENT_ID,response_type:'code',redirect_uri:'https://client.example.invalid/callback',scope:'openid email profile offline_access portfolio:read',state:randomUUID(),nonce:randomUUID(),code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});if(target!==null)params.set('resource',target);
   const started=await request('/oauth2/authorize?'+params,undefined,a.cookie);
   let location=started.response.headers.get('location');const transport=location?'location':started.data.redirect===true&&typeof started.data.url==='string'?'json':'none';
   if(!location&&transport==='json')location=started.data.url;
   const destination=location?new URL(location,ORIGIN):null;
   const destinationClass=destination?.origin===ORIGIN&&['/oauth/consent','/sign-in'].includes(destination.pathname)?destination.pathname:destination?.origin==='https://client.example.invalid'&&destination.pathname==='/callback'?'callback':'none';
   report.authorizationResponses??=[];report.authorizationResponses.push({status:started.response.status,transport,destination:destinationClass});await save();
   assert(!location||destinationClass!=='none','Unexpected authorization redirect destination');
   if(location?.includes('/oauth/consent?')){const consent=await request('/oauth2/consent',{accept:true,oauth_query:new URL(location,ORIGIN).search.slice(1)},a.cookie);assert(consent.response.ok,'Real consent endpoint failed');location=consent.data.url;const callback=new URL(location);assert(callback.origin==='https://client.example.invalid'&&callback.pathname==='/callback','Unexpected consent callback destination');}
   return {verifier,code:location?new URL(location,ORIGIN).searchParams.get('code'):null,status:started.response.status};
  }
  const token=body=>request('/oauth2/token',{client_id:config.BETTER_AUTH_MCP_CLIENT_ID,client_secret:config.BETTER_AUTH_MCP_CLIENT_SECRET,...body},'',true);
  async function exchange(resource=ORIGIN+'/api/mcp'){const c=await authorize();assert(c.code,'Authorization code unavailable');return token({grant_type:'authorization_code',code:c.code,code_verifier:c.verifier,redirect_uri:'https://client.example.invalid/callback',resource});}
  assert((await authorize(null)).status===400&&(await authorize('https://evil.invalid')).status===400,'Authorize resource guard failed');
  const wrongExchange=await exchange('https://evil.invalid');assert(wrongExchange.response.status===400&&wrongExchange.data.error==='invalid_target'&&!wrongExchange.data.access_token,'Wrong exchange resource did not return invalid_target');
  let mcp=await exchange();let identity=await verify(mcp.data.access_token,'mcp');assert(identity.userId===a.id,'MCP subject mismatch');
  await sql('insert into private.mcp_connections(user_id) values($1)',[a.id]);await record('real_hosted_pkce_consent_mcp_jwt_and_resource_denials');
  phase='hosted_gateway_propagation';let accepted=false;
  while(Date.now()<deadline){a.webToken=(await auth.getWebsiteDatabaseToken(new Headers({cookie:a.cookie}))).token;const r=await rest(FIXTURE_TABLE,a.webToken);if(r.ok){accepted=true;break;}assert([401,403].includes(r.status),'Unexpected hosted gateway failure');await delay(5000);}
  assert(accepted,'Hosted issuer did not propagate within the bounded pause window');await record('hosted_supabase_custom_oidc_acceptance');
  b.webToken=(await auth.getWebsiteDatabaseToken(new Headers({cookie:b.cookie}))).token;
  mcp=await token({grant_type:'refresh_token',refresh_token:mcp.data.refresh_token,resource:ORIGIN+'/api/mcp'});identity=await verify(mcp.data.access_token,'mcp');
  phase='isolated_fixture_rows';const fixtures=[];
  for(const account of [a,b])fixtures.push(one(await rest(FIXTURE_TABLE,account.webToken,'POST',{label:'Synthetic owner row'})));
  for(const [owner,other] of [[a,fixtures[1]],[b,fixtures[0]]]){
   assert(one(await rest(FIXTURE_TABLE,owner.webToken)).user_id===owner.id,'Cross-owner read');
   empty(await rest(FIXTURE_TABLE+'?id=eq.'+other.id,owner.webToken));
   empty(await rest(FIXTURE_TABLE+'?id=eq.'+other.id,owner.webToken,'DELETE'));
   empty(await rest(FIXTURE_TABLE+'?id=eq.'+other.id,owner.webToken,'PATCH',{label:'Denied cross-owner update'}));
   const forged=await rest(FIXTURE_TABLE,owner.webToken,'POST',{user_id:other.user_id,label:'Denied cross-owner insert'});
   assert(forged.status===403&&forged.data?.code==='42501','Cross-owner insert did not fail RLS');
  }
  assert(one(await rest(FIXTURE_TABLE,mcp.data.access_token)).user_id===a.id,'MCP owner mismatch');
  empty(await rest(FIXTURE_TABLE+'?id=eq.'+fixtures[0].id,mcp.data.access_token,'DELETE'));
  empty(await rest(FIXTURE_TABLE+'?id=eq.'+fixtures[0].id,mcp.data.access_token,'PATCH',{label:'Denied MCP update'}));
  const denied=await rest(FIXTURE_TABLE,mcp.data.access_token,'POST',{label:'Denied MCP insert'});
  assert(denied.status===403&&denied.data?.code==='42501','MCP write did not fail RLS');
  assert([401,403].includes((await rest(FIXTURE_TABLE,undefined)).status),'Anonymous fixture access accepted');
  await record('isolated_fixture_owner_read_write_isolation_and_mcp_readonly');
  phase='hosted_negative_claims';
  for(const [name,patch] of [['wrong_issuer',{iss:'https://untrusted.example.invalid'}],['wrong_audience',{aud:'https://untrusted.example.invalid/api'}],['wrong_client',{azp:'unapproved-client',client_id:'unapproved-client'}],['wrong_role',{role:'anon'}],['wrong_session',{sid:'not-a-live-session','https://livestocks.app/auth_session_id':'not-a-live-session'}]]) {
   const {token:invalid}=await auth.getBetterAuth().api.signJWT({body:{payload:{...decodeJwt(a.webToken),...patch}}});
   const decoded=decodeJwt(invalid);assert(Object.entries(patch).every(([key,value])=>JSON.stringify(decoded[key])===JSON.stringify(value)),'Signed negative-test claim patch was not retained');
   const denied=await rest(FIXTURE_TABLE,invalid);assert([401,403].includes(denied.status)||denied.ok&&Array.isArray(denied.data)&&denied.data.length===0,'Wrong signed claims accepted');await record(name+'_denied');
  }
  const pieces=a.webToken.split('.');pieces[2]=(pieces[2][0]==='A'?'B':'A')+pieces[2].slice(1);assert((await rest(FIXTURE_TABLE,pieces.join('.'))).status===401,'Tampered signature accepted');await record('tampered_signature_denied');
  const refreshed=await token({grant_type:'refresh_token',refresh_token:mcp.data.refresh_token,resource:ORIGIN+'/api/mcp'});const refreshedIdentity=await verify(refreshed.data.access_token,'mcp');assert(refreshedIdentity.grantId===identity.grantId&&refreshedIdentity.authSessionId===identity.authSessionId&&refreshedIdentity.authSessionCreatedAt===identity.authSessionCreatedAt,'Refresh changed original evidence');
  const wrongRefresh=await token({grant_type:'refresh_token',refresh_token:refreshed.data.refresh_token,resource:'https://evil.invalid'});assert(wrongRefresh.response.status===400&&wrongRefresh.data.error==='invalid_target'&&!wrongRefresh.data.access_token,'Wrong refresh resource did not return invalid_target');await record('refresh_preserves_immutable_evidence');
  await sql('select private.revoke_oauth_approvals($1,$2,null)',[a.id,config.BETTER_AUTH_MCP_CLIENT_ID]);for(const table of TABLES)empty(await rest(table,refreshed.data.access_token));const revokedRefresh=await token({grant_type:'refresh_token',refresh_token:refreshed.data.refresh_token,resource:ORIGIN+'/api/mcp'});assert(revokedRefresh.response.status===400&&revokedRefresh.data.error==='invalid_grant'&&!revokedRefresh.data.access_token,'Revoked refresh did not return invalid_grant');await record('revoked_approval_denies_existing_jwt_and_refresh');
  await request('/sign-out',{},a.cookie);for(const table of TABLES)empty(await rest(table,a.webToken));await record('signout_denies_existing_website_jwt_direct_rest');
  await sql('update private.hosted_gate_profiles set min_auth_session_created_at=greatest(1,floor(extract(epoch from clock_timestamp()))::bigint) where id=$1',[b.id]);
  empty(await rest(FIXTURE_TABLE,b.webToken));
  const newerIssued=(await auth.getWebsiteDatabaseToken(new Headers({cookie:b.cookie}))).token;
  empty(await rest(FIXTURE_TABLE,newerIssued));await record('original_session_cutoff_denies_old_and_newly_issued_web_jwt');
  const privateSchema=await fetch('https://'+TEST+'.supabase.co/rest/v1/user?limit=1',{headers:{apikey:apiKey,Authorization:'Bearer '+newerIssued,'Accept-Profile':'livestocks_auth'},redirect:'error',signal:AbortSignal.timeout(budget(20000))});const privateSchemaError=await privateSchema.json();assert(privateSchema.status===406&&privateSchemaError.code==='PGRST106','Private auth schema was not explicitly rejected');await record('private_auth_schema_not_exposed');
  report.status='PASS_HOSTED_PROVIDER_AND_ISOLATED_FIXTURE_RLS';
 }catch(error){
  report.status='INCOMPLETE';report.failedPhase=phase;report.reason=error.message;console.log(JSON.stringify({status:'INCOMPLETE',phase,reason:error.message}));
  if(testTouched&&diagnosticHoldSeconds>0&&!cancelled){
   try{
    const state=await management(TEST);
    if(state.status==='ACTIVE_HEALTHY'){
     const until=Math.min(Date.now()+diagnosticHoldSeconds*1000,Date.parse(report.approvedRestoreBy)-18*60000,activeDeadline);
     report.diagnosticHoldUntil=new Date(until).toISOString();await save();console.log(JSON.stringify({phase:'diagnostic_hold',until:report.diagnosticHoldUntil,report:join(directory,'report.json')}));
     while(Date.now()<until&&!cancelled){
      try{const release=JSON.parse(await readFile(join(directory,'release-diagnostic-hold.json'),'utf8'));if(release.fixtureRunId===fixture.runId)break;}catch{/* No release requested. */}
      await delay(Math.min(2000,Math.max(0,until-Date.now())));
     }
    }
   }catch{/* Diagnostic access never suppresses automatic restoration. */}
  }
 }
 finally{
  phase='cleanup';await pool?.end().catch(()=>{});await auth?.shutdownBetterAuth().catch(()=>{});
  if(testTouched){
   if(integrationAttempted){try{
    const matches=(await management(TEST,'/config/auth/third-party-auth')).filter(item=>item.oidc_issuer_url===ISSUER);
    assert(matches.length<=1,'Ambiguous test issuer ownership');
    assert(integrationAcknowledged||matches.length===1,'Unconfirmed issuer creation has no observable result');
    if(matches.length){const id=matches[0].id;assert(typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id),'Unexpected issuer integration ID');try{await management(TEST,'/config/auth/third-party-auth/'+id,'DELETE');}catch{/* Verify actual state after an indeterminate delete. */}}
    assert(!(await management(TEST,'/config/auth/third-party-auth')).some(item=>item.oidc_issuer_url===ISSUER),'Test issuer integration remains');report.cleanup.integrationRemoved=true;
   }catch{report.cleanup.integrationRemoved=false;}}else report.cleanup.integrationCreated=false;
   try{
    if(!fixtureCreated){const marker=await sql("select to_regclass('private.hosted_gate_marker') is not null as present");if(marker[0].present)fixtureCreated=(await sql('select exists(select 1 from private.hosted_gate_marker where run_id=$1::uuid) as owned',[fixture.runId]))[0].owned;}
    if(fixtureCreated){
     if(backendProvisioned)await sql('alter role livestocks_auth_backend nologin password null');
     await sql(fixture.cleanup);report.cleanup.fixtureRemoved=true;
     const rows=await sql("select tablename from pg_tables where schemaname='public' order by tablename");
     assert(JSON.stringify(rows.map(row=>row.tablename))===JSON.stringify(report.originalPublicTables),'Existing table inventory changed');
     await Promise.all(Object.entries(report.preflightCounts).map(async([table,count])=>assert((await sql('select count(*)::integer as n from public.'+table))[0].n===count,'Existing financial count changed')));
     report.cleanup.existingTableNamesAndCountsPreserved=true;
    }else {report.cleanup.fixtureCreated=false;assert(!fixtureAttempted,'Unconfirmed fixture creation has no observable owned result');}
   }catch{report.cleanup.fixtureRemoved=false;}
  }
  if(testTouched||cleanerTouched){
   const restorationDeadline=report.approvedRestoreBy?Date.parse(report.approvedRestoreBy)-3*60000:Date.now()+15*60000;
   const restoration=await restoreHostedProjects({management,deadlineMs:restorationDeadline,testTouched,cleanerTouched,onProgress:async stage=>{console.log(JSON.stringify({phase:'cleanup',stage}));}});
   report.cleanup.restoration=restoration;report.cleanup.testPaused=restoration.testPaused;report.cleanup.cleanerHealthy=restoration.cleanerHealthy;
   if(restoration.cleanerHealthyAt)report.cleanup.cleanerHealthyAt=restoration.cleanerHealthyAt;
  }
  try{report.cleanup.vercel=await cloud?.cleanup();}catch{report.cleanup.vercel={ok:false};}
  try{await context.release();report.cleanup.leaseReleased=true;}catch{report.cleanup.leaseReleased=false;}
  const cleanupFailed=(cleanerTouched&&!report.cleanup.cleanerHealthy)||(testTouched&&!report.cleanup.testPaused)||(fixtureAttempted&&report.cleanup.fixtureRemoved!==true)||(integrationAttempted&&!report.cleanup.integrationRemoved)||report.cleanup.vercel?.ok!==true||!report.cleanup.leaseReleased;
  if(cleanupFailed){report.status='INCOMPLETE';report.cleanupFailed=true;}
  report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,cleanup:report.cleanup,report:join(directory,'report.json')}));
  if(cleanupFailed||report.status!=='PASS_HOSTED_PROVIDER_AND_ISOLATED_FIXTURE_RLS')process.exitCode=2;
 }
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{cancelled=true;});
main().catch(async error=>{report.failedPhase=phase;report.reason=error.message;await save().catch(()=>{});console.error(JSON.stringify({status:'INCOMPLETE',phase,reason:error.message}));process.exitCode=2;});
