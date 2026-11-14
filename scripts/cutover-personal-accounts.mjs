#!/usr/bin/env node
/** Reviewable SQL-package preparation / read-only preflight. NEVER applies SQL.
 * No .env loading, automatic token refresh, or production write mode.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRemoteJWKSet } from 'jose';
import { databaseEnvironment, safeBackupDirectory, verifyOwnerToken } from './prepare-account-migration.mjs';

export const TARGET_PROJECT = 'osvwctooasdxsztatirz';
export const MIGRATION_NAME = '20261114114916_auth0_user_isolation.sql';
export const MIGRATION_SHA256 = '92f2a3c6bd5255029232576c2c147ced84dbc0fa3c527c6c4df6703e5f32dffc';
export const TABLES = ['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'];
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// The original single-migration rehearsal predates canonical account merging and
// the requested on-site login. Do not issue a stale production package.
export const CUTOVER_READY = false;
const roleList='public, anon, authenticated, service_role';
const tableList=TABLES.map(name=>`public.${name}`).join(', ');
function check(condition,message){if(!condition)throw new Error(message);}
function literal(value){return `'${String(value).replaceAll("'","''")}'`;}
function ownerCheck(manifest){check(typeof manifest.ownerSubject==='string'&&manifest.ownerSubject.length>0&&manifest.ownerSubject.length<=255,'Invalid confirmed owner');}
export function validateMigration(source){check(createHash('sha256').update(source).digest('hex')===MIGRATION_SHA256,'Migration differs from the restored-copy rehearsal');}
export function frozenAssertions(){return `do $freeze_assert$
declare t text; r text;
begin
 foreach t in array array[${TABLES.map(literal).join(',')}] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,REFERENCES') then
    raise exception 'Legacy table privileges remain: % / %',t,r;
   end if;
  end loop;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   cross join (values('anon'),('authenticated'),('service_role')) r(name)
   where n.nspname='public' and has_function_privilege(r.name,p.oid,'EXECUTE')) then
  raise exception 'Legacy public RPC execution privileges remain';
 end if;
end;
$freeze_assert$;`;}

export function freezeSql(manifest){ownerCheck(manifest);return `-- REVIEWED FREEZE ONLY: irrevocably closes legacy API access until forward migration.
-- Execute only with the exact connection accepted by --check. No permission rollback exists.
set standard_conforming_strings=on;
begin read write;
set local lock_timeout='30s';
set local statement_timeout='60s';
select pg_catalog.pg_advisory_xact_lock(73412311661001);
lock table ${tableList} in access exclusive mode;
do $$begin if to_regclass('public.user_profiles') is not null then raise exception 'Already migrated; do not freeze';end if;end$$;
revoke all privileges on table ${tableList} from ${roleList};
do $columns$
declare t text; columns text;
begin
 foreach t in array array[${TABLES.map(literal).join(',')}] loop
  select string_agg(quote_ident(attname),',' order by attnum) into columns from pg_attribute
   where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
  execute format('revoke all privileges (%s) on table public.%I from public,anon,authenticated,service_role',columns,t);
 end loop;
end;
$columns$;
revoke execute on all functions in schema public from ${roleList};
create schema if not exists private;
create table if not exists private.account_cutover_state(
 singleton boolean primary key default true check(singleton), project_ref text not null,
 owner_subject text not null, migration_sha256 text not null, frozen_at timestamptz not null,
 drained_at timestamptz, migrated_at timestamptz);
revoke all on private.account_cutover_state from ${roleList};
insert into private.account_cutover_state(singleton,project_ref,owner_subject,migration_sha256,frozen_at)
 values(true,${literal(TARGET_PROJECT)},${literal(manifest.ownerSubject)},${literal(MIGRATION_SHA256)},clock_timestamp());
commit;
-- The freeze above stays committed if draining or any later operation fails.
${drainSql(manifest)}`;}

export function drainSql(manifest){ownerCheck(manifest);return `begin read write;
set local statement_timeout='60s';
do $$begin if not exists(select 1 from private.account_cutover_state where singleton and project_ref=${literal(TARGET_PROJECT)}
 and owner_subject=${literal(manifest.ownerSubject)} and migration_sha256=${literal(MIGRATION_SHA256)} and migrated_at is null)
 then raise exception 'Expected committed freeze is missing';end if;end$$;
${frozenAssertions()}
do $drain$
declare p integer;
begin
 for p in select pid from pg_stat_activity where usename='authenticator' and pid<>pg_backend_pid() loop
  if not pg_terminate_backend(p,5000) then raise exception 'Could not drain legacy API backend';end if;
 end loop;
end;
$drain$;
update private.account_cutover_state set drained_at=clock_timestamp() where singleton and migrated_at is null;
commit;
-- New authenticator connections are harmless while effective table/RPC privileges remain revoked.
`;}

export function comparisonSql(manifest,transformed=false){
  ownerCheck(manifest);check(Number.isFinite(Date.parse(manifest.generatedAt)),'Invalid backup timestamp');
  const rows=TABLES.map(name=>{const value=manifest.tables?.[name];const digest=value?.[transformed?'migrationDigest':'originalDigest'];
    check(Number.isSafeInteger(value?.rowCount)&&value.rowCount>=0&&/^[a-f0-9]{32}$/.test(digest),'Invalid six-table baseline');
    return `(${literal(name)},${value.rowCount},${literal(digest)})`;}).join(',\n');
  return `do $compare$
declare expected record; actual_count bigint; actual_digest text; incorrect_owner bigint;
begin
 for expected in select * from (values ${rows}) v(table_name,row_count,digest) loop
  execute format('select count(*),md5(coalesce(string_agg(md5((${transformed?"to_jsonb(r)-''user_id''":"to_jsonb(r)"})::text),'''' order by id),'''')) from public.%I r',expected.table_name) into actual_count,actual_digest;
  if actual_count<>expected.row_count or actual_digest<>expected.digest then raise exception 'Final snapshot mismatch: %',expected.table_name;end if;
  ${transformed?`execute format('select count(*) from public.%I where user_id is distinct from $1',expected.table_name) into incorrect_owner using ${literal(manifest.ownerSubject)};
  if incorrect_owner<>0 then raise exception 'Owner mismatch: %',expected.table_name;end if;`:''}
 end loop;
end;
$compare$;`;
}

export function migrationSql(manifest,parameters,migration){
  validateMigration(migration);ownerCheck(manifest);
  const body=migration.replace(/^begin;\r?\n/m,'').replace(/\bcommit;\s*$/i,'');
  return `-- Exact target ${TARGET_PROJECT}; reviewed migration SHA256 ${MIGRATION_SHA256}.
-- Parameters, final comparison, schema/data changes and migration history share ONE transaction.
set standard_conforming_strings=on;
begin read write;
set local timezone='UTC';
set local lock_timeout='30s';
set local statement_timeout='120s';
select pg_catalog.pg_advisory_xact_lock(73412311661001);
lock table ${tableList} in access exclusive mode;
do $guard$
begin
 if not exists(select 1 from private.account_cutover_state where singleton
   and project_ref=${literal(TARGET_PROJECT)} and owner_subject=${literal(manifest.ownerSubject)}
   and migration_sha256=${literal(MIGRATION_SHA256)} and migrated_at is null
   and drained_at is not null and drained_at<=${literal(manifest.generatedAt)}::timestamptz) then
  raise exception 'Require committed freeze, completed drain and a subsequent final backup';
 end if;
 if to_regclass('supabase_migrations.schema_migrations') is null then raise exception 'Migration history unavailable';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261114114916') then raise exception 'Migration already recorded';end if;
end;
$guard$;
${frozenAssertions()}
${comparisonSql(manifest)}
${parameters}
do $$begin if current_setting('app.legacy_owner_subject',true) is distinct from ${literal(manifest.ownerSubject)} then raise exception 'Parameter owner differs from confirmed backup owner';end if;end$$;
${body}
${comparisonSql(manifest,true)}
-- The only service-role financial-table permission needed by the new widget path is SELECT.
grant select on table ${tableList} to service_role;
insert into supabase_migrations.schema_migrations(version,name,statements)
 values('20261114114916','auth0_user_isolation',array[${literal(migration)}]);
update private.account_cutover_state set migrated_at=clock_timestamp() where singleton;
commit;
notify pgrst,'reload schema';
`;}

async function privateFile(path){check(isAbsolute(path),'Private file path must be absolute');const s=await lstat(path);check(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o077)===0,'Private files must be owned, regular and mode0600');return readFile(path,'utf8');}
async function artifact(directory){
  const path=await safeBackupDirectory(directory);const s=await lstat(path);check(s.uid===process.getuid()&&(s.mode&0o077)===0,'Backup directory must be private');
  const manifest=JSON.parse(await privateFile(join(path,'manifest.json')));const proof=JSON.parse(await privateFile(join(path,'restore-report.json')));
  check(manifest.status==='PREPARED_RESTORE_TEST_REQUIRED'&&proof.status==='PASS'&&proof.restoreTested===true&&proof.cleanup==='COMPLETE'
    &&proof.ciphertextSha256===manifest.archive?.ciphertextSha256&&proof.migration?.sha256===MIGRATION_SHA256
    &&proof.migration.rollbackVerified&&proof.migration.financialDataPreserved&&proof.migration.ownerVerified&&proof.migration.encryptedCredentialVerified,'Require the matching successful restore and migration proof');
  const archive=await readFile(await realpath(join(path,'public.pgdump.enc')));check(createHash('sha256').update(archive).digest('hex')===manifest.archive.ciphertextSha256,'Backup ciphertext changed');
  return{manifest,parameters:await privateFile(join(path,'migration-parameters.sql'))};
}

export async function checkedProductionEnvironment(url,certificate){
  const env=await databaseEnvironment(url,certificate);
  check(env.PGDATABASE==='postgres'&&((env.PGHOST===`db.${TARGET_PROJECT}.supabase.co`&&env.PGUSER==='postgres')||(/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(env.PGHOST)&&env.PGUSER===`postgres.${TARGET_PROJECT}`)),'Database connection is not the exact confirmed production target');
  return env;
}

async function main(){
  if(process.argv.includes('--apply'))throw new Error('This tool cannot apply SQL. Follow the reviewed manual runbook after all gates pass.');
  if(process.argv.includes('--help')){console.log('Preparation only: node scripts/cutover-personal-accounts.mjs --prepare|--check --project osvwctooasdxsztatirz --backup-directory /private/verified-backup --owner-file /private/confirmed-owner.json [--output-directory /private/existing-directory]\n--check requires explicit MIGRATION_DATABASE_URL, MIGRATION_SSL_ROOT_CERT and Auth0 config env. It cryptographically verifies the current owner token, then uses read-only SQL. No .env loading, refresh token consumption or write mode. --prepare emits protected reviewable SQL only; it does not establish a fresh identity or authorize execution.');return;}
  const args=process.argv.slice(2);const mode=args.shift();check(['--check','--prepare'].includes(mode),'Select --check or --prepare');const opts={};
  while(args.length){const name=args.shift();const value=args.shift();check(['--project','--backup-directory','--owner-file','--output-directory'].includes(name)&&value&&!opts[name],'Invalid or duplicate argument');opts[name]=value;}
  check(opts['--project']===TARGET_PROJECT,'Exact production project confirmation required');
  const {manifest,parameters}=await artifact(opts['--backup-directory']);const owner=JSON.parse(await privateFile(opts['--owner-file']));
  check(owner.userId===manifest.ownerSubject&&owner.emailVerified===true&&Number.isFinite(Date.parse(owner.confirmedAt)),'Owner differs from the explicitly confirmed backup owner');
  const migration=await readFile(join(root,'supabase/migrations',MIGRATION_NAME),'utf8');validateMigration(migration);
  if(mode==='--prepare'){
    if (!CUTOVER_READY) {
      console.error('Production package blocked: rehearse the complete canonical-profile migration and pass the on-site authentication/refresh-revocation gates first.');
      throw new Error('Cutover is not ready');
    }
    const output=await safeBackupDirectory(opts['--output-directory']);const s=await lstat(output);check(s.uid===process.getuid()&&(s.mode&0o077)===0,'Output directory must be private');
    await writeFile(join(output,'01-freeze-and-drain.sql'),freezeSql(manifest),{mode:0o600,flag:'wx'});
    await writeFile(join(output,'01b-retry-drain-only.sql'),drainSql(manifest),{mode:0o600,flag:'wx'});
    await writeFile(join(output,'02-compare-and-migrate.sql'),migrationSql(manifest,parameters,migration),{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({status:'PREPARED_NOT_AUTHORIZED_TO_APPLY',project:TARGET_PROJECT,migrationSha256:MIGRATION_SHA256,requiresFreshOwnerCheck:true,requiresPostFreezeBackup:true}));return;
  }
  const config={issuer:`https://${process.env.AUTH0_DOMAIN}/`,websiteClientId:process.env.AUTH0_CLIENT_ID,mcpClientId:process.env.AUTH0_MCP_CLIENT_ID,websiteAudience:process.env.AUTH0_WEB_AUDIENCE,mcpAudience:process.env.AUTH0_MCP_AUDIENCE};
  check(config.issuer==='https://dev-c8o5jwbmbzkzac2s.us.auth0.com/'&&config.websiteAudience==='https://razmaz-live-stocks.vercel.app/api/web'&&config.mcpAudience==='https://razmaz-live-stocks.vercel.app/api/mcp','Unexpected trusted Auth0 configuration');
  await verifyOwnerToken(owner.accessToken,manifest.ownerSubject,config,createRemoteJWKSet(new URL('.well-known/jwks.json',config.issuer)));
  const env=await checkedProductionEnvironment(process.env.MIGRATION_DATABASE_URL,process.env.MIGRATION_SSL_ROOT_CERT);
  const query=`begin read only;set local timezone='UTC';select jsonb_build_object('database',current_database(),'legacySchema',to_regclass('public.user_profiles') is null,'cutoverMarkerExists',to_regclass('private.account_cutover_state') is not null);rollback;`;
  let result;try{result=execFileSync('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{env,input:query,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20_000}).trim();}catch{throw new Error('Read-only database preflight failed; sensitive diagnostics suppressed');}
  console.log(JSON.stringify({status:'READ_ONLY_CHECK_PASSED',project:TARGET_PROJECT,ownerCryptographicallyVerified:true,migrationSha256:MIGRATION_SHA256,database:JSON.parse(result),writesPerformed:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Cutover preparation/check failed; no SQL was applied. Review inputs and gates.');process.exitCode=1;});
