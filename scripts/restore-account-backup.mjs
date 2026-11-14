#!/usr/bin/env node
/** Restore proof only: creates and destroys its own authenticated loopback cluster.
 * Never accepts a database URL, reads .env, or connects to an existing database.
 * Real restored data exists only in the mode-0700 disposable cluster directory.
 */
import { createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { safeBackupDirectory } from './prepare-account-migration.mjs';
import { freezeSql, migrationSql, frozenAssertions } from './cutover-personal-accounts.mjs';

const tables = ['positions', 'position_lots', 'position_plans', 'settings', 'watchlist_groups', 'watchlist_tickers'];
const cleanEnv = { PATH: process.env.PATH, LC_ALL: 'C', PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null' };
const children = new Set();
let interrupted = false;
function fail(message) { throw new Error(message); }
function start(binary, args, env = cleanEnv) {
  if (interrupted) fail('Restore verification interrupted');
  const child = spawn(binary, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  children.add(child);
  child.stderr.resume(); // SQL errors can include portfolio values; never print them.
  child.stdin.on('error', () => {});
  child.done = new Promise((done, reject) => {
    child.once('error', () => reject(new Error('Local restore utility could not start')));
    child.once('close', code => { children.delete(child); code === 0 ? done() : reject(new Error('Local restore utility failed; sensitive output suppressed')); });
  });
  child.done.catch(() => {});
  return child;
}
async function run(binary, args, env = cleanEnv, input = '', expectedErrorMarker = null) {
  const child = start(binary, args, env);
  let errorTail = '';
  let expectedErrorSeen = false;
  child.stderr.on('data', data => {
    errorTail = `${errorTail}${data}`.slice(-8192);
    expectedErrorSeen ||= Boolean(expectedErrorMarker && errorTail.includes(expectedErrorMarker));
  });
  child.stdin.end(input);
  let output = '';
  for await (const data of child.stdout) output += data;
  try { await child.done; } catch (error) { error.rollbackProbe = expectedErrorSeen; error.privateDiagnostic = errorTail; throw error; }
  return output.trim();
}
async function protectedFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) fail('Backup files must be owned by you, mode 0600, and not symlinks');
  return path;
}
async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}
function decrypt(archive, key) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(archive.iv, 'base64url'));
  decipher.setAAD(Buffer.from(archive.aad));
  decipher.setAuthTag(Buffer.from(archive.tag, 'base64url'));
  return decipher;
}

async function main() {
  const cutover = process.argv.length === 5 && process.argv[4] === '--rehearse-cutover';
  const rehearse = cutover || (process.argv.length === 5 && process.argv[4] === '--rehearse-migration');
  if ((!rehearse && process.argv.length !== 4) || process.argv[2] !== '--backup-directory') fail('Usage: RESTORE_POSTGRES_BIN=/absolute/postgresql17/bin CREDENTIAL_ENCRYPTION_KEY=protected-env node scripts/restore-account-backup.mjs --backup-directory /absolute/private/backup [--rehearse-migration]');
  const directory = await safeBackupDirectory(process.argv[3]);
  const dirInfo = await lstat(directory);
  if (dirInfo.uid !== process.getuid() || (dirInfo.mode & 0o077)) fail('Backup directory must be owned by you and mode 0700');
  const manifestPath = await protectedFile(join(directory, 'manifest.json'));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.status !== 'PREPARED_RESTORE_TEST_REQUIRED' || manifest.archive?.file !== 'public.pgdump.enc'
    || manifest.archive?.encryption !== 'aes-256-gcm' || manifest.archiveAuthenticated !== true) fail('Unsupported or incomplete backup manifest');
  const archivePath = await protectedFile(join(directory, manifest.archive.file));
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!/^[0-9a-f]{64}$/i.test(keyHex ?? '')) fail('Explicit CREDENTIAL_ENCRYPTION_KEY is required');
  const key = Buffer.from(keyHex, 'hex');
  if (createHash('sha256').update(key).digest('hex').slice(0, 16) !== manifest.archive.keyFingerprint) fail('Backup encryption key does not match');
  const binaryPath = process.env.RESTORE_POSTGRES_BIN;
  if (!binaryPath || !isAbsolute(binaryPath)) fail('RESTORE_POSTGRES_BIN must explicitly identify the local PostgreSQL binary directory');
  const binaries = await realpath(binaryPath);
  const pgVersion = await run(join(binaries, 'postgres'), ['--version']);
  const major = Number(/PostgreSQL\) (\d+)/.exec(pgVersion)?.[1]);
  const dumpMajor = Number(/PostgreSQL\) (\d+)/.exec(manifest.pgDump)?.[1]);
  const restoreVersion = await run('pg_restore', ['--version']);
  const restoreMajor = Number(/PostgreSQL\) (\d+)/.exec(restoreVersion)?.[1]);
  if (!major || major < Math.floor(manifest.serverVersion / 10000) || !dumpMajor || restoreMajor < dumpMajor) fail('Local PostgreSQL must support source major; pg_restore must support dump major');

  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archivePath)) hash.update(chunk);
  if (hash.digest('hex') !== manifest.archive.ciphertextSha256) fail('Encrypted archive checksum mismatch');
  // Authenticate the entire ciphertext before its SQL can reach a local server.
  await pipeline(createReadStream(archivePath), decrypt(manifest.archive, key), new Writable({ write(_chunk, _encoding, done) { done(); } }));

  const runtime = await mkdtemp(join(await realpath(tmpdir()), 'livestocks-restore-'));
  await chmod(runtime, 0o700);
  const data = join(runtime, 'data');
  const passwordFile = join(runtime, 'postgres-password');
  const password = randomBytes(32).toString('hex');
  const port = await freePort();
  const env = { ...cleanEnv, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres', PGPASSWORD: password,
    PGDATABASE: 'postgres', PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable', PGTZ: 'UTC', PGAPPNAME: 'livestocks-isolated-restore-proof' };
  let started = false;
  let cleanup = false;
  const report = { status: 'INCOMPLETE', kind: 'DISPOSABLE_LOCAL_RESTORE', startedAt: new Date().toISOString(),
    sourceServerVersion: manifest.serverVersion, localPostgres: pgVersion, pgRestore: restoreVersion,
    ciphertextSha256: manifest.archive.ciphertextSha256, archiveAuthenticated: true, productionWrites: false,
    restoredTables: {}, digestTimeZone: 'UTC', restoreTested: false, cleanup: 'PENDING', phase: 'initialize' };
  const query = (sql, expectedErrorMarker) => run('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], env, sql, expectedErrorMarker);
  try {
    await writeFile(passwordFile, password, { mode: 0o600, flag: 'wx' });
    await run(join(binaries, 'initdb'), ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=scram-sha-256', `--pwfile=${passwordFile}`, '--no-locale', '-E', 'UTF8']);
    await run(join(binaries, 'pg_ctl'), ['-D', data, '-l', join(runtime, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories='' -c log_statement=none`, '-w', 'start']);
    started = true;
    const actualData = await query('show data_directory;');
    if (resolve(actualData) !== resolve(data)) fail('Local database identity mismatch');
    await query('create role anon; create role authenticated; create role service_role;');
    report.phase = 'restore_archive';
    const restore = start('pg_restore', ['--dbname=postgres', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error'], env);
    restore.stdout.resume();
    await Promise.all([pipeline(createReadStream(archivePath), decrypt(manifest.archive, key), restore.stdin), restore.done]);
    report.phase = 'compare_rows';
    for (const table of tables) {
      const stats = JSON.parse(await query(`select jsonb_build_object('rowCount',count(*),'originalDigest',md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),''))) from public.${table} r;`));
      report.restoredTables[table] = stats;
      if (stats.rowCount !== manifest.tables[table]?.rowCount || stats.originalDigest !== manifest.tables[table]?.originalDigest) fail(`Restored ${table} does not match backup manifest`);
    }
    const credential = JSON.parse(await query("select coalesce(jsonb_agg(jsonb_build_object('token',finnhub_token)),'[]'::jsonb) from public.settings;"));
    const plaintext = typeof credential[0]?.token === 'string' ? credential[0].token : '';
    const present = Boolean(plaintext.trim());
    if (present !== manifest.legacyCredential?.present
      || (present && createHash('sha256').update(plaintext).digest('hex') !== manifest.legacyCredential.plaintextSha256)) fail('Restored legacy credential does not match protected manifest');
    report.legacyCredentialVerified = true;
    report.restoreTested = true;
    if (rehearse) {
      report.phase = 'migration_rollback_rehearsal';
      const name = '20261114114916_auth0_user_isolation.sql';
      const migration = await readFile(fileURLToPath(new URL(`../supabase/migrations/${name}`, import.meta.url)), 'utf8');
      const parameters = await readFile(await protectedFile(join(directory, 'migration-parameters.sql')), 'utf8');
      if ((migration.match(/^\s*commit\s*;/gmi) ?? []).length !== 1 || !/\bcommit;\s*$/i.test(migration)) fail('Reviewed migration transaction structure has changed');
      await query("create schema auth; create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$; grant usage on schema auth,public to anon,authenticated,service_role;");
      report.migration = { file: name, sha256: createHash('sha256').update(migration).digest('hex'), rollbackVerified: false,
        financialDataPreserved: false, ownerVerified: false, encryptedCredentialVerified: false };
      let reviewedSql = migration;
      if (cutover) {
        report.phase = 'cutover_freeze_rehearsal';
        await query(`create role authenticator login password '${password}';grant all privileges on table ${tables.map(table => `public.${table}`).join(',')} to anon,authenticated,service_role;grant execute on all functions in schema public to anon,authenticated,service_role;`);
        const drainProbe = start('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { ...env, PGUSER: 'authenticator', PGAPPNAME: 'livestocks-cutover-drain-probe' });
        drainProbe.stdout.resume(); drainProbe.stdin.end('select pg_sleep(60);');
        let probeReady = false;
        for (let attempt = 0; attempt < 30; attempt++) {
          if (await query("select count(*)=1 from pg_stat_activity where application_name='livestocks-cutover-drain-probe' and usename='authenticator';") === 't') { probeReady = true; break; }
          await new Promise(done => setTimeout(done, 100));
        }
        if (!probeReady) fail('Local drain probe did not become ready');
        env.PGOPTIONS = '-c default_transaction_read_only=on';
        await query(freezeSql(manifest));
        let drained = false; try { await drainProbe.done; } catch { drained = true; }
        if (!drained) fail('Freeze did not terminate the prior API backend');
        await query(frozenAssertions());
        const finalBaseline = { ...manifest, generatedAt: new Date().toISOString() };
        report.cutover = { freezeCommitted: true, priorApiBackendDrained: true, staleBaselineDenied: false, snapshotDriftDenied: false,
          rollbackKeptFreeze: false, historyRecordedAtomically: false, serviceFinancialAccessReadOnly: false };
        for (const [candidate, marker, key] of [
          [manifest, 'Require committed freeze, completed drain and a subsequent final backup', 'staleBaselineDenied'],
          [{ ...finalBaseline, tables: { ...manifest.tables, positions: { ...manifest.tables.positions, rowCount: manifest.tables.positions.rowCount + 1 } } }, 'Final snapshot mismatch: positions', 'snapshotDriftDenied'],
        ]) {
          let rejected = false;
          try { await query(migrationSql(candidate, parameters, migration), marker); } catch (error) { if (error.rollbackProbe !== true) throw error; rejected = true; }
          if (!rejected || await query("select to_regclass('public.user_profiles') is null;") !== 't') fail('Cutover guard did not reject without migration');
          await query(frozenAssertions()); report.cutover[key] = true;
        }
        reviewedSql = migrationSql(finalBaseline, parameters, migration);
      }
      const marker = `livestocks_rollback_probe_${randomBytes(16).toString('hex')}`;
      const injected = cutover
        ? reviewedSql.replace(/\bcommit;\nnotify pgrst/i, () => `do $$begin raise exception '${marker}'; end$$;\ncommit;\nnotify pgrst`)
        : migration.replace(/\bcommit;\s*$/i, () => `do $$begin raise exception '${marker}'; end$$;\ncommit;`);
      let failed = false;
      try { await query(`${cutover ? '' : parameters}\n${injected}`, marker); } catch (error) {
        if (error.rollbackProbe !== true) throw error;
        failed = true;
      }
      if (!failed || await query("select to_regclass('public.user_profiles') is null;") !== 't') fail('Injected migration failure did not roll back schema changes');
      for (const table of tables) {
        const digest = await query(`select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),'')) from public.${table} r;`);
        if (digest !== manifest.tables[table].originalDigest) fail('Injected migration failure changed restored data');
      }
      report.migration.rollbackVerified = true;
      if (cutover) { await query(frozenAssertions()); report.cutover.rollbackKeptFreeze = true; }
      report.phase = 'migration_apply_rehearsal';
      await query(`${cutover ? '' : parameters}\n${reviewedSql}`);
      const owner = manifest.ownerSubject;
      if (typeof owner !== 'string' || !owner || owner.length > 255) fail('Invalid verified owner in protected manifest');
      const ownerLiteral = `'${owner.replaceAll("'", "''")}'`;
      for (const table of tables) {
        const stats = JSON.parse(await query(`select jsonb_build_object('rowCount',count(*),'digest',md5(coalesce(string_agg(md5((to_jsonb(r)-'user_id')::text),'' order by id),'')),'incorrectOwner',count(*) filter(where user_id<>${ownerLiteral})) from public.${table} r;`));
        if (stats.rowCount !== manifest.tables[table].rowCount || stats.digest !== manifest.tables[table].migrationDigest || stats.incorrectOwner !== 0) fail(`Migration changed original data or owner for ${table}`);
      }
      if (await query(`select count(*)=1 from public.user_profiles where id=${ownerLiteral};`) !== 't') fail('Verified owner profile missing');
      report.migration.financialDataPreserved = true;
      report.migration.ownerVerified = true;
      if (await query("select count(*)=0 from information_schema.columns where table_schema='public' and table_name='settings' and column_name='finnhub_token';") !== 't') fail('Legacy credential column was not removed');
      const envelope = await query(`select encrypted_value from private.user_credentials where user_id=${ownerLiteral};`);
      if (present) {
        const [version, iv, tag, ciphertext, extra] = envelope.split('.');
        if (version !== 'v1' || !iv || !tag || !ciphertext || extra !== undefined) fail('Invalid migrated credential envelope');
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
        decipher.setAAD(Buffer.from(`livestocks:finnhub:v1:${owner}`));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        const value = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]);
        if (createHash('sha256').update(value).digest('hex') !== manifest.legacyCredential.plaintextSha256) fail('Migrated credential did not preserve the original value');
      } else if (envelope) fail('Unexpected migrated credential');
      report.migration.encryptedCredentialVerified = true;
      if (cutover) {
        if (await query("select count(*)=1 from supabase_migrations.schema_migrations where version='20261114114916';") !== 't') fail('Cutover migration history was not recorded');
        report.cutover.historyRecordedAtomically = true;
        for (const table of tables) {
          if (await query(`select has_table_privilege('service_role','public.${table}','SELECT') and not has_table_privilege('service_role','public.${table}','INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('anon','public.${table}','SELECT,INSERT,UPDATE,DELETE');`) !== 't') fail('Post-cutover financial privileges incorrect');
        }
        report.cutover.serviceFinancialAccessReadOnly = true;
      }
    }
    report.status = 'PASS';
    report.phase = 'verified';
  } catch (error) {
    // Retain diagnostics only in the user's protected backup directory; never stdout.
    if (error.privateDiagnostic) await writeFile(join(directory, 'restore-diagnostic.txt'), error.privateDiagnostic, { mode: 0o600 });
    throw error;
  } finally {
    for (const child of children) child.kill('SIGTERM');
    // Cleanup must still run after a signal; it only targets this fresh PGDATA.
    interrupted = false;
    if (started || await lstat(join(data, 'postmaster.pid')).then(() => true, () => false)) {
      try { await run(join(binaries, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop']); cleanup = true; }
      catch { report.status = 'INCOMPLETE'; report.cleanup = 'FAILED_PRIVATE_RUNTIME_RETAINED'; }
    } else cleanup = true;
    if (cleanup) { await rm(runtime, { recursive: true, force: true }); report.cleanup = 'COMPLETE'; }
    report.completedAt = new Date().toISOString();
    await writeFile(join(directory, 'restore-report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  }
  if (report.status !== 'PASS' || !cleanup) fail('Restore verification incomplete; inspect protected restore report');
  await rm(join(directory, 'restore-diagnostic.txt'), { force: true });
  // Preserve the preparation manifest as originally generated; separate proof records the actual restore.
  console.log(JSON.stringify({ status: report.status, restoreTested: report.restoreTested,
    tablesVerified: tables.length, legacyCredentialVerified: report.legacyCredentialVerified, cleanup: report.cleanup,
    migrationRehearsed: rehearse, productionWrites: false, report: join(directory, 'restore-report.json') }));
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = 2;
});
main().catch(() => { console.error('Isolated restore verification failed; sensitive diagnostics suppressed. Check the protected restore report if created.'); process.exitCode = 1; });
