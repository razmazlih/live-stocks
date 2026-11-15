#!/usr/bin/env node
/** Reviewable SQL-package preparation / read-only preflight. NEVER applies SQL.
 * No .env loading, automatic token refresh, or production write mode.
 */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseEnvironment, safeBackupDirectory } from './prepare-account-migration.mjs';
import { adoptionGuardSql, removeVerifiedAuthPrefix, verifyOwnerConfirmation, confirmationRowsSql, recordAdoptionSql } from './owner-store-adoption.mjs';

export const TARGET_PROJECT = 'osvwctooasdxsztatirz';
export const MIGRATION_NAME = '20261114114916_auth0_user_isolation.sql';
export const MIGRATION_SHA256 = '92f2a3c6bd5255029232576c2c147ced84dbc0fa3c527c6c4df6703e5f32dffc';
export const MIGRATIONS = Object.freeze([
  { name: MIGRATION_NAME, sha256: MIGRATION_SHA256 },
  { name: '20261114145729_canonical_profiles_and_lossless_merge.sql', sha256: '057446814d430582fefea215129d27b28efa88531c2b0648f86723bf0837c501' },
  { name: '20261114151506_better_auth_private_sessions.sql', sha256: 'bec5796f998d5ba541ce6333319bb0b2544975bc3eb66115d652b8487cf6935e' },
  { name: '20261115094000_sign_in_method_operations.sql', sha256: '9242a3e784b92146b3ac737d6bfe2ecbf707bcb52cba6d7fbbdc4669f4c14a11' },
]);
export const BUNDLE_SHA256 = createHash('sha256').update(JSON.stringify(MIGRATIONS)).digest('hex');

export const TABLES = ['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'];
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Local bundle proof is necessary, never sufficient: real owner provisioning,
// hosted role/JWKS/RLS gates and deployment closure must also be reviewed.
export const CUTOVER_READY = false;
const roleList='public, anon, authenticated, service_role';
const tableList=TABLES.map(name=>`public.${name}`).join(', ');
function check(condition,message){if(!condition)throw new Error(message);}
function literal(value){return `'${String(value).replaceAll("'","''")}'`;}
function ownerCheck(manifest){check(typeof manifest.ownerSubject==='string'&&manifest.ownerSubject.length>0&&manifest.ownerSubject.length<=255,'Invalid confirmed owner');}
export function validateMigration(source){check(createHash('sha256').update(source).digest('hex')===MIGRATION_SHA256,'Isolation migration source changed');}
export function validateBundle(bundle){
  check(Array.isArray(bundle)&&bundle.length===MIGRATIONS.length,'All four reviewed migrations are required');
  bundle.forEach((entry,index)=>{
    const expected=MIGRATIONS[index];
    check(entry.name===expected.name&&typeof entry.source==='string'&&createHash('sha256').update(entry.source).digest('hex')===expected.sha256,'Migration bundle order or exact source hash changed');
    check((entry.source.match(/^begin;$/gm)??[]).length===1&&(entry.source.match(/^commit;$/gm)??[]).length===1&&/commit;\s*$/.test(entry.source),'Unexpected migration transaction boundary');
  });
  return bundle;
}
export async function readMigrationBundle(){return validateBundle(await Promise.all(MIGRATIONS.map(async entry=>({...entry,source:await readFile(join(root,'supabase/migrations',entry.name),'utf8')}))));}
const legacyParameterNames=['app.auth0_issuer','app.auth0_website_client_id','app.auth0_mcp_client_id','app.auth0_website_audience','app.auth0_mcp_audience','app.legacy_owner_subject','app.legacy_finnhub_encrypted'];
// Parse data from the old protected parameter artifact; never splice executable
// input SQL into the guarded transaction. Reject extra statements/settings.
export function parseLegacyParameters(source){
  const lines=source.split('\n').map(line=>line.trim()).filter(line=>line&&!line.startsWith('--'));
  check(lines.shift()==='set standard_conforming_strings = on;','Invalid protected parameter artifact');
  const opening=/^do (\$migration_parameters_[0-9a-f]{32}\$)$/.exec(lines.shift()??'');
  check(opening&&lines.shift()==='begin'&&lines.pop()===opening[1]+';'&&lines.pop()==='end;','Invalid parameter block');
  const values={};
  for(const line of lines){
    const match=/^perform pg_catalog\.set_config\('((?:[^']|'')*)', '((?:[^']|'')*)', false\);$/.exec(line);
    check(match,'Only generated settings are allowed');
    const name=match[1].replaceAll("''", "'");
    check(legacyParameterNames.includes(name)&&!Object.hasOwn(values,name),'Unexpected or duplicate parameter');
    values[name]=match[2].replaceAll("''", "'");
  }
  check(Object.keys(values).length===legacyParameterNames.length,'Incomplete legacy parameters');
  return values;
}
export function validatedBinding(manifest,binding,{readOnlyPreflight=false}={}){
  ownerCheck(manifest);
  check(binding&&['LOCAL_REHEARSAL','VERIFIED_OWNER'].includes(binding.kind),'Explicit owner-binding scope required');
  if(binding.kind!=='LOCAL_REHEARSAL'&&!readOnlyPreflight)check(CUTOVER_READY,'Production binding remains blocked pending real owner and hosted gates');
  check(binding.legacyOwnerSubject===manifest.ownerSubject,'Binding changes the confirmed canonical owner');
  check(typeof binding.subject==='string'&&binding.subject.length>0&&binding.subject.length<=255&&binding.subject.trim()===binding.subject,'Exact proved new owner subject required');
  const origin=new URL(binding.origin);
  check(origin.protocol==='https:'&&origin.origin===binding.origin&&!origin.username&&!origin.password,'Canonical HTTPS origin required');
  check(binding.kind==='LOCAL_REHEARSAL'?origin.hostname.endsWith('.invalid'):origin.origin==='https://razmaz-live-stocks.vercel.app','Binding origin is not the reviewed target');
  for(const id of [binding.websiteClientId,binding.mcpClientId])check(typeof id==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(id),'Invalid approved client');
  check(binding.websiteClientId!==binding.mcpClientId,'Clients must be distinct');
  return {'app.better_auth_issuer':`${origin.origin}/api/auth`,'app.better_auth_website_client_id':binding.websiteClientId,
    'app.better_auth_mcp_client_id':binding.mcpClientId,'app.better_auth_website_audience':`${origin.origin}/api/web`,
    'app.better_auth_mcp_audience':`${origin.origin}/api/mcp`,'app.better_auth_legacy_owner_subject':binding.subject};
}
// Local-purpose confirmation proves control of the stable user in the final
// store; it is never an API bearer or a replacement for final database checks.
export async function verifyProductionBinding(manifest,artifact,legacyOwner,config=process.env,{readOnlyPreflight=false}={}){
  const ownerConfirmation=await verifyOwnerConfirmation(artifact,legacyOwner,config.BETTER_AUTH_SECRET);
  const binding={kind:'VERIFIED_OWNER',legacyOwnerSubject:manifest.ownerSubject,subject:ownerConfirmation.userId,
    origin:config.APP_BASE_URL,websiteClientId:config.BETTER_AUTH_WEBSITE_CLIENT_ID,mcpClientId:config.BETTER_AUTH_MCP_CLIENT_ID,
    adoptAuthStore:true,ownerConfirmation};
  validatedBinding(manifest,binding,{readOnlyPreflight});
  return binding;
}
function transactionParameters(values){
  let tag;do{tag=`$cutover_settings_${randomBytes(16).toString('hex')}$`;}while(Object.values(values).some(value=>value.includes(tag)));
  return `do ${tag} begin\n${Object.entries(values).map(([name,value])=>`perform pg_catalog.set_config(${literal(name)},${literal(value)},true);`).join('\n')}\nend;${tag};`;
}
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
 values(true,${literal(TARGET_PROJECT)},${literal(manifest.ownerSubject)},${literal(BUNDLE_SHA256)},clock_timestamp());
commit;
-- The freeze above stays committed if draining or any later operation fails.
${drainSql(manifest)}`;}

export function drainSql(manifest){ownerCheck(manifest);return `begin read write;
set local statement_timeout='60s';
do $$begin if not exists(select 1 from private.account_cutover_state where singleton and project_ref=${literal(TARGET_PROJECT)}
 and owner_subject=${literal(manifest.ownerSubject)} and migration_sha256=${literal(BUNDLE_SHA256)} and migrated_at is null)
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
  execute format('select count(*),md5(coalesce(string_agg(md5((${transformed?"to_jsonb(r)-array[''user_id'',''consolidated_into_position_id'',''is_active'']":"to_jsonb(r)"})::text),'''' order by id),'''')) from public.%I r',expected.table_name) into actual_count,actual_digest;
  if actual_count<>expected.row_count or actual_digest<>expected.digest then raise exception 'Final snapshot mismatch: %',expected.table_name;end if;
  ${transformed?`execute format('select count(*) from public.%I where user_id is distinct from $1',expected.table_name) into incorrect_owner using ${literal(manifest.ownerSubject)};
  if incorrect_owner<>0 then raise exception 'Owner mismatch: %',expected.table_name;end if;`:''}
 end loop;
end;
$compare$;`;
}

export function migrationSql(manifest,parameters,bundle,binding){
  validateBundle(bundle);const values=parseLegacyParameters(parameters);
  check(values['app.legacy_owner_subject']===manifest.ownerSubject,'Parameter owner differs from confirmed backup owner');
  Object.assign(values,validatedBinding(manifest,binding));
  check(binding.adoptAuthStore===true&&binding.ownerConfirmation?.userId===binding.subject&&binding.ownerConfirmation?.legacyOwnerSubject===manifest.ownerSubject,'Exact preprovisioned owner confirmation required');
  const authSource=bundle[2].source;
  const bodies=bundle.map((entry,index)=>`-- Reviewed source: ${entry.name}\n${(index===2?removeVerifiedAuthPrefix(entry.source):entry.source).replace(/^begin;\r?\n/m,'').replace(/\bcommit;\s*$/i,'')}`).join('\n');
  const versions=MIGRATIONS.map(entry=>entry.name.split('_')[0]);
  const history=bundle.map(entry=>`insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(entry.name.split('_')[0])},${literal(entry.name.slice(15,-4))},array[${literal(entry.source)}]);`).join('\n');
  return `-- ${binding.kind}: exact target ${TARGET_PROJECT}; bundle SHA256 ${BUNDLE_SHA256}.
-- Freeze remains committed on failure. All four migrations/history commit together.
set standard_conforming_strings=on;
begin read write;
set local timezone='UTC';
set local lock_timeout='30s';
set local statement_timeout='120s';
${binding.kind==='LOCAL_REHEARSAL'?"do $$begin if inet_server_addr() is null or inet_server_addr() not in ('127.0.0.1'::inet,'::1'::inet) then raise exception 'Synthetic binding is local-rehearsal only';end if;end$$;":''}
select pg_catalog.pg_advisory_xact_lock(73412311661001);
lock table ${tableList} in access exclusive mode;
do $guard$
begin
 if not exists(select 1 from private.account_cutover_state where singleton
   and project_ref=${literal(TARGET_PROJECT)} and owner_subject=${literal(manifest.ownerSubject)}
   and migration_sha256=${literal(BUNDLE_SHA256)} and migrated_at is null
   and drained_at is not null and drained_at<=${literal(manifest.generatedAt)}::timestamptz) then
  raise exception 'Require committed freeze, completed drain and a subsequent final backup';
 end if;
 if to_regclass('supabase_migrations.schema_migrations') is null then raise exception 'Migration history unavailable';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version in(${versions.map(literal).join(',')})) then raise exception 'Bundle migration already recorded';end if;
 if to_regclass('public.user_profiles') is not null or to_regnamespace('livestocks_auth') is null or to_regclass('private.owner_store_provision') is null then raise exception 'Expected pristine financial schema and preprovisioned auth store';end if;
end;
$guard$;
${frozenAssertions()}
${comparisonSql(manifest)}
${adoptionGuardSql(authSource)}
${confirmationRowsSql(binding.ownerConfirmation)}
${transactionParameters(values)}
${bodies}
${binding.kind==='VERIFIED_OWNER'?`do $$begin if not exists(select 1 from livestocks_auth."user" where id=${literal(binding.subject)} and "emailVerified") then raise exception 'Proved owner must be provisioned in the final auth store before activation';end if;end$$;`:''}
${comparisonSql(manifest,true)}
do $identity_assert$ begin
 if not exists(select 1 from public.user_profiles where id=${literal(manifest.ownerSubject)} and primary_pinned and merge_state='active') then raise exception 'Confirmed canonical profile changed';end if;
 if not exists(select 1 from private.identity_profiles where issuer=${literal(values['app.better_auth_issuer'])} and subject=${literal(binding.subject)} and profile_id=${literal(manifest.ownerSubject)} and state='active') then raise exception 'Explicit owner alias was not preserved';end if;
 if not exists(select 1 from private.auth_config where singleton and auth_provider='better_auth' and issuer=${literal(values['app.better_auth_issuer'])} and website_client_id=${literal(binding.websiteClientId)} and mcp_client_id=${literal(binding.mcpClientId)} and website_audience=${literal(values['app.better_auth_website_audience'])} and mcp_audience=${literal(values['app.better_auth_mcp_audience'])}) then raise exception 'Provider configuration mismatch';end if;
end;$identity_assert$;
-- Service financial access stays SELECT-only. Secrets remain private.
grant select on table ${tableList} to service_role;
${history}
${confirmationRowsSql(binding.ownerConfirmation)}
${recordAdoptionSql(binding.ownerConfirmation)}
update private.account_cutover_state set migrated_at=clock_timestamp() where singleton;
commit;
notify pgrst,'reload schema';
`;}

async function privateFile(path){check(isAbsolute(path),'Private file path must be absolute');const s=await lstat(path);check(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o077)===0,'Private files must be owned, regular and mode0600');return readFile(path,'utf8');}
async function artifact(directory){
  const path=await safeBackupDirectory(directory);const s=await lstat(path);check(s.uid===process.getuid()&&(s.mode&0o077)===0,'Backup directory must be private');
  const manifest=JSON.parse(await privateFile(join(path,'manifest.json')));const proof=JSON.parse(await privateFile(join(path,'restore-report.json')));
  check(manifest.status==='PREPARED_RESTORE_TEST_REQUIRED'&&proof.status==='PASS'&&proof.restoreTested===true&&proof.cleanup==='COMPLETE'
    &&proof.ciphertextSha256===manifest.archive?.ciphertextSha256&&proof.migration?.bundleSha256===BUNDLE_SHA256
    &&proof.migration.rollbackVerified&&proof.migration.financialDataPreserved&&proof.migration.ownerVerified&&proof.migration.encryptedCredentialVerified,'Require the matching successful restore and migration proof');
  check(proof.tooling?.cutoverGeneratorSha256===createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex')
    &&proof.tooling?.ownerStoreToolSha256===createHash('sha256').update(await readFile(new URL('./owner-store-adoption.mjs',import.meta.url))).digest('hex')
    &&proof.tooling?.restoreToolSha256===createHash('sha256').update(await readFile(new URL('./restore-account-backup.mjs',import.meta.url))).digest('hex'),'Restore proof used different cutover tooling');
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
  if(process.argv.includes('--help')){console.log('Preparation only: node scripts/cutover-personal-accounts.mjs --prepare|--check --project osvwctooasdxsztatirz --backup-directory /private/verified-backup --owner-file /private/confirmed-owner.json [--output-directory /private/existing-directory --binding-file /private/verified-new-owner.json]\n--check requires explicit MIGRATION_DATABASE_URL, MIGRATION_SSL_ROOT_CERT, canonical Better Auth config and --binding-file with the fresh final-store confirmation. It checks the receipt and exact live store read-only; no legacy Auth0 token or refresh is required. No .env loading, refresh token consumption or write mode. --prepare remains blocked by CUTOVER_READY; once approved it also requires the exact fresh final-store owner confirmation and provisioning proof. It never applies SQL.');return;}
  const args=process.argv.slice(2);const mode=args.shift();check(['--check','--prepare'].includes(mode),'Select --check or --prepare');const opts={};
  while(args.length){const name=args.shift();const value=args.shift();check(['--project','--backup-directory','--owner-file','--output-directory','--binding-file'].includes(name)&&value&&!opts[name],'Invalid or duplicate argument');opts[name]=value;}
  check(opts['--project']===TARGET_PROJECT,'Exact production project confirmation required');
  const {manifest,parameters}=await artifact(opts['--backup-directory']);const owner=JSON.parse(await privateFile(opts['--owner-file']));
  check(owner.userId===manifest.ownerSubject&&owner.emailVerified===true&&Number.isFinite(Date.parse(owner.confirmedAt)),'Owner differs from the explicitly confirmed backup owner');
  const bundle=await readMigrationBundle();
  if(mode==='--prepare'){
    if (!CUTOVER_READY) {
      console.error('Production package blocked: rehearse the complete canonical-profile migration and pass the on-site authentication/refresh-revocation gates first.');
      throw new Error('Cutover is not ready');
    }
    const binding=await verifyProductionBinding(manifest,JSON.parse(await privateFile(opts['--binding-file'])),owner);
    const output=await safeBackupDirectory(opts['--output-directory']);const s=await lstat(output);check(s.uid===process.getuid()&&(s.mode&0o077)===0,'Output directory must be private');
    await writeFile(join(output,'01-freeze-and-drain.sql'),freezeSql(manifest),{mode:0o600,flag:'wx'});
    await writeFile(join(output,'01b-retry-drain-only.sql'),drainSql(manifest),{mode:0o600,flag:'wx'});
    await writeFile(join(output,'02-compare-and-migrate.sql'),migrationSql(manifest,parameters,bundle,binding),{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({status:'PREPARED_NOT_AUTHORIZED_TO_APPLY',project:TARGET_PROJECT,migrationBundleSha256:BUNDLE_SHA256,requiresFreshOwnerCheck:true,requiresPostFreezeBackup:true}));return;
  }
  const binding=await verifyProductionBinding(manifest,JSON.parse(await privateFile(opts['--binding-file'])),owner,process.env,{readOnlyPreflight:true});
  const env=await checkedProductionEnvironment(process.env.MIGRATION_DATABASE_URL,process.env.MIGRATION_SSL_ROOT_CERT);
  const query=`begin isolation level repeatable read read only;set local timezone='UTC';set local search_path='';
    ${adoptionGuardSql(bundle[2].source,{readOnly:true})}
    ${confirmationRowsSql(binding.ownerConfirmation)}
    select jsonb_build_object('database',current_database(),'legacySchema',to_regclass('public.user_profiles') is null,'cutoverMarkerExists',to_regclass('private.account_cutover_state') is not null,'finalOwnerStoreVerified',true);rollback;`;
  let result;try{result=execFileSync('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{env,input:query,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20_000}).trim();}catch{throw new Error('Read-only database preflight failed; sensitive diagnostics suppressed');}
  console.log(JSON.stringify({status:'READ_ONLY_CHECK_PASSED',project:TARGET_PROJECT,ownerConfirmationCryptographicallyVerified:true,legacyOwnerPinned:true,migrationBundleSha256:BUNDLE_SHA256,database:JSON.parse(result),writesPerformed:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Cutover preparation/check failed; no SQL was applied. Review inputs and gates.');process.exitCode=1;});
