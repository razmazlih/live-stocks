#!/usr/bin/env node
/** Restore proof only: creates and destroys its own authenticated loopback cluster.
 * Never accepts a database URL, reads .env, or connects to an existing database.
 * Real restored data exists only in the mode-0700 disposable cluster directory.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { AUTH_TABLES, authCatalogSql, authMembershipOptionsSql, restoredAuthAclSql, preprovisionAuthSql, adoptionGuardSql, confirmationRowsSql, verifyOwnerConfirmation, CONFIRMATION_ISSUER, CONFIRMATION_AUDIENCE } from './owner-store-adoption.mjs';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { safeBackupDirectory } from './prepare-account-migration.mjs';
import { freezeSql, migrationSql, frozenAssertions, readMigrationBundle, MIGRATIONS, BUNDLE_SHA256 } from './cutover-personal-accounts.mjs';

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
  const rehearse = process.argv.length === 5 && ['--rehearse-cutover','--rehearse-migration'].includes(process.argv[4]);
  const cutover = rehearse; // Both legacy flags now rehearse the complete guarded bundle.
  if ((!rehearse && process.argv.length !== 4) || process.argv[2] !== '--backup-directory') fail('Usage: RESTORE_POSTGRES_BIN=/absolute/postgresql17/bin CREDENTIAL_ENCRYPTION_KEY=protected-env node scripts/restore-account-backup.mjs --backup-directory /absolute/private/backup [--rehearse-migration]');
  const directory = await safeBackupDirectory(process.argv[3]);
  const dirInfo = await lstat(directory);
  if (dirInfo.uid !== process.getuid() || (dirInfo.mode & 0o077)) fail('Backup directory must be owned by you and mode 0700');
  const manifestPath = await protectedFile(join(directory, 'manifest.json'));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.status !== 'PREPARED_RESTORE_TEST_REQUIRED' || manifest.archive?.file !== 'public.pgdump.enc'
    || manifest.archive?.encryption !== 'aes-256-gcm' || manifest.archiveAuthenticated !== true) fail('Unsupported or incomplete backup manifest');
  const sourceHasAuth=Array.isArray(manifest.schemas)&&manifest.schemas.includes('livestocks_auth');
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
    tooling:{cutoverGeneratorSha256:createHash('sha256').update(await readFile(new URL('./cutover-personal-accounts.mjs',import.meta.url))).digest('hex'),
      ownerStoreToolSha256:createHash('sha256').update(await readFile(new URL('./owner-store-adoption.mjs',import.meta.url))).digest('hex'),
      restoreToolSha256:createHash('sha256').update(await readFile(new URL('./restore-account-backup.mjs',import.meta.url))).digest('hex')},
    restoredTables: {}, digestTimeZone: 'UTC', restoreTested: false, cleanup: 'PENDING', phase: 'initialize' };
  const adminEnv={...env,PGUSER:'restore_cluster_admin'};
  const adminQuery=(sql,expectedErrorMarker)=>run('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],adminEnv,sql,expectedErrorMarker);
  const query = (sql, expectedErrorMarker) => run('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], env, sql, expectedErrorMarker);
  try {
    await writeFile(passwordFile, password, { mode: 0o600, flag: 'wx' });
    await run(join(binaries, 'initdb'), ['-D', data, '-U', 'restore_cluster_admin', '--auth-local=trust', '--auth-host=scram-sha-256', `--pwfile=${passwordFile}`, '--no-locale', '-E', 'UTF8']);
    await run(join(binaries, 'pg_ctl'), ['-D', data, '-l', join(runtime, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories='' -c log_statement=none`, '-w', 'start']);
    started = true;
    await adminQuery(`create role postgres login superuser createdb createrole password '${password}';alter database postgres owner to postgres;alter schema public owner to postgres;`);
    const actualData = await query('show data_directory;');
    if (resolve(actualData) !== resolve(data)) fail('Local database identity mismatch');
    await query('create role anon; create role authenticated; create role service_role;');
    if(sourceHasAuth)await query('create role livestocks_auth_backend login noinherit nosuperuser nobypassrls nocreatedb nocreaterole;');
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
      // Restoring as the temporary superuser preserves original object ownership.
      // Every freeze/migration/proof query below runs as the real non-superuser
      // postgres actor; the separate cluster admin is only used for local setup.
      await adminQuery('grant anon,authenticated,service_role to postgres with set true, inherit false;grant pg_signal_backend to postgres;alter role postgres nosuperuser createrole;');
      const operator=JSON.parse(await query("select jsonb_build_object('role',current_user,'super',rolsuper,'createRole',rolcreaterole,'selfGrant',current_setting('createrole_self_grant')) from pg_roles where rolname=current_user;"));
      if(operator.role!=='postgres'||operator.super||!operator.createRole||operator.selfGrant!=='')fail('Migration rehearsal actor is not the reviewed non-superuser');
      report.migrationOperator=operator;
      report.phase = 'migration_rollback_rehearsal';
      const bundle = await readMigrationBundle();
      const binding = { adoptAuthStore:true,kind:'LOCAL_REHEARSAL', legacyOwnerSubject:manifest.ownerSubject, subject:`synthetic-owner-${randomBytes(16).toString('hex')}`,
        origin:'https://livestocks-rehearsal.invalid',websiteClientId:'livestocks-rehearsal-web',mcpClientId:'livestocks-rehearsal-mcp' };
      const parameters = await readFile(await protectedFile(join(directory, 'migration-parameters.sql')), 'utf8');
      const quoted = value => `'${String(value).replaceAll("'", "''")}'`;
      // pg_restore --no-privileges omits original ACLs. Reconstruct only the
      // reviewed boundary locally; the production database is never changed.
      await query('revoke execute on all functions in schema public from public;');
      const owner=manifest.ownerSubject,ownerLiteral=quoted(owner);
      let sessionId,sessionCreated,runId,syntheticConfirmationSecret;
      if(sourceHasAuth){
        await adminQuery(restoredAuthAclSql(bundle[2].source));
        for(const table of AUTH_TABLES){
          const stats=JSON.parse(await query(`select jsonb_build_object('rowCount',count(*),'originalDigest',md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),''))) from livestocks_auth."${table}" r;`));
          if(stats.rowCount!==manifest.authStoreTables?.[table]?.rowCount||stats.originalDigest!==manifest.authStoreTables?.[table]?.originalDigest)fail('Restored final auth store differs from its encrypted backup baseline');
        }
        const proof=manifest.ownerConfirmation;
        if(!proof||typeof process.env.BETTER_AUTH_SECRET!=='string')fail('Final-store restoration requires its recorded owner proof and explicit Better Auth secret');
        const receipt=await query(`select value from livestocks_auth.verification where id=${quoted(proof.runId)};`);
        const artifact={proofType:'better_auth_final_store_confirmation',userId:proof.userId,email:proof.email,emailVerified:true,confirmedAt:proof.confirmedAt,authSessionId:proof.sessionId,authSessionCreatedAt:proof.sessionCreatedAt,confirmationRunId:proof.runId,confirmationReceipt:receipt,confirmationIssuer:CONFIRMATION_ISSUER,legacyOwnerSubject:owner,finalAuthStoreProject:'osvwctooasdxsztatirz'};
        binding.subject=proof.userId;binding.ownerConfirmation=await verifyOwnerConfirmation(artifact,{userId:owner,email:proof.email,emailVerified:true},process.env.BETTER_AUTH_SECRET);
        if(binding.ownerConfirmation.receiptSha256!==proof.receiptSha256)fail('Stored owner receipt differs from the verified backup proof');
        sessionId=proof.sessionId;sessionCreated=proof.sessionCreatedAt;runId=proof.runId;
      }else{
        await query(preprovisionAuthSql(bundle[2].source,{backendPassword:randomBytes(32).toString('hex')}));
        if(process.env.RESTORE_MANAGED_ROLE_PROBE==='1'){
          // Synthetic local provenance only: model the admin edge automatically
          // created by managed PostgreSQL's non-superuser CREATEROLE operator.
          await adminQuery(`begin;do $$begin if inet_server_addr() is distinct from '127.0.0.1'::inet then raise exception 'Managed role fixture is local only';end if;end$$;
            grant livestocks_auth_backend to postgres with admin true, set false, inherit false;
            update private.owner_store_provision set catalog_snapshot=c.snapshot,catalog_fingerprint=encode(sha256(convert_to(c.snapshot::text,'UTF8')),'hex') from (${authCatalogSql()}) c(snapshot) where singleton;commit;`);
        }
        sessionId=`synthetic-session-${randomBytes(16).toString('hex')}`;runId=randomUUID();
        const now=Math.floor(Date.now()/1000),confirmedAt=new Date().toISOString(),email='restore-proof@example.invalid',confirmationSecret=randomBytes(48).toString('hex');
        sessionCreated=now-10;syntheticConfirmationSecret=confirmationSecret;
        const receipt=await new SignJWT({purpose:'confirmed',runId,sid:sessionId,email,email_verified:true,legacy_subject:owner,auth_session_created_at:sessionCreated,confirmed_at:confirmedAt})
          .setProtectedHeader({alg:'HS256'}).setSubject(binding.subject).setIssuer(CONFIRMATION_ISSUER).setAudience(CONFIRMATION_AUDIENCE).setJti(runId).setIssuedAt(now).setExpirationTime(now+900).sign(new TextEncoder().encode(confirmationSecret));
        const artifact={proofType:'better_auth_final_store_confirmation',userId:binding.subject,email,emailVerified:true,confirmedAt,authSessionId:sessionId,authSessionCreatedAt:sessionCreated,confirmationRunId:runId,confirmationReceipt:receipt,confirmationIssuer:CONFIRMATION_ISSUER,legacyOwnerSubject:owner,finalAuthStoreProject:'osvwctooasdxsztatirz'};
        binding.ownerConfirmation=await verifyOwnerConfirmation(artifact,{userId:owner,email,emailVerified:true},confirmationSecret);
        await query(`begin read write;
          insert into livestocks_auth."user"(id,name,email,"emailVerified") values(${quoted(binding.subject)},'Local restore proof',${quoted(email)},true);
          insert into livestocks_auth.session(id,token,"userId","createdAt","updatedAt","expiresAt") values(${quoted(sessionId)},${quoted(randomBytes(32).toString('hex'))},${quoted(binding.subject)},to_timestamp(${sessionCreated}),now(),now()+interval '1 hour');
          insert into livestocks_auth.account(id,"accountId","providerId","userId","accessToken","updatedAt") values('synthetic-google-account','synthetic-google-id','google',${quoted(binding.subject)},'encrypted-synthetic-oauth-token',now());
          insert into livestocks_auth.verification(id,identifier,value,"expiresAt") values(${quoted(runId)},${quoted('livestocks:owner-confirmation:'+runId)},${quoted(receipt)},to_timestamp(${now+900}));
          insert into livestocks_auth.jwks(id,"publicKey","privateKey","createdAt") values('synthetic-signing-key','synthetic-public-key','encrypted-synthetic-private-key',now());commit;`);
      }
      const subject=quoted(binding.subject),issuer=quoted(`${binding.origin}/api/auth`);
      const authData=async()=>Object.fromEntries(await Promise.all(AUTH_TABLES.map(async table=>[table,await query(`select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),'')) from livestocks_auth."${table}" r;`)])));
      const authBefore=await authData();
      report.ownerStore={preprovisioned:true,restoredExistingStore:sourceHasAuth,legacyAclReconstructedLocally:true,financialDataUntouched:true,exactAdoptionVerified:false,receiptSignatureVerified:true,realGoogleOwnerProved:false,structureDriftDenied:false,aclDriftDenied:false,markerDriftDenied:false,receiptDriftDenied:false,deletedSessionDenied:false,authRowsPreserved:false,rollbackKeptPreprovisionedStore:false};
      const expectedMemberships=JSON.parse(await query("select catalog_snapshot->'memberships' from private.owner_store_provision where singleton;"));
      report.ownerStore.managedPostgresAdminMembership=JSON.stringify(expectedMemberships)===JSON.stringify([['livestocks_auth_backend','postgres',true]]);
      for(const memberships of [[['postgres','livestocks_auth_backend',true]],[['livestocks_auth_backend','anon',true]],[['livestocks_auth_backend','postgres',false]],[['livestocks_auth_backend','postgres']], [['livestocks_auth_backend','postgres',true],['livestocks_auth_backend','postgres',true]]]){
        const changed=`jsonb_set(catalog_snapshot,'{memberships}',${quoted(JSON.stringify(memberships))}::jsonb)`;
        const invalidSql=restoredAuthAclSql(bundle[2].source).replace("set local search_path='';",`set local search_path='';update private.owner_store_provision set catalog_snapshot=${changed},catalog_fingerprint=encode(sha256(convert_to((${changed})::text,'UTF8')),'hex') where singleton;`);
        let rejected=false;try{await query(invalidSql,'Unreviewed role membership in restored marker');}catch(error){if(!error.rollbackProbe)throw error;rejected=true;}
        if(!rejected)fail('Unsafe restored role membership accepted');
      }
      report.ownerStore.unsafeMembershipsDenied=true;
      for(const rolePatch of [{createRole:true},{inherit:true},{config:['role=postgres']},{connectionLimit:1},{validUntil:'2099-01-01'}]){
        const changed=`jsonb_set(catalog_snapshot,'{role}',(catalog_snapshot->'role')||${quoted(JSON.stringify(rolePatch))}::jsonb)`;
        const invalidSql=restoredAuthAclSql(bundle[2].source).replace("set local search_path='';",`set local search_path='';update private.owner_store_provision set catalog_snapshot=${changed},catalog_fingerprint=encode(sha256(convert_to((${changed})::text,'UTF8')),'hex') where singleton;`);
        let rejected=false;try{await query(invalidSql,'Unreviewed restored backend role attributes');}catch(error){if(!error.rollbackProbe)throw error;rejected=true;}
        if(!rejected)fail('Unsafe restored role attributes accepted');
      }
      report.ownerStore.unsafeRoleAttributesDenied=true;
      for(const options of ['set true, inherit false','set false, inherit true']){
        let rejected=false;try{await adminQuery(`begin;grant livestocks_auth_backend to postgres with admin true, ${options};${authMembershipOptionsSql()}commit;`,'Unsafe auth backend membership options');}catch(error){if(!error.rollbackProbe)throw error;rejected=true;}
        if(!rejected)fail('Unsafe membership SET/INHERIT options accepted');
      }
      await query(authMembershipOptionsSql());report.ownerStore.exactMembershipOptionsVerified=true;report.ownerStore.unsafeMembershipOptionsDenied=true;
      if(!sourceHasAuth&&process.env.RESTORE_FINAL_STORE_PROBE==='1'){
        // Exercise the future final-store archive format using this already
        // private local clone. The nested archive and both clusters are removed.
        const nested=join(runtime,'encrypted-final-store-probe');await mkdir(nested,{mode:0o700});
        const nestedManifest=structuredClone(manifest);nestedManifest.schemas=['public','private','supabase_migrations','livestocks_auth'];nestedManifest.ownerConfirmation=binding.ownerConfirmation;nestedManifest.authStoreTables={};
        for(const table of AUTH_TABLES)nestedManifest.authStoreTables[table]=JSON.parse(await query(`select jsonb_build_object('rowCount',count(*),'originalDigest',md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),''))) from livestocks_auth."${table}" r;`));
        const iv=randomBytes(12),aad=`livestocks:local-final-store-probe:${randomBytes(16).toString('hex')}`,cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
        const dump=start('pg_dump',['--format=custom','--no-owner','--no-privileges',...nestedManifest.schemas.map(name=>`--schema=${name}`)],env);dump.stdin.end();
        const nestedArchive=join(nested,'public.pgdump.enc');await Promise.all([pipeline(dump.stdout,cipher,createWriteStream(nestedArchive,{flags:'wx',mode:0o600})),dump.done]);
        const cipherDigest=createHash('sha256');for await(const chunk of createReadStream(nestedArchive))cipherDigest.update(chunk);
        nestedManifest.archive={...manifest.archive,iv:iv.toString('base64url'),aad,tag:cipher.getAuthTag().toString('base64url'),ciphertextSha256:cipherDigest.digest('hex')};
        await pipeline(createReadStream(nestedArchive),decrypt(nestedManifest.archive,key),new Writable({write(_c,_e,done){done();}}));
        await writeFile(join(nested,'manifest.json'),JSON.stringify(nestedManifest),{mode:0o600});await writeFile(join(nested,'migration-parameters.sql'),parameters,{mode:0o600});
        await run(process.execPath,[fileURLToPath(import.meta.url),'--backup-directory',nested,'--rehearse-cutover'],{...cleanEnv,RESTORE_POSTGRES_BIN:binaries,CREDENTIAL_ENCRYPTION_KEY:keyHex,BETTER_AUTH_SECRET:syntheticConfirmationSecret});
        const nestedReport=JSON.parse(await readFile(join(nested,'restore-report.json'),'utf8'));
        if(nestedReport.status!=='PASS'||nestedReport.cleanup!=='COMPLETE'||!nestedReport.ownerStore?.restoredExistingStore||!nestedReport.ownerStore?.authRowsPreserved)fail('Final-store archive round trip failed');
        report.ownerStore.finalStoreEncryptedArchiveRestoreVerified=true;
        if(report.ownerStore.managedPostgresAdminMembership&&!nestedReport.ownerStore.managedPostgresAdminMembership)fail('Managed PostgreSQL admin membership was not reconstructed');
        report.ownerStore.managedMembershipArchiveRoundtripVerified=report.ownerStore.managedPostgresAdminMembership&&nestedReport.ownerStore.managedPostgresAdminMembership;
      }

      for(const table of tables)if(await query(`select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),'')) from public.${table} r;`)!==manifest.tables[table].originalDigest)fail('Auth-only provisioning changed financial data');
      for(const [mutation,marker,key] of [
        ['alter table livestocks_auth."user" add column unexpected text;','Owner store structure or permissions changed','structureDriftDenied'],
        ['grant select on livestocks_auth."user" to anon;','Owner store structure or permissions changed','aclDriftDenied'],
        ["update private.owner_store_provision set prefix_sha256='changed';",'Unreviewed or already adopted owner store','markerDriftDenied'],
        [`update livestocks_auth.verification set value='changed' where id=${quoted(runId)};`,'Final-store Google owner/session/receipt check failed','receiptDriftDenied'],
        [`delete from livestocks_auth.session where id=${quoted(sessionId)};`,'Final-store Google owner/session/receipt check failed','deletedSessionDenied'],
      ]){
        let rejected=false;try{await query(`begin read write;set local search_path='';${mutation}${adoptionGuardSql(bundle[2].source)}${confirmationRowsSql(binding.ownerConfirmation)}commit;`,marker);}catch(error){if(!error.rollbackProbe)throw error;rejected=true;}
        if(!rejected)fail('Adoption did not reject unreviewed state');report.ownerStore[key]=true;
      }
      await query(`begin read write;set local search_path='';${adoptionGuardSql(bundle[2].source)}${confirmationRowsSql(binding.ownerConfirmation)}rollback;`);
      report.ownerStore.exactAdoptionVerified=true;

      await query("create schema auth; create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$; grant usage on schema auth,public to anon,authenticated,service_role;");
      report.migration = { files:MIGRATIONS,bundleSha256:BUNDLE_SHA256, rollbackVerified:false,
        bindingScope:sourceHasAuth?'FINAL_STORE_RECEIPT_ON_LOCAL_RESTORE':'SYNTHETIC_LOCAL_ONLY',realBetterAuthOwnerProved:false,explicitAliasVerified:false,liveAliasRlsVerified:false,
        financialDataPreserved: false, ownerVerified: false, encryptedCredentialVerified: false };
      let reviewedSql;
      if (cutover) {
        report.phase = 'cutover_freeze_rehearsal';
        if (await query("select to_regclass('private.account_cutover_state') is not null;") === 't') {
          await query('alter table private.account_cutover_state rename to restored_source_cutover_state;');
          report.restoredSourceFreezeMarkerPreserved = true;
        }
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
        report.cutover = { freezeCommitted: true, priorApiBackendDrained: true, staleBaselineDenied: false, snapshotDriftDenied: false, snapshotDigestDriftDenied:false,
          rollbackKeptFreeze: false, historyRecordedAtomically: false, serviceFinancialAccessReadOnly: false };
        for (const [candidate, marker, key] of [
          [manifest, 'Require committed freeze, completed drain and a subsequent final backup', 'staleBaselineDenied'],
          [{ ...finalBaseline, tables: { ...manifest.tables, positions: { ...manifest.tables.positions, rowCount: manifest.tables.positions.rowCount + 1 } } }, 'Final snapshot mismatch: positions', 'snapshotDriftDenied'],
          [{ ...finalBaseline, tables: { ...manifest.tables, positions: { ...manifest.tables.positions, originalDigest:'0'.repeat(32) } } }, 'Final snapshot mismatch: positions', 'snapshotDigestDriftDenied'],
        ]) {
          let rejected = false;
          try { await query(migrationSql(candidate, parameters, bundle, binding), marker); } catch (error) { if (error.rollbackProbe !== true) throw error; rejected = true; }
          if (!rejected || await query("select to_regclass('public.user_profiles') is null;") !== 't') fail('Cutover guard did not reject without migration');
          await query(frozenAssertions()); report.cutover[key] = true;
        }
        reviewedSql = migrationSql(finalBaseline, parameters, bundle, binding);
      }
      const withoutCreatorSet=reviewedSql.replace("set local createrole_self_grant='set';",'-- Negative proof: default empty creator setting.');
      let ownerTransferDenied=false;try{await query(withoutCreatorSet,'must be able to SET ROLE');}catch(error){if(!error.rollbackProbe)throw error;ownerTransferDenied=true;}
      if(!ownerTransferDenied||await query("select to_regclass('public.user_profiles') is null and not exists(select 1 from pg_roles where rolname='livestocks_merge_executor');")!=='t')fail('Non-superuser ownership negative proof did not roll back');
      report.migration.nonSuperuserOwnershipFailureVerified=true;
      const marker = `livestocks_rollback_probe_${randomBytes(16).toString('hex')}`;
      const injected = reviewedSql.replace(/\bcommit;\nnotify pgrst/i, () => `do $$begin raise exception '${marker}'; end$$;\ncommit;\nnotify pgrst`);
      let failed = false;
      try { await query(injected, marker); } catch (error) {
        if (error.rollbackProbe !== true) throw error;
        failed = true;
      }
      if (!failed || await query("select to_regclass('public.user_profiles') is null and to_regclass('private.signin_method_operations') is null and to_regnamespace('livestocks_auth') is not null and exists(select 1 from pg_roles where rolname='livestocks_auth_backend') and not exists(select 1 from pg_roles where rolname='livestocks_merge_executor') and (select adopted_at is null from private.owner_store_provision where singleton);") !== 't') fail('Injected migration failure did not roll back schema changes');
      for (const table of tables) {
        const digest = await query(`select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by id),'')) from public.${table} r;`);
        if (digest !== manifest.tables[table].originalDigest) fail('Injected migration failure changed restored data');
      }
      if (await query("select count(*)=0 from supabase_migrations.schema_migrations where version in('20261114114916','20261114145729','20261114151506','20261115094000');") !== 't') fail('Injected failure left partial migration history');
      if(JSON.stringify(await authData())!==JSON.stringify(authBefore))fail('Rollback changed preprovisioned auth records');
      report.ownerStore.rollbackKeptPreprovisionedStore=true;
      report.migration.historyRollbackVerified = true;
      report.migration.rollbackVerified = true;
      if (cutover) { await query(frozenAssertions()); report.cutover.rollbackKeptFreeze = true; }
      report.phase = 'migration_apply_rehearsal';
      await query(reviewedSql);
      if(await query("select pg_get_userbyid(proowner)='livestocks_merge_executor' and pg_has_role(current_user,'livestocks_merge_executor','SET') and current_setting('createrole_self_grant')='' from pg_proc where oid='public.server_merge_prepare(uuid,text,text)'::regprocedure;")!=='t')fail('Non-superuser owner transfer or local setting reset failed');
      await query(authMembershipOptionsSql());report.migration.nonSuperuserOwnershipTransferVerified=true;report.migration.creatorSettingResetVerified=true;
      if (typeof owner !== 'string' || !owner || owner.length > 255) fail('Invalid verified owner in protected manifest');
      for (const table of tables) {
        const stats = JSON.parse(await query(`select jsonb_build_object('rowCount',count(*),'digest',md5(coalesce(string_agg(md5((to_jsonb(r)-array['user_id','consolidated_into_position_id','is_active'])::text),'' order by id),'')),'incorrectOwner',count(*) filter(where user_id<>${ownerLiteral})) from public.${table} r;`));
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
      if (await query(`select exists(select 1 from private.identity_profiles where issuer=${issuer} and subject=${subject} and profile_id=${ownerLiteral} and state='active') and exists(select 1 from public.user_profiles where id=${ownerLiteral} and primary_pinned);`) !== 't') fail('Explicit owner alias or pinned canonical profile missing');
      report.migration.explicitAliasVerified = true;
      if(JSON.stringify(await authData())!==JSON.stringify(authBefore))fail('Adoption changed existing auth users, accounts, sessions or keys');
      if(await query(`select adopted_at is not null and owner_receipt_sha256=${quoted(binding.ownerConfirmation.receiptSha256)} and new_owner_subject=${subject} from private.owner_store_provision where singleton;`)!=='t')fail('Adoption marker was not committed');
      report.ownerStore.authRowsPreserved=true;
      const claims = JSON.stringify({iss:`${binding.origin}/api/auth`,sub:binding.subject,sid:sessionId,azp:binding.websiteClientId,aud:`${binding.origin}/api/web`,role:'authenticated',scope:'portfolio:read portfolio:write',iat:Math.floor(Date.now()/1000),
        'https://livestocks.app/read_only':false,'https://livestocks.app/email_verified':true,'https://livestocks.app/auth_session_id':sessionId,'https://livestocks.app/auth_session_created_at':sessionCreated});
      const aliasCount = await query(`begin read only;set local role authenticated;do $$begin perform set_config('request.jwt.claims',${quoted(claims)},true);end$$;select count(*) from public.positions;rollback;`);
      if (Number(aliasCount) !== manifest.tables.positions.rowCount) fail('Verified synthetic alias cannot read canonical portfolio through RLS');
      if (await query(`select public.server_better_auth_token_valid(${subject},${quoted(sessionId)},${quoted(binding.websiteClientId)});`) !== 't') fail('Synthetic live owner session rejected');
      report.migration.liveAliasRlsVerified = true;

      if (cutover) {
        if (await query("select count(*)=4 from supabase_migrations.schema_migrations where version in('20261114114916','20261114145729','20261114151506','20261115094000');") !== 't') fail('Cutover migration history was not recorded');
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
