#!/usr/bin/env node
/** Disposable real app + PostgreSQL + PostgREST for a human ChatGPT host gate.
 * Never loads .env, existing databases, cloud projects, production keys or portfolios.
 * The public HTTPS tunnel must forward to loopback port 3137. All data is synthetic.
 */
import { readFile, writeFile, mkdtemp, mkdir, symlink, readdir, rm, realpath, chmod, open, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Pool, types as pgTypes } from 'pg';
// Real PostgREST emits DATE as a calendar string; do not shift it via local TZ.
pgTypes.setTypeParser(1082, value => value);
import { SignJWT } from 'jose';
import { applyChatSyncResourceDiagnostic } from './lib/chat-sync-resource-diagnostic.mjs';
import { makeLostConfirmationReply } from './lib/chat-sync-fixture-fault.mjs';
import { runOAuthSyncGate } from './lib/chat-sync-oauth-gate.mjs';
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib';
const execute = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATEWAY_PORT = 3137, NEXT_PORT = 3140;
const cleanBase = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'en_US.UTF-8', NEXT_TELEMETRY_DISABLED: '1', NO_COLOR: '1' };
process.umask(0o077);
const options = Object.fromEntries(process.argv.slice(3).reduce((rows, arg, index, all) => {
  if (index % 2 === 0) {
    const name = arg.slice(2);
    if (!arg.startsWith('--') || !['state-file','origin','postgrest','callback'].includes(name) || !all[index + 1] || rows.some(([key]) => key === name)) throw Error('Use supported, unique option/value pairs');
    rows.push([name, all[index + 1]]);
  }
  return rows;
}, []));
const stateFile = resolve(options['state-file'] || '/private/tmp/livestocks-chat-sync-state.json');
if (!stateFile.startsWith('/private/tmp/')) throw Error('State must be a private temporary path');
const mode = process.argv[2];
function applyEnvironment(environment) { for (const name of Object.keys(process.env)) if (!(name in cleanBase)) delete process.env[name]; Object.assign(process.env, environment); }
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
async function writeState(state) { await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 }); await chmod(stateFile, 0o600); }
async function readState() {
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  if (state.kind !== 'livestocks-disposable-chat-sync-v1' || !state.runtime.startsWith('/private/tmp/livestocks-chat-sync-runtime-') || state.productionAccess !== false) throw Error('Invalid isolated fixture state');
  if (await realpath(state.runtime) !== state.runtime) throw Error('Runtime must be the original temporary directory');
  if (state.adminDatabaseUrl) { const database = new URL(state.adminDatabaseUrl); if (database.hostname !== '127.0.0.1' || Number(database.port) !== state.pgPort) throw Error('Only this disposable loopback database is allowed'); }
  if (state.environment && (state.environment.APP_BASE_URL !== state.origin || state.environment.NEXT_PUBLIC_SUPABASE_URL !== state.origin)) throw Error('Isolated application origin mismatch');
  return state;
}
async function freePort() { const server = createNetServer(); await new Promise((yes, no) => server.once('error', no).listen(0, '127.0.0.1', yes)); const port = server.address().port; await new Promise(yes => server.close(yes)); return port; }
async function command(commandName, args, extra = {}) { return execute(commandName, args, { env: cleanBase, maxBuffer: 8 * 1024 * 1024, ...extra }); }
async function runLogged(commandName, args, filename, extra = {}) {
  const handle = await open(filename, 'a', 0o600);
  try {
    const processHandle = spawn(commandName, args, { env: cleanBase, stdio: ['ignore', handle.fd, handle.fd], ...extra });
    await new Promise((yes, no) => { processHandle.once('error', no); processHandle.once('exit', code => code === 0 ? yes() : no(new Error('Isolated build failed; inspect private log ' + filename))); });
  } finally { await handle.close(); }
}
async function startProcess(state, name, commandName, args, env, cwd) {
  const handle = await open(join(state.runtime, name + '.log'), 'a', 0o600);
  const child = spawn(commandName, args, { env, cwd, detached: true, stdio: ['ignore', handle.fd, handle.fd] });
  await handle.close();
  child.unref(); state.processes[name] = child.pid; await writeState(state);
  return child;
}
async function until(check, label, ms = 60000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { try { if (await check()) return; } catch {} await delay(500); }
  throw new Error('Isolated fixture readiness timed out: ' + label);
}
async function stop(state) {
  for (const [name, pid] of Object.entries(state.processes ?? {}).reverse()) {
    if (name === 'postgres') continue;
    try { process.kill(-pid, 'SIGTERM'); } catch {}
  }
  if (state.postgresStarted) {
    await command('pg_ctl', ['-D', join(state.runtime, 'pg'), '-m', 'immediate', '-w', '-t', '30', 'stop']);
  }
  await rm(state.runtime, { recursive: true, force: true });
  await rm(stateFile, { force: true });
}
async function buildSdkHelper(state) {
  const source = String.raw`
import {Pool} from 'pg';import {hashPassword} from 'better-auth/crypto';
import {randomUUID,randomBytes} from 'node:crypto';
import {getBetterAuth,getBetterAuthSession,getWebsiteDatabaseToken,seedMcpClient,shutdownBetterAuth} from './lib/auth/better-auth.ts';
export {mapPositionRow,computeRealizedSales,summarizeLots} from './lib/positions.ts';
import {getConsentReview} from './lib/auth/oauth-consent.ts';
export async function consentReview(query,cookie){try{return await getConsentReview(query,new Headers({cookie}));}finally{await shutdownBetterAuth();}}
export async function bootstrap(adminUrl){
 const pool=new Pool({connectionString:adminUrl}),users=[];const auth=getBetterAuth();await auth.$context;
 try{for(let index=0;index<2;index++){
 const id=randomUUID(),email='livestocks-sync-'+(index+1)+'-'+randomBytes(4).toString('hex')+'@example.invalid',password=randomBytes(24).toString('base64url')+'!A1';
 const hash=await hashPassword(password);
 await pool.query('insert into livestocks_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt")values($1,$2,$3,true,now(),now())',[id,'Synthetic Sync Account '+(index+1),email]);
 await pool.query('insert into livestocks_auth.account(id,"accountId","providerId","userId",password,"createdAt","updatedAt")values($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,hash]);
 const response=await auth.handler(new Request(process.env.APP_BASE_URL+'/api/auth/sign-in/email',{method:'POST',headers:{origin:process.env.APP_BASE_URL,'content-type':'application/json'},body:JSON.stringify({email,password})}));
 if(!response.ok)throw Error('Synthetic verified sign-in failed: '+response.status);
 const cookie=response.headers.getSetCookie().map(item=>item.split(';')[0]).join('; ');
 const session=await getBetterAuthSession(new Headers({cookie}));if(session?.user.id!==id)throw Error('Synthetic session missing');
 const created=Math.floor(new Date(session.session.createdAt).getTime()/1000);
 const result=await pool.query('select public.server_bootstrap_web_account($1,$2,$3) as profile',[process.env.APP_BASE_URL+'/api/auth',id,created]);
 users.push({email,password,subject:id,profileId:result.rows[0].profile.profile_id,cookie,sessionId:session.session.id});
 await getWebsiteDatabaseToken(new Headers({cookie}));
 }
 const keysResponse=await auth.handler(new Request(process.env.APP_BASE_URL+'/api/auth/jwks'));
 if(!keysResponse.ok)throw Error('Synthetic JWKS failed');return {users,jwks:await keysResponse.json()};
 }finally{await pool.end();await shutdownBetterAuth();}
}
export async function seed(cookie,callbacks){try{return await seedMcpClient(new Headers({cookie}),callbacks,{enablePortfolioSync:true});}finally{await shutdownBetterAuth();}}
`;
  const output = await build({ stdin: { contents: source, resolveDir: state.source, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
    plugins: [{ name: 'test-only-server-marker', setup(builder) { builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'marker', namespace: 'empty' })); builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' })); } }] });
  const filename = join(state.runtime, 'sdk.mjs'); await writeFile(filename, output.outputFiles[0].text, { mode: 0o600 }); return filename;
}
async function seed(state, callback) {
  const url = new URL(callback); if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com' || url.search || url.hash) throw Error('Observe the exact ChatGPT HTTPS callback first');
  applyEnvironment(state.environment);
  const sdk = await import(pathToFileURL(state.sdk).href);
  await sdk.seed(state.users[0].cookie, [callback]); state.callback = callback; await writeState(state);
}
async function snapshot(state) {
  const pool = new Pool({ connectionString: state.adminDatabaseUrl });
  const sdk = await import(pathToFileURL(state.sdk).href);
  try {
    const accounts = [];
    for (let index = 0; index < state.users.length; index++) {
      const user = state.users[index], tables = {};
      for (const table of ['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers']) {
        const result = await pool.query('select count(*)::int as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by t.id),\'[]\'::jsonb)::text,\'UTF8\')),\'hex\')as digest from public.' + table + ' t where user_id=$1', [user.profileId]);
        tables[table] = result.rows[0];
      }
      const originals = await pool.query("select count(*)::int as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'UTF8')),'hex')as digest from public.position_lots t where user_id=$1 and side<>'RECONCILE'", [user.profileId]);
      const positions = await pool.query('select * from public.positions where user_id=$1 order by id', [user.profileId]);
      const lots = await pool.query('select * from public.position_lots where user_id=$1 order by executed_at,created_at,id', [user.profileId]);
      // Match the real PostgREST JSON date representation, not pg's Date objects.
      const restPositions = JSON.parse(JSON.stringify(positions.rows)), restLots = JSON.parse(JSON.stringify(lots.rows));
      const holdings = restPositions.map(position => sdk.mapPositionRow({ ...position, position_lots: restLots.filter(lot => lot.position_id === position.id) }));
      accounts.push({ account: index + 1, tables, originalTradeLots: originals.rows[0], holdings: holdings.map(position => ({ symbol: position.symbol, quantity: position.quantity, averageCostUsd: position.entryPrice, recordedRealizedProfitUsd: sdk.computeRealizedSales(position).reduce((sum,sale) => sum + sale.profitUsd,0) })) });
    }
    return { productionAccess: false, sourceCommit: state.sourceCommit, accounts };
  } finally { await pool.end(); }
}
async function serve(state) {
  const origin = new URL(state.origin);
  createServer(async (request, response) => {
    const path = new URL(request.url, state.origin).pathname;
    if (path === '/__isolated-health') { response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify({ isolated: true, productionAccess: false, sourceCommit: state.sourceCommit })); return; }
    const rest = path.startsWith('/rest/v1/');
    const target = 'http://127.0.0.1:' + (rest ? state.restPort : NEXT_PORT) + (rest ? request.url.slice('/rest/v1'.length) : request.url);
    const headers = { ...request.headers, host: rest ? '127.0.0.1:' + state.restPort : origin.host, 'x-forwarded-host': origin.host, 'x-forwarded-proto': 'https', 'ngrok-skip-browser-warning': '1' };
    delete headers.connection; delete headers['content-length'];
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      let loseConfirm = false, rpc = null;
      try { rpc = JSON.parse(body.toString('utf8')); loseConfirm = path === '/api/mcp' && rpc.method === 'tools/call' && rpc.params?.name === 'confirm_screenshot_sync' && existsSync(join(state.runtime, 'lose-next-confirm.flag')); } catch {}
      // Raw HTTP preserves navigation Sec-Fetch headers and compressed bytes.
      // Undici fetch overwrites sec-fetch-mode to cors, changing the real OAuth
      // provider's browser redirect into a JSON transport response.
      const upstream = await new Promise((yes, no) => {
        const proxy = httpRequest(target, { method: request.method, headers }, yes);
        proxy.once('error', no); proxy.end(['GET', 'HEAD'].includes(request.method) ? undefined : body);
      });
      let resultHeaders = Object.fromEntries(Object.entries(upstream.headers).filter(([key]) => !['connection', 'keep-alive', 'transfer-encoding'].includes(key)));
      const responseChunks = []; for await (const chunk of upstream) responseChunks.push(chunk);
      let responseBody = Buffer.concat(responseChunks);
      const diagnostic = await applyChatSyncResourceDiagnostic({ runtime: state.runtime, productionAccess: state.productionAccess, rpc, statusCode: upstream.statusCode, headers: resultHeaders, body: responseBody });
      resultHeaders = diagnostic.headers; responseBody = diagnostic.body;
      if (diagnostic.observation.applied) await appendFile(join(state.runtime, 'resource-diagnostic-observations.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...diagnostic.observation }) + '\n', { mode: 0o600 });
      if (loseConfirm) {
        try {
          let decoded = responseBody; const encoding = String(resultHeaders['content-encoding'] || '').toLowerCase();
          if (encoding === 'gzip') decoded = gunzipSync(decoded); else if (encoding === 'br') decoded = brotliDecompressSync(decoded); else if (encoding === 'deflate') decoded = inflateSync(decoded);
          const receipt = JSON.parse(decoded.toString('utf8'));
          if (receipt.result?.structuredContent?.applied === true) {
            await rm(join(state.runtime, 'lose-next-confirm.flag'), { force: true });
            const payload = JSON.parse(body.toString('utf8'));
            const protocolVersion = request.headers['mcp-protocol-version'] ?? payload.params?._meta?.['io.modelcontextprotocol/protocolVersion'] ?? '2026-07-28';
            response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            response.end(JSON.stringify(makeLostConfirmationReply({ productionAccess: state.productionAccess, id: payload.id, protocolVersion }))); return;
          }
        } catch {}
      }
      response.writeHead(upstream.statusCode, resultHeaders); response.end(responseBody);
    } catch { response.writeHead(502, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: 'Isolated test upstream unavailable' })); }
  }).listen(GATEWAY_PORT, '127.0.0.1', () => console.log('Isolated gateway ready'));
}
async function start() {
  if (existsSync(stateFile)) throw Error('An isolated state already exists; stop it explicitly before another start');
  const parsed = new URL(options.origin || '');
  if (parsed.protocol !== 'https:' || parsed.origin !== options.origin || !/\.(ngrok-free\.app|ngrok\.app|trycloudflare\.com)$/.test(parsed.hostname)) throw Error('Use an isolated temporary HTTPS tunnel origin');
  const postgrest = await realpath(options.postgrest || ''); if (!postgrest.startsWith('/private/tmp/')) throw Error('Use an explicitly downloaded temporary PostgREST binary');
  const runtime = await mkdtemp('/private/tmp/livestocks-chat-sync-runtime-'); await chmod(runtime, 0o700);
  const state = { kind: 'livestocks-disposable-chat-sync-v1', productionAccess: false, status: 'starting', runtime, source: join(runtime, 'source'), sdk: '', origin: parsed.origin, processes: {}, postgresStarted: false, pgPort: await freePort(), restPort: await freePort(), users: [] };
  await writeState(state);
  try {
    await mkdir(state.source); const archive = join(runtime, 'source.tar');
    const archiveHandle = await open(archive, 'w', 0o600); const archiver = spawn('git', ['archive', 'HEAD'], { cwd: repository, env: cleanBase, stdio: ['ignore', archiveHandle.fd, 'pipe'] });
    await new Promise((yes, no) => { archiver.once('error', no); archiver.once('exit', code => code === 0 ? yes() : no(new Error('Source archive failed'))); }); await archiveHandle.close();
    await command('tar', ['-xf', archive, '-C', state.source]); await rm(archive);
    for (const name of await readdir(state.source)) if (name === '.vercel' || /^\.env(?:\.|$)/.test(name)) await rm(join(state.source, name), { recursive: true, force: true });
    if ((await readdir(state.source)).some(name => name === '.vercel' || /^\.env(?:\.|$)/.test(name))) throw Error('Source copy retains external environment files');
    await symlink(join(repository, 'node_modules'), join(state.source, 'node_modules')); await symlink(join(repository, 'node_modules'), join(runtime, 'node_modules'));
    state.sourceCommit = (await command('git', ['rev-parse', 'HEAD'], { cwd: repository })).stdout.trim();
    await command('initdb', ['-D', join(runtime, 'pg'), '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8']);
    await command('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(runtime, 'server.key'), '-out', join(runtime, 'server.crt'), '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost', '-addext', 'basicConstraints=critical,CA:TRUE']);
    await chmod(join(runtime, 'server.key'), 0o600);
    await command('pg_ctl', ['-D', join(runtime, 'pg'), '-l', join(runtime, 'postgres.log'), '-o', '-h 127.0.0.1 -p ' + state.pgPort + " -c unix_socket_directories='' -c ssl=on -c ssl_cert_file=" + join(runtime, 'server.crt') + ' -c ssl_key_file=' + join(runtime, 'server.key'), '-w', 'start']);
    state.postgresStarted = true; state.adminDatabaseUrl = 'postgres://postgres@127.0.0.1:' + state.pgPort + '/postgres?sslmode=disable'; await writeState(state);
    const admin = new Pool({ connectionString: state.adminDatabaseUrl });
    const backendPassword = randomBytes(32).toString('hex'), authenticatorPassword = randomBytes(32).toString('hex'), jwtSecret = randomBytes(32);
    try {
      await admin.query("create role anon;create role authenticated;create role service_role bypassrls;create role authenticator noinherit login;grant anon,authenticated,service_role to authenticator;create schema auth;create function auth.jwt()returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth,public to anon,authenticated,service_role;");
      for (const migration of (await readdir(join(state.source, 'supabase/migrations'))).filter(name => name.endsWith('.sql')).sort()) await command('psql', [state.adminDatabaseUrl, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', join(state.source, 'supabase/migrations', migration)]);
      await admin.query("alter role livestocks_auth_backend login password '" + backendPassword + "';alter role authenticator password '" + authenticatorPassword + "';");
      state.environment = { ...cleanBase, NODE_ENV: 'production', APP_BASE_URL: state.origin, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'), BETTER_AUTH_MCP_CLIENT_SECRET: randomBytes(48).toString('hex'), BETTER_AUTH_WEBSITE_CLIENT_ID: 'sync-test-web-' + randomBytes(6).toString('hex'), BETTER_AUTH_MCP_CLIENT_ID: 'sync-test-mcp-' + randomBytes(6).toString('hex'), BETTER_AUTH_DATABASE_URL: 'postgres://livestocks_auth_backend:' + backendPassword + '@127.0.0.1:' + state.pgPort + '/postgres', BETTER_AUTH_DATABASE_CA: await readFile(join(runtime, 'server.crt'), 'utf8'), PASSWORD_AUTH_ENABLED: 'true', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', NEXT_PUBLIC_SUPABASE_URL: state.origin, CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex'), LIVESTOCKS_MAINTENANCE: 'false', ACCOUNT_LINKING_ENABLED: 'false', PUBLISHER_NAME: 'LiveStocks isolated test', PUBLIC_SUPPORT_EMAIL: 'isolated-test@example.invalid' };
      const signRole = async role => new SignJWT({ role }).setProtectedHeader({ alg: 'HS256', kid: 'isolated-hs256' }).setIssuedAt().setExpirationTime('2d').sign(jwtSecret);
      state.environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = await signRole('anon'); state.environment.SUPABASE_SERVICE_ROLE_KEY = await signRole('service_role');
      await admin.query('insert into private.auth_config(singleton,issuer,website_client_id,mcp_client_id,website_audience,mcp_audience,auth_provider)values(true,$1,$2,$3,$4,$5,\'better_auth\')', [state.origin + '/api/auth', state.environment.BETTER_AUTH_WEBSITE_CLIENT_ID, state.environment.BETTER_AUTH_MCP_CLIENT_ID, state.origin + '/api/web', state.origin + '/api/mcp']);
      applyEnvironment(state.environment); state.sdk = await buildSdkHelper(state); const sdk = await import(pathToFileURL(state.sdk).href); const setup = await sdk.bootstrap(state.adminDatabaseUrl); state.users = setup.users;
      const jwks = { keys: [...setup.jwks.keys, { kty: 'oct', alg: 'HS256', kid: 'isolated-hs256', k: jwtSecret.toString('base64url') }] };
      const config = 'db-uri = ' + JSON.stringify('postgres://authenticator:' + authenticatorPassword + '@127.0.0.1:' + state.pgPort + '/postgres?sslmode=require') + '\ndb-schemas = "public"\ndb-anon-role = "anon"\nserver-host = "127.0.0.1"\nserver-port = ' + state.restPort + '\njwt-secret = ' + JSON.stringify(JSON.stringify(jwks)) + '\n';
      const restConfig = join(runtime, 'postgrest.conf'); await writeFile(restConfig, config, { mode: 0o600 });
      for (let index = 0; index < state.users.length; index++) {
        const user = state.users[index], symbol = index ? 'MSFT' : 'AAPL';
        const source = await admin.query('select id from public.investment_sources where user_id=$1 and archived_at is null order by created_at,id', [user.profileId]);
        if (source.rows.length !== 1) throw Error('Synthetic account must have one initial source');
        user.sourceId = source.rows[0].id;
        const position = await admin.query('insert into public.positions(user_id,symbol,display,image_url,location,entry_price,quantity,entry_date)values($1,$2,$2,\'\',$5,$3,$4,\'2026-01-01\')returning id', [user.profileId, symbol, index ? 200 : 100, index ? 7 : 8, user.sourceId]);
        await admin.query('insert into public.position_lots(user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount)values($1,$2,\'BUY\',$3,$4,\'2026-01-01\',false,0)', [user.profileId, position.rows[0].id, index ? 200 : 100, index ? 7 : 10]);
        if (!index) await admin.query('insert into public.position_lots(user_id,position_id,side,price,quantity,executed_at,has_commission,commission_amount)values($1,$2,\'SELL\',120,2,\'2026-02-01\',false,0)', [user.profileId, position.rows[0].id]);
      }
      await writeState(state);
      await startProcess(state, 'postgrest', postgrest, [restConfig], cleanBase, runtime);
      await until(async () => (await fetch('http://127.0.0.1:' + state.restPort + '/', { headers: { authorization: 'Bearer ' + state.environment.SUPABASE_SERVICE_ROLE_KEY } })).ok, 'PostgREST');
      await seed(state, options.callback || 'https://chatgpt.com/connector_platform_oauth_redirect');
      await runLogged(process.execPath, [join(repository, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], join(runtime, 'build.log'), { cwd: state.source, env: state.environment });
      await startProcess(state, 'next', process.execPath, [join(repository, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(NEXT_PORT)], state.environment, state.source);
      await until(async () => (await fetch('http://127.0.0.1:' + NEXT_PORT + '/.well-known/oauth-protected-resource')).ok, 'Next');
      await startProcess(state, 'gateway', process.execPath, [fileURLToPath(import.meta.url), 'serve', '--state-file', stateFile], cleanBase, repository);
      await until(async () => (await fetch('http://127.0.0.1:' + GATEWAY_PORT + '/__isolated-health')).ok, 'gateway');
      state.status = 'ready'; await writeState(state);
      console.log(JSON.stringify({ status: 'READY_ISOLATED', productionAccess: false, origin: state.origin, sourceCommit: state.sourceCommit, stateFile, syntheticAccounts: state.users.length }));
    } finally { await admin.end(); }
  } catch (error) {
    state.status = 'failed'; await writeState(state); console.error('Isolated fixture setup failed; private state retained for diagnosis:', stateFile); throw error;
  }
}
async function main() {
if (mode === 'start') await start();
else if (mode === 'serve') await serve(await readState());
else if (mode === 'seed-client') { const state = await readState(); await seed(state, options.callback || ''); console.log('PASS isolated MCP client registered; credentials remain private'); }
else if (mode === 'stop') { await stop(await readState()); console.log('PASS isolated processes/database/source removed; no production access'); }
else if (mode === 'restart-gateway') { const state = await readState(); try { process.kill(-state.processes.gateway, 'SIGTERM'); } catch {} await delay(400); await startProcess(state, 'gateway', process.execPath, [fileURLToPath(import.meta.url), 'serve', '--state-file', stateFile], cleanBase, repository); await until(async () => (await fetch('http://127.0.0.1:' + GATEWAY_PORT + '/__isolated-health')).ok, 'restarted gateway'); console.log('PASS isolated gateway restarted; database and sessions preserved'); }
else if (mode === 'oauth-sync-gate') { const state = await readState(); applyEnvironment(state.environment); state.sdk = await buildSdkHelper(state); await writeState(state); const sdk = await import(pathToFileURL(state.sdk).href); console.log(JSON.stringify(await runOAuthSyncGate({ state, sdk, snapshot: () => snapshot(state) }), null, 2)); }
else if (mode === 'snapshot') { console.log(JSON.stringify(await snapshot(await readState()), null, 2)); }
else if (mode === 'arm-lost-reply') { const state = await readState(); await writeFile(join(state.runtime, 'lose-next-confirm.flag'), 'armed', { mode: 0o600 }); console.log('Armed isolated one-shot confirmation reply loss'); }
else if (mode === 'status') { const state = await readState(); console.log(JSON.stringify({ status: state.status, origin: state.origin, productionAccess: state.productionAccess, sourceCommit: state.sourceCommit, syntheticAccounts: state.users.length })); }
else { const usage = 'Usage: start --origin HTTPS_TUNNEL --postgrest TEMP_BINARY --state-file PRIVATE_STATE | seed-client --state-file PRIVATE_STATE --callback EXACT_CHATGPT_CALLBACK | status/snapshot/oauth-sync-gate/restart-gateway/arm-lost-reply/stop --state-file PRIVATE_STATE'; if (mode === '--help' || mode === 'help') console.log(usage); else throw Error(usage); }

}
void main().catch(async error => {
  let log = stateFile + '.failure.log';
  try { const state = JSON.parse(await readFile(stateFile, 'utf8')); if (typeof state.runtime === 'string' && state.runtime.startsWith('/private/tmp/livestocks-chat-sync-runtime-') && existsSync(state.runtime)) log = join(state.runtime, 'failure.log'); } catch {}
  try { await writeFile(log, String(error?.stack || error), { mode: 0o600 }); await chmod(log, 0o600); console.error('Isolated fixture failed; inspect protected synthetic diagnostics:', log); }
  catch { console.error('Isolated fixture failed; private diagnostics could not be written.'); }
  process.exitCode = 1;
});
