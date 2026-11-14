#!/usr/bin/env node
/** Dedicated test project only. Prepare isolated SQL, then test real JWTs via hosted REST.
 * No dotenv, provider writes, existing-table mutations, migration, or automatic SQL execution.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRemoteJWKSet } from 'jose';
import ts from 'typescript';

process.umask(0o077);
const PROJECT = 'qdcvlhghabchxstoedzq';
const ORIGIN = `https://${PROJECT}.supabase.co`;
const ISSUER = 'https://dev-c8o5jwbmbzkzac2s.us.auth0.com/';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'livestocks_auth0_gate_';
const args = process.argv.slice(2);
function option(name) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
function check(value, message) { if (!value) throw new Error(message); }
function literal(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function isOutside(path, parent) { const part = relative(parent, path); return part === '..' || part.startsWith(`..${sep}`); }
async function privateFile(path) {
  check(typeof path === 'string' && path.startsWith('/'), 'A private absolute file path is required');
  const actual = await realpath(path), repository = await realpath(root), stat = await lstat(actual);
  check(isOutside(actual, repository) && isOutside(resolve(path), repository), 'Private inputs must be outside the repository');
  check(stat.isFile() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0 && stat.size < 1_000_000, 'Input must be an owner-only regular file under 1 MB');
  return readFile(actual, 'utf8');
}
async function privateDirectory(path, create = false) {
  check(typeof path === 'string' && path.startsWith('/'), 'An absolute private output directory is required');
  if (create) await mkdir(path, { recursive: true, mode: 0o700 });
  const actual = await realpath(path), repository = await realpath(root), stat = await lstat(actual);
  check(isOutside(actual, repository) && isOutside(resolve(path), repository), 'Private outputs must stay outside the repository');
  check(!/(?:Mobile Documents|CloudStorage|Dropbox|OneDrive|Google Drive)/i.test(actual), 'Use a non-cloud temporary directory');
  check(stat.isDirectory() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 'Output directory must be owner-only');
  return actual;
}
async function loadTokens(path) {
  const input = JSON.parse(await privateFile(path));
  check(input.config?.issuer === ISSUER, 'Only the selected Auth0 test tenant is allowed');
  const source = await readFile(join(root, 'lib/auth/auth0-token.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/from\s+(['"])jose\1/g, `from ${JSON.stringify(import.meta.resolve('jose'))}`);
  const { createAuth0TokenVerifier } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const verify = createAuth0TokenVerifier({ ...input.config, jwks: createRemoteJWKSet(new URL('.well-known/jwks.json', ISSUER)) });
  const a = await verify(input.webAToken, 'web'), b = await verify(input.webBToken, 'web'), mcp = await verify(input.mcpAToken, 'mcp');
  check(a.userId !== b.userId && a.userId === mcp.userId, 'Require two distinct website accounts and matching MCP account A');
  check(Math.min(a.expiresAt, b.expiresAt, mcp.expiresAt) > Date.now() / 1000 + 120, 'Tokens must have at least two minutes remaining');
  return { input, config: input.config, a, b, mcp };
}
function sqlFor(manifest) {
  const name = manifest.table, marker = literal(`LiveStocksAuth0Gate:${manifest.runId}`), c = manifest.config;
  // A unique schema holds only this gate's revocation state; public REST exposes only its one fixture table.
  const prepare = `begin;
create schema ${name};
comment on schema ${name} is ${marker};
revoke all on schema ${name} from public, anon, authenticated;
grant usage on schema ${name} to authenticated;
create table ${name}.connection (singleton boolean primary key default true check(singleton), enabled boolean not null, valid_after bigint not null);
insert into ${name}.connection values(true,true,0);
revoke all on ${name}.connection from public, anon, authenticated;
create function ${name}.subject(require_write boolean default false) returns text
language plpgsql stable security definer set search_path = '' as $gate$
declare claims jsonb := auth.jwt(); scopes text[];
begin
  if jsonb_typeof(claims) is distinct from 'object'
    or claims->>'iss' is distinct from ${literal(ISSUER)}
    or claims->>'role' is distinct from 'authenticated'
    or claims->'https://livestocks.app/email_verified' is distinct from 'true'::jsonb
    or jsonb_typeof(claims->'sub') is distinct from 'string'
    or length(claims->>'sub') not between 1 and 255
    or jsonb_typeof(claims->'scope') is distinct from 'string' then return null; end if;
  scopes := string_to_array(claims->>'scope',' ');
  if not scopes @> array['portfolio:read']::text[] then return null; end if;
  if claims->>'azp' = ${literal(c.websiteClientId)}
    and (claims->'aud' = to_jsonb(${literal(c.websiteAudience)}::text) or (jsonb_typeof(claims->'aud') = 'array' and claims->'aud' ? ${literal(c.websiteAudience)}))
    and claims->'https://livestocks.app/read_only' = 'false'::jsonb then
    if require_write and not scopes @> array['portfolio:write']::text[] then return null; end if;
    return claims->>'sub';
  end if;
  if not require_write and claims->>'azp' = ${literal(c.mcpClientId)}
    and (claims->'aud' = to_jsonb(${literal(c.mcpAudience)}::text) or (jsonb_typeof(claims->'aud') = 'array' and claims->'aud' ? ${literal(c.mcpAudience)}))
    and claims->'https://livestocks.app/read_only' = 'true'::jsonb
    and not scopes @> array['portfolio:write']::text[]
    and jsonb_typeof(claims->'iat') = 'number' and claims->>'iat' ~ '^[0-9]{1,16}$'
    and exists(select 1 from ${name}.connection where singleton and enabled and (claims->>'iat')::bigint > valid_after)
    then return claims->>'sub'; end if;
  return null;
end; $gate$;
revoke all on function ${name}.subject(boolean) from public,anon;
grant execute on function ${name}.subject(boolean) to authenticated;
create table public.${name} (id uuid primary key, user_id text not null default auth.jwt()->>'sub', note text not null);
comment on table public.${name} is ${marker};
alter table public.${name} enable row level security;
revoke all on public.${name} from public,anon,authenticated;
grant select,insert,update,delete on public.${name} to authenticated;
create policy owned_read on public.${name} for select to authenticated using(user_id=(select ${name}.subject(false)));
create policy owned_insert on public.${name} for insert to authenticated with check(user_id=(select ${name}.subject(true)));
create policy owned_update on public.${name} for update to authenticated using(user_id=(select ${name}.subject(true))) with check(user_id=(select ${name}.subject(true)));
create policy owned_delete on public.${name} for delete to authenticated using(user_id=(select ${name}.subject(true)));
notify pgrst,'reload schema';
commit;
`;
  const guard = `if obj_description(to_regclass('public.${name}'),'pg_class') is distinct from ${marker}
    or (select obj_description(oid,'pg_namespace') from pg_namespace where nspname=${literal(name)}) is distinct from ${marker}
    then raise exception 'Hosted gate object markers do not match'; end if;`;
  return {
    prepare,
    revoke: `begin; do $gate$ begin ${guard} update ${name}.connection set enabled=false,valid_after=ceil(extract(epoch from clock_timestamp()))::bigint where singleton; end; $gate$; commit;\n`,
    reconnect: `begin; do $gate$ begin ${guard} update ${name}.connection set enabled=true where singleton; end; $gate$; commit;\n`,
    cleanup: `begin; do $gate$ begin ${guard} drop table public.${name}; drop schema ${name} cascade; end; $gate$; notify pgrst,'reload schema'; commit;\n`,
  };
}

async function main() {
  if (args.includes('--help')) {
    console.log(`Dedicated project: ${PROJECT}. No dotenv. No SQL is executed by this script.
Prepare: node scripts/test-auth0-hosted.mjs --phase prepare --token-file /private/tokens.json --directory /private/gate
After reviewing/executing prepare.sql ONLY on ${PROJECT} and configuring its Auth0 integration:
Run: same command with --phase run --api-key-file /private/public-api-key.txt
Execute revoke.sql, then --phase revoked; execute reconnect.sql, then --phase cutoff.
Finally execute guarded cleanup.sql on the same project; --phase cleanup removes only fixture rows via owner JWTs.
API-key file accepts a public/publishable key, never service-role/secret credentials.
Reports prove hosted JWT acceptance and isolated fixture RLS only, not production migration or ChatGPT compatibility.`);
    return;
  }
  const phase = option('--phase');
  check(['prepare', 'run', 'revoked', 'cutoff', 'cleanup'].includes(phase), 'Choose an explicit phase; use --help');
  const directory = await privateDirectory(option('--directory'), phase === 'prepare');
  const tokens = await loadTokens(option('--token-file'));
  const save = (name, value) => writeFile(join(directory, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  if (phase === 'prepare') {
    // Exclusive creation prevents replacing a prior run's cleanup handles.
    const manifest = { projectRef: PROJECT, runId: randomUUID(), table: PREFIX + randomBytes(8).toString('hex'),
      config: tokens.config, ownerA: tokens.a.userId, ownerB: tokens.b.userId, rowA: randomUUID(), rowB: randomUUID() };
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    const sql = sqlFor(manifest);
    for (const [name, contents] of Object.entries(sql)) await save(`${name}.sql`, contents);
    console.log(JSON.stringify({ phase, status: 'PREPARED_NO_HOSTED_MUTATIONS', projectRef: PROJECT, directory, table: manifest.table }));
    return;
  }
  const manifest = JSON.parse(await privateFile(join(directory, 'manifest.json')));
  check(manifest.projectRef === PROJECT && new RegExp(`^${PREFIX}[a-f0-9]{16}$`).test(manifest.table), 'Manifest must target the fixed test project and isolated namespace');
  check(manifest.ownerA === tokens.a.userId && manifest.ownerB === tokens.b.userId && JSON.stringify(manifest.config) === JSON.stringify(tokens.config), 'Current token identities/configuration must match the prepared run');
  const keyText = (await privateFile(option('--api-key-file'))).trim();
  const apiKey = keyText.startsWith('{') ? JSON.parse(keyText).apiKey : keyText;
  let publicKey = typeof apiKey === 'string' && apiKey.startsWith('sb_publishable_');
  if (!publicKey && typeof apiKey === 'string') {
    try { publicKey = JSON.parse(Buffer.from(apiKey.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { /* Reject non-public keys. */ }
  }
  check(publicKey, 'Use a publishable or legacy anon key; service-role and secret keys are forbidden');
  const report = { projectRef: PROJECT, generatedAt: new Date().toISOString(), phase, status: 'INCOMPLETE',
    scope: 'HOSTED_GATEWAY_AND_ISOLATED_FIXTURE_RLS', cases: [],
    limitations: ['No existing portfolio tables or production data are migrated or tested.', 'Does not prove ChatGPT host authorization, physical iPhone behavior, or production restore safety.',
      'Does not change the recorded Auth0 exchange_wrong_resource provider failure or its narrowly scoped acceptance.'] };
  let currentCase = 'initialization';
  let lastResponse;
  const record = async (name, operation) => {
    currentCase = name; const evidence = await operation();
    report.cases.push({ name, status: 'PASS', ...evidence }); await save(`report-${phase}.json`, report);
  };
  const request = async (token, method = 'GET', query = '', body) => {
    const headers = { apikey: apiKey, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${ORIGIN}/rest/v1/${manifest.table}${query}`, {
      method, headers, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    let data; try { data = await response.json(); } catch { data = null; }
    lastResponse = { httpStatus: response.status,
      ...(typeof data?.code === 'string' && /^[A-Z0-9_]{1,24}$/.test(data.code) ? { code: data.code } : {}) };
    return { status: response.status, ok: response.ok, data };
  };
  const assertRows = (result, ids) => check(result.ok && Array.isArray(result.data) && result.data.length === ids.length
    && result.data.every(row => ids.includes(row.id)), 'Unexpected row visibility');
  const deniedWrite = result => check([401, 403].includes(result.status) || result.ok && Array.isArray(result.data) && result.data.length === 0, 'Unauthorized write was accepted');
  const a = tokens.input.webAToken, b = tokens.input.webBToken, mcp = tokens.input.mcpAToken;
  const qA = `?id=eq.${manifest.rowA}`, qB = `?id=eq.${manifest.rowB}`;
  try {
    if (phase === 'run') {
      await record('website_a_insert', async () => { const r = await request(a, 'POST', '', { id: manifest.rowA, user_id: manifest.ownerA, note: 'synthetic A' }); assertRows(r, [manifest.rowA]); return { httpStatus: r.status }; });
      await record('website_b_insert', async () => { const r = await request(b, 'POST', '', { id: manifest.rowB, user_id: manifest.ownerB, note: 'synthetic B' }); assertRows(r, [manifest.rowB]); return { httpStatus: r.status }; });
      await record('website_a_reads_only_a', async () => { assertRows(await request(a), [manifest.rowA]); });
      await record('website_b_reads_only_b', async () => { assertRows(await request(b), [manifest.rowB]); });
      await record('mcp_reads_only_its_owner', async () => { assertRows(await request(mcp), [manifest.rowA]); });
      await record('website_cross_owner_insert_denied', async () => { deniedWrite(await request(a, 'POST', '', { id: randomUUID(), user_id: manifest.ownerB, note: 'must not persist' })); });
      await record('website_cross_owner_update_denied', async () => { deniedWrite(await request(a, 'PATCH', qB, { note: 'must not persist' })); });
      await record('website_cross_owner_delete_denied', async () => { deniedWrite(await request(a, 'DELETE', qB)); });
      await record('website_owner_reassignment_denied', async () => { deniedWrite(await request(a, 'PATCH', qA, { user_id: manifest.ownerB })); });
      await record('mcp_insert_denied', async () => { deniedWrite(await request(mcp, 'POST', '', { id: randomUUID(), user_id: manifest.ownerA, note: 'must not persist' })); });
      await record('mcp_update_denied', async () => { deniedWrite(await request(mcp, 'PATCH', qA, { note: 'must not persist' })); });
      await record('mcp_delete_denied', async () => { deniedWrite(await request(mcp, 'DELETE', qA)); });
      await record('anonymous_denied', async () => { const r = await request(null); check([401,403].includes(r.status) || r.ok && Array.isArray(r.data) && !r.data.length, 'Anonymous data exposure'); return { httpStatus: r.status }; });
      await record('tampered_jwt_denied', async () => { const parts = a.split('.'); parts[2] = parts[2].slice(0,10) + (parts[2][10] === 'A' ? 'B' : 'A') + parts[2].slice(11); const r = await request(parts.join('.')); check([401,403].includes(r.status), 'Tampered JWT accepted'); return { httpStatus: r.status }; });
      await record('website_a_can_update_own_row', async () => { const r = await request(a, 'PATCH', qA, { note: 'synthetic A updated' }); assertRows(r, [manifest.rowA]); check(r.data[0].note === 'synthetic A updated', 'Own write did not persist'); });
      await record('denied_writes_preserved_b', async () => { const r = await request(b); assertRows(r, [manifest.rowB]); check(r.data[0].note === 'synthetic B' && r.data[0].user_id === manifest.ownerB, 'Cross-owner row changed'); });
    } else if (phase === 'revoked' || phase === 'cutoff') {
      await record(phase === 'revoked' ? 'disabled_mcp_direct_rest_denied' : 'old_mcp_jwt_denied_after_reenable', async () => { const r = await request(mcp); check([401,403].includes(r.status) || r.ok && Array.isArray(r.data) && !r.data.length, 'Revoked MCP JWT retained access'); });
      await record('website_a_unaffected', async () => { assertRows(await request(a), [manifest.rowA]); });
      await record('website_b_unaffected', async () => { assertRows(await request(b), [manifest.rowB]); });
    } else {
      await record('remove_only_a_fixture', async () => { const r = await request(a, 'DELETE', qA); check(r.ok, 'Owner A cleanup failed'); });
      await record('remove_only_b_fixture', async () => { const r = await request(b, 'DELETE', qB); check(r.ok, 'Owner B cleanup failed'); });
      await record('owner_a_empty', async () => { assertRows(await request(a), []); });
      await record('owner_b_empty', async () => { assertRows(await request(b), []); });
    }
    report.status = 'PASS'; await save(`report-${phase}.json`, report);
    console.log(JSON.stringify({ phase, status: 'PASS', cases: report.cases.length, projectRef: PROJECT, report: join(directory, `report-${phase}.json`) }));
  } catch {
    report.status = 'FAIL'; report.failureCase = currentCase; report.lastResponse = lastResponse; await save(`report-${phase}.json`, report);
    console.error(JSON.stringify({ phase, status: 'FAIL', failureCase: currentCase, projectRef: PROJECT, report: join(directory, `report-${phase}.json`), cleanup: join(directory, 'cleanup.sql') }));
    process.exitCode = 1;
  }
}
main().catch(() => { console.error('Hosted gate stopped before testing. Check private input permissions, explicit arguments, token validity, and trusted configuration. No raw provider details logged.'); process.exitCode = 1; });
