#!/usr/bin/env node
/**
 * PREPARATION ONLY. No migration, schema modification, or data modification.
 * No .env loading. Requires psql, pg_dump and pg_restore >= the server major.
 * Auth0/config/owner verification is mandatory before any database connection.
 * The encrypted archive is checked for readability, NOT restored/tested here.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, X509Certificate } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, lstat, mkdtemp, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AUTH_TABLES, verifyOwnerConfirmation, adoptionGuardSql, confirmationRowsSql } from './owner-store-adoption.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tables = ['positions', 'position_lots', 'position_plans', 'settings', 'watchlist_groups', 'watchlist_tickers'];
const claimReadOnly = 'https://livestocks.app/read_only';
const claimVerified = 'https://livestocks.app/email_verified';
const children = new Set();
let cancelled = false;
class PreparationError extends Error {}
function fail(message) { throw new PreparationError(message); }
function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || !value || value.trim() !== value) fail(`Missing or invalid ${name}`);
  return value;
}
function within(path, parent) { const rel = relative(parent, path); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); }

export async function safeBackupDirectory(value) {
  if (!isAbsolute(value)) fail('MIGRATION_BACKUP_DIRECTORY must be an existing absolute directory');
  const directory = await realpath(value);
  const root = await realpath(repository);
  if (!(await lstat(directory)).isDirectory() || within(directory, root)) fail('Backup directory must be outside the repository');
  if (/\/(?:Mobile Documents|CloudStorage|iCloud Drive|Dropbox|OneDrive|Google Drive)(?:\/|$)/i.test(directory)
    || within(directory, join(homedir(), 'Desktop')) || within(directory, join(homedir(), 'Documents'))) {
    fail('Choose a private local backup directory outside cloud-sync and Desktop/Documents folders');
  }
  for (let current = directory; ; current = dirname(current)) {
    try { await lstat(join(current, '.git')); fail('Backup directory must not be inside any Git checkout'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(current) === current) break;
  }
  return directory;
}

export async function trustedDatabaseCertificate(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) fail('MIGRATION_SSL_ROOT_CERT must be an absolute trusted CA file path');
  try {
    const info = await lstat(value);
    if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > 1024 * 1024
      || (info.mode & 0o022) !== 0 || ![0, process.getuid()].includes(info.uid)) throw new Error();
    const path = await realpath(value);
    const pem = await readFile(path, 'utf8');
    const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    if (!certificates?.length || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g, '').trim()) throw new Error();
    for (const entry of certificates) {
      const certificate = new X509Certificate(entry);
      if (!certificate.ca || Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now()) throw new Error();
    }
    return path;
  } catch { fail('Trusted database CA must be a current PEM CA file, owned by you or root, not a symlink or writable by others'); }
}

export async function databaseEnvironment(value, certificatePath) {
  let url;
  try { url = new URL(value); } catch { fail('Invalid MIGRATION_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1) || url.hash) {
    fail('MIGRATION_DATABASE_URL must explicitly identify its PostgreSQL host, user and database');
  }
  const allowed = new Set(['sslmode']);
  if ([...url.searchParams.keys()].some(key => !allowed.has(key)) || url.searchParams.getAll('sslmode').length > 1) {
    fail('Database URL contains unsupported connection overrides');
  }
  const sslmode = url.searchParams.get('sslmode') ?? 'verify-full';
  if (sslmode !== 'verify-full') fail('PostgreSQL TLS must use verify-full; weaker validation is prohibited');
  const certificate = await trustedDatabaseCertificate(certificatePath);
  return {
    PATH: process.env.PATH, LC_ALL: 'C', PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null', PGCONNECT_TIMEOUT: '10',
    PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: sslmode, PGSSLROOTCERT: certificate, PGTZ: 'UTC', PGAPPNAME: 'livestocks-read-only-migration-preparation',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=1800000',
  };
}

function authConfiguration() {
  const domain = required('AUTH0_DOMAIN');
  const issuer = new URL(domain.startsWith('https://') ? domain : `https://${domain}`);
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash || issuer.pathname !== '/') fail('Invalid trusted Auth0 issuer');
  const websiteClientId = required('AUTH0_CLIENT_ID');
  const mcpClientId = required('AUTH0_MCP_CLIENT_ID');
  const websiteAudience = required('AUTH0_WEB_AUDIENCE');
  const mcpAudience = required('AUTH0_MCP_AUDIENCE');
  const origin = new URL(required('APP_BASE_URL'));
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') fail('APP_BASE_URL must be the canonical HTTPS origin');
  if (websiteClientId === mcpClientId || websiteAudience !== `${origin.origin}/api/web` || mcpAudience !== `${origin.origin}/api/mcp`) fail('Website and MCP clients/audiences must match the distinct canonical resources');
  return { issuer: issuer.href, websiteClientId, mcpClientId, websiteAudience, mcpAudience };
}

/** Same strict web-token contract as lib/auth/auth0-token.ts; no email matching. */
export async function verifyOwnerToken(token, expectedSubject, config, jwks) {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['RS256', 'ES256'], issuer: config.issuer, audience: config.websiteAudience, clockTolerance: 0,
      requiredClaims: ['iss', 'aud', 'sub', 'azp', 'scope', 'role', 'iat', 'exp', claimReadOnly, claimVerified],
    });
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const scopes = typeof payload.scope === 'string' ? new Set(payload.scope.split(/\s+/).filter(Boolean)) : new Set();
    if (audiences.some(value => typeof value !== 'string' || !value || value.trim() !== value)
      || typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 255 || payload.sub.trim() !== payload.sub
      || payload.sub !== expectedSubject || payload.azp !== config.websiteClientId
      || (payload.client_id !== undefined && payload.client_id !== config.websiteClientId)
      || payload.role !== 'authenticated' || payload[claimReadOnly] !== false || payload[claimVerified] !== true
      || !scopes.has('portfolio:read') || !scopes.has('portfolio:write')
      || !Number.isSafeInteger(payload.iat) || payload.iat < 0 || payload.iat > Math.floor(Date.now() / 1000) + 5
      || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat) fail('Owner verification failed');
    return { subject: payload.sub, issuedAt: payload.iat, expiresAt: payload.exp };
  } catch { fail('Owner token does not satisfy the verified Auth0 website identity contract'); }
}

export function encryptLegacyCredential(subject, value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`livestocks:finnhub:v1:${subject}`));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function start(binary, args, env) {
  if (cancelled) fail('Preparation was interrupted');
  const child = spawn(binary, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(child);
  child.once('close', () => children.delete(child));
  // Consume stderr without printing it: provider/DB diagnostics can contain secrets.
  child.stderr.resume();
  child.stdin.on('error', () => {});
  child.done = new Promise((resolveDone, reject) => {
    child.once('error', () => reject(new PreparationError(`${binary} could not start`)));
    child.once('close', code => code === 0 ? resolveDone() : reject(new PreparationError(`${binary} failed; raw output suppressed`)));
  });
  // Consumers await this promise later, after stream setup; prevent early rejection noise.
  child.done.catch(() => {});
  return child;
}

async function utilityVersion(binary) {
  const child = start(binary, ['--version'], { PATH: process.env.PATH, LC_ALL: 'C' });
  child.stdin.end();
  let output = '';
  for await (const chunk of child.stdout) output += chunk;
  await child.done;
  const match = /PostgreSQL\) (\d+)(?:\.\d+)*/.exec(output);
  if (!match) fail(`Unable to determine ${binary} version`);
  return { major: Number(match[1]), description: output.trim() };
}

class SnapshotSession {
  constructor(env) {
    this.child = start('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], env);
    this.buffer = ''; this.pending = null;
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk;
      let newline;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, newline).replace(/\r$/, ''); this.buffer = this.buffer.slice(newline + 1);
        if (!this.pending) continue;
        if (line === this.pending.marker) { const pending = this.pending; this.pending = null; pending.resolve(pending.lines.join('\n')); }
        else if (line) this.pending.lines.push(line);
      }
    });
    this.child.done.catch(error => { this.pending?.reject(error); this.pending = null; });
  }
  query(sql) {
    if (this.pending || this.child.exitCode !== null) fail('Read-only database session is not available');
    return new Promise((resolveQuery, reject) => {
      const marker = `completed_${randomBytes(16).toString('hex')}`;
      this.pending = { marker, lines: [], resolve: resolveQuery, reject };
      this.child.stdin.write(`${sql};\n\\echo ${marker}\n`, error => { if (error) { this.pending = null; reject(new PreparationError('Database session write failed')); } });
    });
  }
  async close() {
    if (this.child.exitCode === null) {
      this.child.stdin.end('rollback;\n\\quit\n');
      await this.child.done;
    }
  }
}

function sqlLiteral(value) { return `'${value.replaceAll("'", "''")}'`; }
export function parametersFile(values) {
  let delimiter;
  do { delimiter = `$migration_parameters_${randomBytes(16).toString('hex')}$`; }
  while (Object.values(values).some(value => value.includes(delimiter)));
  return '-- PREPARATION ONLY: these settings do not apply a migration. Review separately.\n'
    + '-- Run on the SAME connection immediately before the reviewed migration file.\n'
    + `set standard_conforming_strings = on;\ndo ${delimiter}\nbegin\n`
    + Object.entries(values).map(([name, value]) => `  perform pg_catalog.set_config(${sqlLiteral(name)}, ${sqlLiteral(value)}, false);`).join('\n')
    + `\nend;\n${delimiter};\n`;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Read-only preparation: node scripts/prepare-account-migration.mjs --owner-sub EXACT_AUTH0_SUB\n'
      + 'Required explicit env: MIGRATION_DATABASE_URL, MIGRATION_SSL_ROOT_CERT, MIGRATION_BACKUP_DIRECTORY, LEGACY_OWNER_ACCESS_TOKEN,\n'
      + 'CREDENTIAL_ENCRYPTION_KEY (64 hex), AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_MCP_CLIENT_ID,\n'
      + 'AUTH0_WEB_AUDIENCE, AUTH0_MCP_AUDIENCE, APP_BASE_URL. No .env loading.\n'
      + 'Choose a private, nonsynced existing backup directory outside Git and Desktop/Documents.\n'
      + 'Outputs encrypted archive, manifest and protected SQL session parameters only. Never applies a migration.\n'
      + 'Keep the encryption key independently recoverable; restore testing remains required.\n'
      + 'Final-store mode: set FINAL_OWNER_CONFIRMATION_FILE, LEGACY_OWNER_CONFIRMATION_FILE, LEGACY_MIGRATION_PARAMETERS_FILE and BETTER_AUTH_SECRET. It verifies the fresh final-store receipt/live rows and includes livestocks_auth; no legacy Auth0 access token or network verification is then used.');
    return;
  }
  if (process.argv.length !== 4 || process.argv[2] !== '--owner-sub' || !process.argv[3]) fail('An explicit --owner-sub EXACT_AUTH0_SUB is required');
  const finalStoreMode=Boolean(process.env.FINAL_OWNER_CONFIRMATION_FILE);
  let config,owner,ownerConfirmation,checkedEnvironment;
  if(finalStoreMode){
    const privateJson=async name=>{const path=required(name);if(!isAbsolute(path))fail('Protected proof path must be absolute');const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077))fail('Proof files must be private and owned');return JSON.parse(await readFile(path,'utf8'));};
    const legacy=await privateJson('LEGACY_OWNER_CONFIRMATION_FILE'),artifact=await privateJson('FINAL_OWNER_CONFIRMATION_FILE');
    if(legacy.userId!==process.argv[3])fail('Explicit canonical owner differs from original confirmation');
    ownerConfirmation=await verifyOwnerConfirmation(artifact,legacy,required('BETTER_AUTH_SECRET'));
    const {parseLegacyParameters,checkedProductionEnvironment}=await import('./cutover-personal-accounts.mjs');
    const parameterPath=required('LEGACY_MIGRATION_PARAMETERS_FILE');if(!isAbsolute(parameterPath))fail('Absolute legacy parameter path required');const info=await lstat(parameterPath);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077))fail('Legacy parameter file must be private');
    const values=parseLegacyParameters(await readFile(parameterPath,'utf8'));if(values['app.legacy_owner_subject']!==legacy.userId)fail('Legacy parameter owner differs');
    config={issuer:values['app.auth0_issuer'],websiteClientId:values['app.auth0_website_client_id'],mcpClientId:values['app.auth0_mcp_client_id'],websiteAudience:values['app.auth0_website_audience'],mcpAudience:values['app.auth0_mcp_audience']};
    owner={subject:legacy.userId};checkedEnvironment=await checkedProductionEnvironment(required('MIGRATION_DATABASE_URL'),required('MIGRATION_SSL_ROOT_CERT'));
  }else config=authConfiguration();
  const keyHex = required('CREDENTIAL_ENCRYPTION_KEY');
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) fail('CREDENTIAL_ENCRYPTION_KEY must be 64 hexadecimal characters');
  const key = Buffer.from(keyHex, 'hex');
  if(!finalStoreMode)owner = await verifyOwnerToken(required('LEGACY_OWNER_ACCESS_TOKEN'), process.argv[3], config,
    createRemoteJWKSet(new URL('.well-known/jwks.json', config.issuer), { timeoutDuration: 10_000 }));
  const backupRoot = await safeBackupDirectory(required('MIGRATION_BACKUP_DIRECTORY'));
  const dbEnv = checkedEnvironment ?? await databaseEnvironment(required('MIGRATION_DATABASE_URL'), required('MIGRATION_SSL_ROOT_CERT'));
  const [dumpVersion, restoreVersion] = await Promise.all([utilityVersion('pg_dump'), utilityVersion('pg_restore')]);
  let session; let outputDirectory;
  const manifest = { status: 'INCOMPLETE', generatedAt: new Date().toISOString(), schemas: ['public','private','supabase_migrations',...(finalStoreMode?['livestocks_auth']:[])], digestTimeZone: 'UTC', restoreTested: false,
    warning: 'Preparation is not approval to migrate. Restore-test the encrypted archive, freeze writes and recheck row hashes before cutover.' };
  try {
    session = new SnapshotSession(dbEnv);
    const serverVersion = Number(await session.query('show server_version_num'));
    if (!Number.isInteger(serverVersion) || dumpVersion.major < Math.floor(serverVersion / 10000)
      || restoreVersion.major < dumpVersion.major) fail('pg_dump must be at least the server major; pg_restore must be at least pg_dump major');
    await session.query('begin isolation level repeatable read read only');
    if(finalStoreMode){
      await session.query("set local search_path=''");
      const authSource=await readFile(new URL('../supabase/migrations/20261114151506_better_auth_private_sessions.sql',import.meta.url),'utf8');
      await session.query(adoptionGuardSql(authSource,{readOnly:true}));await session.query(confirmationRowsSql(ownerConfirmation));
      manifest.ownerConfirmation=ownerConfirmation;manifest.authStoreDigestOrder='id COLLATE C';manifest.authStoreTables={};
      for(const table of AUTH_TABLES)manifest.authStoreTables[table]=JSON.parse(await session.query(`select jsonb_build_object('rowCount',count(*),'originalDigest',md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id collate "C"),''))) from livestocks_auth."${table}" r`));
    }
    const snapshot = await session.query('select pg_export_snapshot()');
    if (!/^[0-9a-f]+-[0-9a-f]+-\d+$/i.test(snapshot)) fail('Unexpected exported snapshot identifier');
    outputDirectory = await mkdtemp(join(backupRoot, 'livestocks-account-migration-'));
    await chmod(outputDirectory, 0o700);
    manifest.serverVersion = serverVersion;
    manifest.pgDump = dumpVersion.description;
    manifest.database = { host: dbEnv.PGHOST, port: dbEnv.PGPORT, database: dbEnv.PGDATABASE };
    manifest.ownerSubject = owner.subject;
    manifest.ownerVerifiedAt = new Date().toISOString();
    manifest.tables = {};
    for (const table of tables) {
      const excluded = table === 'settings' ? 'finnhub_token' : '__no_legacy_column__';
      const stats = JSON.parse(await session.query(`select jsonb_build_object('rowCount',count(*),
        'originalDigest',md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),'')),
        'migrationDigest',md5(coalesce(string_agg(md5((to_jsonb(r)-'${excluded}')::text),'' order by id),'')))
        from public.${table} r`));
      manifest.tables[table] = stats;
    }
    if (manifest.tables.settings.rowCount > 1) fail('Unexpected legacy settings cardinality requires manual review');
    const settings = JSON.parse(await session.query("select coalesce(jsonb_agg(jsonb_build_object('token',finnhub_token)),'[]'::jsonb) from public.settings"));
    const plaintext = typeof settings[0]?.token === 'string' ? settings[0].token : '';
    const encryptedCredential = plaintext.trim() ? encryptLegacyCredential(owner.subject, plaintext, key) : '';
    manifest.legacyCredential = { present: Boolean(encryptedCredential), plaintextSha256: encryptedCredential ? createHash('sha256').update(plaintext).digest('hex') : null };

    const iv = randomBytes(12);
    const aad = `livestocks:account-migration-backup:v1:${randomBytes(16).toString('hex')}`;
    const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(aad));
    const digest = createHash('sha256');
    const hasher = new Transform({ transform(chunk, _encoding, callback) { digest.update(chunk); callback(null, chunk); } });
    const archive = join(outputDirectory, 'public.pgdump.enc');
    const dump = start('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', ...manifest.schemas.map(schema=>`--schema=${schema}`), `--snapshot=${snapshot}`], dbEnv);
    dump.stdin.end();
    await Promise.all([pipeline(dump.stdout, cipher, hasher, createWriteStream(`${archive}.partial`, { flags: 'wx', mode: 0o600 })), dump.done]);
    await rename(`${archive}.partial`, archive);
    manifest.archive = { file: 'public.pgdump.enc', format: 'PostgreSQL custom archive', encryption: 'aes-256-gcm',
      iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), aad,
      ciphertextSha256: digest.digest('hex'), keyFingerprint: createHash('sha256').update(key).digest('hex').slice(0,16) };
    // Authenticate/decrypt only into pg_restore's stdin and parse the full
    // archive into discarded SQL. No --dbname and no DB environment: no restore.
    // --list alone can exit before consuming a large archive and cause EPIPE.
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(cipher.getAuthTag());
    const listing = start('pg_restore', ['--file=/dev/null', '--no-owner', '--no-privileges'], { PATH: process.env.PATH, LC_ALL: 'C' });
    listing.stdout.resume();
    await Promise.all([pipeline(createReadStream(archive), decipher, listing.stdin), listing.done]);
    manifest.archiveSqlGenerationVerified = true;
    manifest.archiveAuthenticated = true;
    await session.close(); session = null;
    if (cancelled) fail('Preparation was interrupted');
    await writeFile(join(outputDirectory, 'migration-parameters.sql'), parametersFile({
      'app.auth0_issuer': config.issuer, 'app.auth0_website_client_id': config.websiteClientId,
      'app.auth0_mcp_client_id': config.mcpClientId, 'app.auth0_website_audience': config.websiteAudience,
      'app.auth0_mcp_audience': config.mcpAudience, 'app.legacy_owner_subject': owner.subject,
      'app.legacy_finnhub_encrypted': encryptedCredential,
    }), { mode: 0o600, flag: 'wx' });
    if (cancelled) fail('Preparation was interrupted');
    manifest.status = 'PREPARED_RESTORE_TEST_REQUIRED';
    await writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest,null,2)}\n`, { mode: 0o600, flag: 'wx' });
    console.log(`Encrypted preparation files created: ${outputDirectory}\nNo schema or data was changed. Restore testing and final cutover review remain required.`);
  } catch (error) {
    if (outputDirectory) {
      await writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest,null,2)}\n`, { mode: 0o600 }).catch(() => {});
    }
    throw error;
  } finally {
    if (session) await session.close().catch(() => {});
    for (const child of children) child.kill('SIGTERM');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // No shell/eval, raw token logging, SQL application, or automatic production action.
  for (const name of ['SIGINT','SIGTERM']) process.once(name, () => {
    cancelled = true;
    for (const child of children) child.kill('SIGTERM');
    process.exitCode = 2;
  });
  main().catch(error => {
    console.error(error instanceof PreparationError ? error.message : 'Preparation failed; sensitive error details suppressed');
    process.exitCode = 1;
  });
}
