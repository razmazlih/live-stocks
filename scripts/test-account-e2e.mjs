#!/usr/bin/env node
/** Real Auth0 browser login -> real Next SDK cookies/API -> local PostgREST/RLS.
 * Synthetic accounts/data only. No .env loading, hosted DB writes, or tenant edits.
 * Requires protected input JSON and an existing Playwright installation.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createServer as httpServer, request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { closeSync, openSync } from 'node:fs';
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { SignJWT } from 'jose';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://localhost:3109';
const issuer = 'https://dev-c8o5jwbmbzkzac2s.us.auth0.com/';
const tables = ['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'];
const cleanEnv = { PATH: process.env.PATH, LC_ALL: 'C', PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null', PGCONNECT_TIMEOUT: '5', PGTZ: 'UTC' };
const archiveUrl = 'https://github.com/PostgREST/postgrest/releases/download/v16.5/postgrest-v16.5-macos-aarch64.tar.xz';
const archiveSha256 = 'd8095cb439de0a3151036df542139e7afca5cebb109ce7f1bae52b3a97e9846a';
const report = { status:'INCOMPLETE', environment:'LOCAL_NEXT_BROWSER_AUTH0_POSTGREST', startedAt:new Date().toISOString(),
  syntheticDataOnly:true, hostedDatabaseWrites:false, tenantConfigurationWrites:false, hostedGatewayVerified:false,
  limitations:['Does not prove hosted Supabase gateway, production deployment, Google login, mobile devices, or ChatGPT host authorization.','Market-price keys are absent; unavailable quotes are expected.'], cases:[] };
let runtime; let pgData; let dbUrl; let gateway; let browser; let rest; let next; let phase='input'; let cancelled=false;
function check(value,message) { if(!value)throw new Error(message); }
function record(name,evidence={}) { report.cases.push({name,result:'PASS',...evidence}); console.log(`PASS ${name}`); }
function command(binary,args,options={}) {
  check(!cancelled,'Interrupted');
  try{return execFileSync(binary,args,{env:cleanEnv,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60_000,...options});}
  catch{throw new Error('Local utility failed; sensitive diagnostics suppressed');}
}
function literal(value){return `'${value.replaceAll("'","''")}'`;}
function sql(value){return command('psql',[dbUrl,'-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-c',value]);}
async function port(requested=0){const s=createServer();await new Promise((ok,bad)=>{s.once('error',bad);s.listen(requested,'127.0.0.1',ok);});const p=s.address().port;await new Promise(ok=>s.close(ok));return p;}
async function privateInput(path){
  check(isAbsolute(path),'Input path must be absolute');const actual=await realpath(path);const base=await realpath(root);
  for(const candidate of [resolve(path),actual]){const rel=relative(base,candidate);check(rel==='..'||rel.startsWith(`..${sep}`),'Input must be outside Git checkout');}
  const stat=await lstat(path);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&(stat.mode&0o077)===0&&stat.size<100_000,'Input must be a private owned regular file');
  const input=JSON.parse(await readFile(actual,'utf8'));
  check(input.purpose==='livestocks-synthetic-account-e2e'&&input.config?.AUTH0_DOMAIN===new URL(issuer).hostname,'Unexpected test purpose or tenant');
  check(input.users?.length===2&&input.users[0].user_id!==input.users[1].user_id,'Two distinct synthetic accounts are required');
  for(const u of input.users)check(typeof u.password==='string'&&u.password.length>10&&typeof u.user_id==='string'&&/^.+@example\.invalid$/.test(u.email),'Only explicit synthetic example.invalid users are allowed');
  return input;
}
function launch(binary,args,env,log,cwd=runtime){
  const fd=openSync(join(runtime,log),'a',0o600);
  const child=spawn(binary,args,{env,cwd,detached:true,stdio:['ignore',fd,fd]});closeSync(fd);
  child.spawnFailed=false;child.once('error',()=>{child.spawnFailed=true;});
  child.stopped=new Promise(ok=>child.once('exit',ok));return child;
}
async function stop(child){if(!child||child.spawnFailed||!child.pid||child.exitCode!==null)return;try{process.kill(-child.pid,'SIGTERM');}catch{}await Promise.race([child.stopped,delay(3000)]);if(child.exitCode===null){try{process.kill(-child.pid,'SIGKILL');}catch{}await child.stopped;}}
async function waitReady(child,url,predicate,seconds=90){for(let n=0;n<seconds*4;n++){check(!cancelled&&!child?.spawnFailed&&child?.exitCode===null,'Local server exited');try{const r=await fetch(url,{signal:AbortSignal.timeout(2000)});if(await predicate(r))return;}catch{}await delay(250);}throw new Error('Local server readiness timed out');}
async function nativeRest(){
  check(process.platform==='darwin'&&process.arch==='arm64','Pinned PostgREST binary supports macOS ARM64');
  const response=await fetch(archiveUrl,{signal:AbortSignal.timeout(60_000)});check(response.ok,'Official native binary download failed');
  const archive=Buffer.from(await response.arrayBuffer());check(createHash('sha256').update(archive).digest('hex')===archiveSha256,'PostgREST checksum mismatch');
  const file=join(runtime,'postgrest.tar.xz');await writeFile(file,archive,{mode:0o600});
  const entries=command('tar',['-tJf',file]).trim().split('\n');check(entries.every(p=>!p.startsWith('/')&&!p.split('/').includes('..')),'Unsafe archive');
  command('tar',['-xJf',file,'-C',runtime]);const entry=entries.find(p=>/(^|\/)postgrest$/.test(p));check(entry,'Missing PostgREST binary');
  const binary=join(runtime,entry);await chmod(binary,0o700);
  const libdir=await realpath(command('pg_config',['--libdir']).trim());await lstat(join(libdir,'libpq.5.dylib'));
  const env={...cleanEnv,DYLD_LIBRARY_PATH:libdir};check(/\b16\.5\b/.test(command(binary,['--version'],{env})),'Unexpected PostgREST version');
  report.postgrest={version:'16.5',archiveSha256};return{binary,env};
}
async function makeAppCopy(instance){
  const app=join(runtime,'app');await mkdir(app,{mode:0o700});
  const dirs=['app','components','hooks','lib','public','types','styles'];
  const files=['package.json','package-lock.json','next.config.js','tsconfig.json','postcss.config.js','tailwind.config.ts','components.json','proxy.ts','middleware.ts','next-env.d.ts'];
  for(const name of [...dirs,...files]){try{await lstat(join(root,name));await cp(join(root,name),join(app,name),{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}}
  check(!(await readdir(app)).some(name=>name.startsWith('.env')),'Isolated copy unexpectedly contains env files');
  await symlink(join(root,'node_modules'),join(app,'node_modules'),'dir');
  const page=join(app,'app/account-e2e-gate');await mkdir(page,{recursive:true});
  await writeFile(join(page,'page.tsx'),`'use client';
import { useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
export default function Gate(){useEffect(()=>{(window as any).__accountGate={read:(table:string)=>getSupabaseClient().from(table).select('*'),insert:(table:string,value:unknown)=>getSupabaseClient().from(table).insert(value as any).select(),update:(table:string,id:string,value:unknown)=>getSupabaseClient().from(table).update(value as any).eq('id',id).select(),remove:(table:string,id:string)=>getSupabaseClient().from(table).delete().eq('id',id).select(),rpc:(name:string,value:unknown)=>getSupabaseClient().rpc(name,value as any)};return()=>{delete(window as any).__accountGate;};},[]);return <p>Local synthetic account verification</p>}`);
  const identity=join(app,'app/api/account-e2e-gate');await mkdir(identity,{recursive:true});
  await writeFile(join(identity,'route.ts'),`export const dynamic='force-dynamic';export async function GET(){return Response.json({instance:${JSON.stringify(instance)}});}`);
  return app;
}
async function login(context,user){
  const page=await context.newPage();
  const diagnostics={sessionStatuses:[],databaseStatuses:[],corsErrors:0,corsReasons:[],pageErrors:[],failedScripts:0};
  report.browserDiagnostics??=[];report.browserDiagnostics.push(diagnostics);
  page.on('response',response=>{const url=new URL(response.url());if(url.origin===origin&&url.pathname==='/api/account/session')diagnostics.sessionStatuses.push(response.status());if(url.pathname.startsWith('/rest/v1/'))diagnostics.databaseStatuses.push(response.status());});
  page.on('pageerror',error=>diagnostics.pageErrors.push({name:error.name,message:error.message.replace(/https?:\/\/\S+/g,'[url]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[token]').slice(0,180)}));
  page.on('requestfailed',request=>{if(new URL(request.url()).pathname.startsWith('/_next/'))diagnostics.failedScripts++;});
  page.on('console',message=>{if(message.type()==='error'&&/CORS|Access-Control-Allow/i.test(message.text())){
    diagnostics.corsErrors++;
    const text=message.text();const header=/Request header field ([a-z0-9-]+)/i.exec(text)?.[1];
    const reason=header?`header:${header}`:/multiple values/i.test(text)?'multiple-origin-values':/No .Access-Control-Allow-Origin/i.test(text)?'missing-origin':/preflight/i.test(text)?'preflight-rejected':'other-cors';
    if(!diagnostics.corsReasons.includes(reason))diagnostics.corsReasons.push(reason);
  }});
  const url=new URL('/auth/login',origin);url.searchParams.set('returnTo','/account-e2e-gate');url.searchParams.set('prompt','login');url.searchParams.set('connection',user.connection);url.searchParams.set('ui_locales','en');
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60_000});
  const deadline=Date.now()+60_000;let submitted=false;
  while(Date.now()<deadline){
    if(page.url().startsWith(`${origin}/account-e2e-gate`)){await page.waitForFunction(()=>Boolean(window.__accountGate),{timeout:30_000});return page;}
    const email=page.locator('input[name="username"],input[type="email"]').first();
    const password=page.locator('input[type="password"]').first();
    if(!submitted&&await email.count()&&await email.isVisible()){
      await email.fill(user.email);if(await password.count()&&await password.isVisible())await password.fill(user.password);
      const button=page.getByRole('button',{name:/^(Continue|המשך)$/}).first();check(await button.count(),'Auth0 login submit unavailable');await button.click();submitted=true;
    }else{
      const button=page.getByRole('button',{name:/^(Accept|Allow|Authorize|Continue|אישור|המשך)$/}).first();
      if(await button.count()&&await button.isVisible())await button.click();
    }
    await delay(200);
  }
  throw new Error('Actual Auth0 browser login did not complete');
}
async function browserJson(page,path,options={}){return page.evaluate(async({path,options})=>{const r=await fetch(path,{cache:'no-store',...options});let data;try{data=await r.json();}catch{data=null;}return{status:r.status,cache:r.headers.get('cache-control'),data};},{path,options});}
async function browserDb(page,method,...args){await page.waitForFunction(()=>Boolean(window.__accountGate),null,{timeout:30_000});return page.evaluate(async({method,args})=>{const r=await window.__accountGate[method](...args);return{data:r.data,error:r.error?{code:r.error.code}:null};},{method,args});}
function one(result,message){check(!result.error&&Array.isArray(result.data)&&result.data.length===1,message);return result.data[0];}

async function main(){
  if(process.argv.length===3&&process.argv[2]==='--help'){
    console.log('Local account E2E: ACCOUNT_E2E_PLAYWRIGHT=/absolute/playwright/index.mjs node scripts/test-account-e2e.mjs --input /private/path/input.json\n'
      +'Private input JSON (mode0600 outside repository): {purpose:"livestocks-synthetic-account-e2e",config:{AUTH0_DOMAIN,AUTH0_CLIENT_ID,AUTH0_CLIENT_SECRET,AUTH0_MCP_CLIENT_ID,AUTH0_WEB_AUDIENCE,AUTH0_MCP_AUDIENCE},users:[{user_id,email,password,connection},...]}\n'
      +'Exactly two existing synthetic @example.invalid users are required. No tenant setup or real-owner account is accepted.\n'
      +'Requires macOS ARM64, native PostgreSQL tools, existing Playwright Chromium, and free localhost3109.\n'
      +'Builds an isolated production app copy without .env files; launches fresh local PostgreSQL/PostgREST and private browser contexts.\n'
      +'No hosted DB writes; no user-browser profile. Report: output/playwright/account-e2e/latest.json.');return;
  }
  check(process.argv.length===4&&process.argv[2]==='--input','Provide --input /absolute/private/synthetic-config.json');process.umask(0o077);
  const reportPath=join(root,'output/playwright/account-e2e/latest.json');await mkdir(dirname(reportPath),{recursive:true});
  try{
    const {config,users}=await privateInput(process.argv[3]);
    const playwrightModule=process.env.ACCOUNT_E2E_PLAYWRIGHT;check(playwrightModule&&isAbsolute(playwrightModule),'Set ACCOUNT_E2E_PLAYWRIGHT to an installed Playwright module');
    const {chromium}=await import(playwrightModule);
    await port(3109);runtime=await mkdtemp('/private/tmp/livestocks-account-e2e-');pgData=join(runtime,'postgres');
    phase='native_database';const native=await nativeRest();const pgPort=await port();const restPort=await port();const gatePort=await port();
    check(new Set([pgPort,restPort,gatePort,3109]).size===4,'Local port collision');
    dbUrl=`postgres://postgres@127.0.0.1:${pgPort}/postgres?hostaddr=127.0.0.1&sslmode=disable`;
    command('initdb',['-D',pgData,'-U','postgres','--auth=trust','--no-locale','-E','UTF8']);
    command('pg_ctl',['-D',pgData,'-l',join(runtime,'postgres.log'),'-o',`-h 127.0.0.1 -p ${pgPort} -c unix_socket_directories=''`,'-w','-t','30','start']);
    sql("create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role authenticator login noinherit nosuperuser nobypassrls;grant anon,authenticated,service_role to authenticator;create schema auth;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth,public to anon,authenticated,service_role;");
    for(const name of(await readdir(join(root,'supabase/migrations'))).filter(n=>n.endsWith('.sql')).sort())command('psql',[dbUrl,'-X','-q','-v','ON_ERROR_STOP=1','-f',join(root,'supabase/migrations',name)]);
    sql(`insert into private.auth_config(issuer,website_client_id,mcp_client_id,website_audience,mcp_audience)values(${[issuer,config.AUTH0_CLIENT_ID,config.AUTH0_MCP_CLIENT_ID,config.AUTH0_WEB_AUDIENCE,config.AUTH0_MCP_AUDIENCE].map(literal).join(',')});`);
    const instance=randomBytes(16).toString('hex');sql(`create function public.account_gate_identity()returns jsonb language sql stable as $$select jsonb_build_object('instance','${instance}','role',current_user)$$;`);
    const jwksResponse=await fetch(new URL('.well-known/jwks.json',issuer),{signal:AbortSignal.timeout(20_000)});check(jwksResponse.ok,'Trusted Auth0 JWKS unavailable');const jwks=await jwksResponse.json();
    const localKey=randomBytes(32);const kid=`local-${instance}`;jwks.keys.push({kty:'oct',k:localKey.toString('base64url'),alg:'HS256',kid,use:'sig'});
    const token=role=>new SignJWT({role}).setProtectedHeader({alg:'HS256',kid}).setIssuedAt().setExpirationTime('1h').sign(localKey);
    const anon=await token('anon');const service=await token('service_role');
    rest=launch(native.binary,[],{...native.env,PGRST_DB_URI:`postgres://authenticator@127.0.0.1:${pgPort}/postgres?sslmode=disable`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_DB_CONFIG:'false',PGRST_JWT_SECRET:JSON.stringify(jwks),PGRST_JWT_ROLE_CLAIM_KEY:'.role',PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(restPort),PGRST_LOG_LEVEL:'error',PGRST_OPENAPI_MODE:'disabled'},'postgrest.log');
    await waitReady(rest,`http://127.0.0.1:${restPort}/rpc/account_gate_identity`,async r=>r.ok&&(await r.json()).instance===instance);
    gateway=httpServer((request,response)=>{
      if(!request.url?.startsWith('/rest/v1/')){response.writeHead(404);response.end();return;}
      if(request.headers.origin===origin){response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Vary','Origin');response.setHeader('Access-Control-Allow-Headers',request.headers['access-control-request-headers']||'authorization,apikey,content-type,prefer,x-client-info,range,range-unit');response.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,HEAD,OPTIONS');}
      if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
      if(![anon,service].includes(request.headers.apikey)){response.writeHead(401);response.end();return;}
      const upstream=httpRequest({hostname:'127.0.0.1',port:restPort,path:request.url.slice('/rest/v1'.length),method:request.method,headers:{...request.headers,host:`127.0.0.1:${restPort}`}},reply=>{response.writeHead(reply.statusCode,reply.headers);reply.pipe(response);});
      upstream.on('error',()=>{response.writeHead(502);response.end();});request.pipe(upstream);
    });await new Promise(ok=>gateway.listen(gatePort,'127.0.0.1',ok));
    const databaseOrigin=`http://127.0.0.1:${gatePort}`;
    phase='next_build';const app=await makeAppCopy(instance);
    const appEnv={...cleanEnv,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',APP_BASE_URL:origin,
      AUTH0_DOMAIN:config.AUTH0_DOMAIN,AUTH0_CLIENT_ID:config.AUTH0_CLIENT_ID,AUTH0_CLIENT_SECRET:config.AUTH0_CLIENT_SECRET,
      AUTH0_MCP_CLIENT_ID:config.AUTH0_MCP_CLIENT_ID,AUTH0_WEB_AUDIENCE:config.AUTH0_WEB_AUDIENCE,AUTH0_MCP_AUDIENCE:config.AUTH0_MCP_AUDIENCE,
      AUTH0_SECRET:randomBytes(32).toString('hex'),CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('hex'),
      NEXT_PUBLIC_SUPABASE_URL:databaseOrigin,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service};
    next=launch(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'build',app,'--webpack'],appEnv,'build.log',app);
    await Promise.race([next.stopped,delay(180_000,undefined,{ref:false}).then(()=>{throw new Error('Isolated production build timed out');})]);
    if(next.exitCode!==0){const log=await readFile(join(runtime,'build.log'),'utf8');report.buildErrors=log.split('\n').filter(line=>/Type error:|Module not found|Error:|Failed to compile/.test(line)).map(line=>line.replace(/https?:\/\/\S+/g,'[url]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[token]').slice(0,240));}
    check(next.exitCode===0,'Isolated production build failed');
    phase='next_start';next=launch(process.execPath,[join(root,'node_modules/next/dist/bin/next'),'start',app,'--hostname','127.0.0.1','--port','3109'],appEnv,'next.log',app);
    await waitReady(next,`${origin}/api/account-e2e-gate`,async r=>r.ok&&(await r.json()).instance===instance,120);
    record('isolated_next_and_pinned_local_rest_ready',{noEnvFiles:true,noProductionDatabase:true});
    phase='anonymous_denial';
    for(const path of ['/api/account/session','/api/account/database-token','/api/portfolio/ai','/api/portfolio/ai?format=html']){const r=await fetch(`${origin}${path}`,{signal:AbortSignal.timeout(60_000)});check(r.status===401,'Anonymous private endpoint was not denied');check(r.headers.get('cache-control')?.includes('no-store'),'Anonymous private endpoint was cacheable');}
    record('anonymous_session_token_json_html_denied');
    phase='real_browser_login';browser=await chromium.launch({headless:true});
    const contexts=[await browser.newContext(),await browser.newContext()];const pages=[];
    for(let i=0;i<2;i++){
      const page=await login(contexts[i],users[i]);pages.push(page);
      const session=await browserJson(page,'/api/account/session');check(session.status===200&&session.data?.user?.id===users[i].user_id&&session.data.user.emailVerified===true,'Next SDK session owner mismatch');
      const credential=await browserJson(page,'/api/account/database-token');check(credential.status===200&&credential.data.userId===users[i].user_id&&typeof credential.data.accessToken==='string','Cookie-backed database token failed');check(credential.cache?.includes('no-store'),'Database token was cacheable');
      for(const table of tables){const result=await browserDb(page,'read',table);check(!result.error&&result.data?.length===(table==='settings'?1:0),`Fresh account ${table} check failed (code=${result.error?.code??'none'}, rows=${result.data?.length??'none'})`);if(table==='settings')check(result.data[0].user_id===users[i].user_id,'Default settings owner mismatch');}
      check(Number(sql(`select count(*) from public.user_profiles where id=${literal(users[i].user_id)}`))===1,'Profile bootstrap missing');
      record(`account_${i===0?'a':'b'}_real_login_session_token_empty_bootstrap`);
    }
    phase='browser_financial_fixtures';const fixtures=[];
    for(let i=0;i<2;i++){
      const page=pages[i];const label=i===0?'E2EA':'E2EB';const rows={};
      const source=one(await browserDb(page,'read','investment_sources'),'Default investment source missing');
      check(source.user_id===users[i].user_id&&source.archived_at===null,'Default source owner/state mismatch');
      rows.investment_sources=source;
      const purchase={p_request_id:randomUUID(),p_symbol:label,p_display:`Synthetic ${label}`,p_image_url:'',p_location:source.id,p_price:10+i,p_quantity:2,p_executed_at:'2026-01-01',p_has_commission:false,p_commission_amount:0};
      one(await browserDb(page,'rpc','record_position_purchase',purchase),'Real browser purchase RPC failed');
      one(await browserDb(page,'rpc','record_position_purchase',purchase),'Real browser idempotent retry failed');
      rows.positions=one(await browserDb(page,'read','positions'),'Browser position missing');rows.position_lots=one(await browserDb(page,'read','position_lots'),'Browser lot missing');
      rows.position_plans=one(await browserDb(page,'insert','position_plans',{symbol:`${label}PLAN`,location:source.id,target_price:20,target_quantity:1,target_date:'2027-01-01'}),'Browser plan creation failed');
      rows.settings=one(await browserDb(page,'read','settings'),'Browser settings missing');
      rows.watchlist_groups=one(await browserDb(page,'insert','watchlist_groups',{name:`Synthetic ${label}`}),'Browser group creation failed');
      rows.watchlist_tickers=one(await browserDb(page,'insert','watchlist_tickers',{group_id:rows.watchlist_groups.id,symbol:label}),'Browser ticker creation failed');fixtures.push(rows);
    }
    const changes={positions:{display:'Synthetic updated'},position_lots:{price:15},position_plans:{target_price:25},settings:{annual_growth_rate:0.07},watchlist_groups:{name:'Synthetic updated'},watchlist_tickers:{note:'Synthetic updated'}};
    for(const table of tables){for(let i=0;i<2;i++){
      const row=one(await browserDb(pages[i],'read',table),'Browser observed unexpected row count');check(row.user_id===users[i].user_id,'Browser read another account');
      for(const method of ['update','remove']){const result=await browserDb(pages[i],method,table,fixtures[1-i][table].id,changes[table]);check(!result.error&&result.data.length===0,'Cross-account browser mutation affected a row');}
      one(await browserDb(pages[i],'update',table,fixtures[i][table].id,changes[table]),'Own browser mutation failed');
    }record(`${table}_browser_sdk_isolation_and_writes`);}
    phase='authenticated_snapshots';
    for(let i=0;i<2;i++){
      const result=await browserJson(pages[i],'/api/portfolio/ai');check(result.status===200&&result.data.positions.length===1&&result.data.positions[0].id===fixtures[i].positions.id,'Next snapshot owner mismatch');
      check(result.data.positions[0].lots.length===1&&result.data.plans.length===1,'Next snapshot omitted financial records');check(result.cache?.includes('no-store'),'Personal JSON snapshot was cacheable');
      check(result.data.holdings[0].currentPriceUsd===null,'Missing credential should not invent a price');
      const html=await pages[i].evaluate(async()=>{const r=await fetch('/api/portfolio/ai?format=html');return{status:r.status,text:await r.text(),cache:r.headers.get('cache-control')};});
      check(html.status===200&&html.text.includes(fixtures[i].positions.id)&&!html.text.includes(fixtures[1-i].positions.id)&&html.cache.includes('no-store'),'HTML snapshot crossed account boundary or was cached');
      record(`account_${i===0?'a':'b'}_next_json_html_snapshot_isolation`);
    }
    phase='account_switch_abort';const page=pages[0];let held;let resolveHeld;const heldPromise=new Promise(ok=>{resolveHeld=ok;});
    const pattern=`${databaseOrigin}/rest/v1/positions*`;await page.route(pattern,route=>{if(!held){held=route;resolveHeld();}else void route.continue();});
    await page.evaluate(()=>{localStorage.setItem('settings','old-account');localStorage.setItem('watchlist:ticker:e2e','old-account');window.__staleStatus='pending';Promise.resolve(window.__accountGate.read('positions')).then(r=>{window.__staleStatus=r.error?'rejected':'resolved';},()=>{window.__staleStatus='rejected';});});
    await Promise.race([heldPromise,delay(10_000).then(()=>{throw new Error('No in-flight browser request was observed');})]);
    const bCookies=await contexts[1].cookies(origin);await contexts[0].clearCookies();await contexts[0].addCookies(bCookies);
    await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'livestocks:account-change',newValue:`session:${Date.now()}`})));
    await page.waitForFunction(()=>window.__staleStatus==='rejected',null,{timeout:10_000});
    await held.abort().catch(()=>{});await page.unroute(pattern);
    await page.waitForFunction(()=>Boolean(window.__accountGate),null,{timeout:10_000});
    let switched=false;for(let attempt=0;attempt<30;attempt++){try{const value=await browserDb(page,'read','positions');if(!value.error&&value.data?.length===1&&value.data[0].id===fixtures[1].positions.id){switched=true;break;}}catch{}await delay(200);}
    check(switched,'Account switch did not replace browser data identity');
    check(await page.evaluate(()=>localStorage.getItem('settings')!=='old-account'&&localStorage.getItem('watchlist:ticker:e2e')===null),'Previous account cache survived switch');
    record('account_switch_aborts_inflight_request_and_replaces_identity');
    report.status='PASS_LOCAL_NEXT_AUTH0_RLS';
  }catch(error){report.status='INCOMPLETE';const message=error.message?.split('\n')[0];report.failure={phase,reason:typeof message==='string'&&message.length<180&&!/eyJ|https?:|password|secret/i.test(message)?message:'Check failed; sensitive diagnostics suppressed'};
    if(browser)report.browserState=await Promise.all(browser.contexts().flatMap(c=>c.pages()).map(async page=>{const text=await page.locator('body').innerText().catch(()=>'');return{path:new URL(page.url()).pathname,rateLimited:/too many|rate limit/i.test(text),challenge:/captcha|verify you are human/i.test(text),rejected:/invalid_request|unauthorized|access_denied|wrong email or password/i.test(text),loading:/Loading|טוען/.test(text),clientException:/client-side exception|Application error/i.test(text)};}));
    throw error;}
  finally{
    cancelled=false;await browser?.close().catch(()=>{});await stop(next);await stop(rest);
    if(gateway){gateway.closeAllConnections();await new Promise(ok=>gateway.close(ok));}
    let cleaned=true;if(pgData){try{command('pg_ctl',['-D',pgData,'-m','immediate','-w','-t','30','stop']);}catch{cleaned=!(await lstat(join(pgData,'postmaster.pid')).then(()=>true,()=>false));}}
    if(runtime&&cleaned)await rm(runtime,{recursive:true,force:true});report.cleanup=cleaned?'COMPLETE':'FAILED_PRIVATE_RUNTIME_RETAINED';if(!cleaned)report.status='INCOMPLETE';
    report.completedAt=new Date().toISOString();await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`,{mode:0o600});
    console.log(JSON.stringify({status:report.status,cases:report.cases.length,cleanup:report.cleanup,report:reportPath}));
  }
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{cancelled=true;void stop(next);void stop(rest);});
main().catch(()=>{console.error('Local account E2E did not pass; see sanitized report.');process.exitCode=1;});
