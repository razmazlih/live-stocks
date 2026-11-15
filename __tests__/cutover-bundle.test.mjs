// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parametersFile } from '../scripts/prepare-account-migration.mjs';
import { CUTOVER_READY, BUNDLE_SHA256, MIGRATIONS, readMigrationBundle, validateBundle, parseLegacyParameters, validatedBinding, migrationSql, comparisonSql, freezeSql } from '../scripts/cutover-personal-accounts.mjs';
const names=['positions','position_lots','position_plans','settings','watchlist_groups','watchlist_tickers'];
const manifest={ownerSubject:'auth0|confirmed-old-owner',generatedAt:'2026-11-15T12:00:00Z',tables:Object.fromEntries(names.map(name=>[name,{rowCount:1,originalDigest:'a'.repeat(32),migrationDigest:'b'.repeat(32)}]))};
const values={'app.auth0_issuer':'https://old.invalid/','app.auth0_website_client_id':'old-website','app.auth0_mcp_client_id':'old-mcp','app.auth0_website_audience':'https://old.invalid/api/web','app.auth0_mcp_audience':'https://old.invalid/api/mcp','app.legacy_owner_subject':manifest.ownerSubject,'app.legacy_finnhub_encrypted':'v1.synthetic.encrypted.envelope'};
const binding={adoptAuthStore:true,ownerConfirmation:{userId:'synthetic-new-owner',sessionId:'synthetic-session',sessionCreatedAt:1000,runId:'00000000-0000-4000-8000-000000000000',confirmedAt:'2026-11-15T12:00:00Z',expiresAt:2000000000,email:'owner@example.invalid',legacyOwnerSubject:manifest.ownerSubject,receiptSha256:'c'.repeat(64)},kind:'LOCAL_REHEARSAL',legacyOwnerSubject:manifest.ownerSubject,subject:'synthetic-new-owner',origin:'https://rehearsal.invalid',websiteClientId:'rehearsal-web',mcpClientId:'rehearsal-mcp'};
describe('complete guarded account cutover bundle',()=>{
 it('pins all four exact migration sources and their order',async()=>{
  const bundle=await readMigrationBundle();expect(bundle.map(entry=>entry.name)).toEqual(MIGRATIONS.map(entry=>entry.name));
  expect(()=>validateBundle([...bundle].reverse())).toThrow('order');
  expect(()=>validateBundle(bundle.slice(0,1))).toThrow('All four');
  expect(()=>validateBundle(bundle.map((entry,index)=>index===1?{...entry,source:entry.source+'\n'}:entry))).toThrow('hash');
 });
 it('treats the original protected parameters as data, not executable SQL',()=>{
  const source=parametersFile(values);expect(parseLegacyParameters(source)).toEqual(values);
  expect(()=>parseLegacyParameters(source+'commit;\n')).toThrow();
  expect(()=>parseLegacyParameters(parametersFile({...values,'app.unreviewed':'true'}))).toThrow();
  expect(()=>parseLegacyParameters(source.replace("perform pg_catalog.set_config",'perform malicious_function'))).toThrow();
 });
 it('keeps SQL-string escaping intact while parsing generated values',()=>{
  const changed={...values,'app.legacy_finnhub_encrypted':"v1.value'; select 1; --"};
  expect(parseLegacyParameters(parametersFile(changed))).toEqual(changed);
 });
 it('does not unlock production based on a local synthetic proof',()=>{
  expect(CUTOVER_READY).toBe(false);
  expect(()=>validatedBinding(manifest,{...binding,kind:'VERIFIED_OWNER',origin:'https://razmaz-live-stocks.vercel.app'})).toThrow('blocked');
  expect(()=>validatedBinding(manifest,{...binding,origin:'https://razmaz-live-stocks.vercel.app'})).toThrow('target');
 });
 it('rejects owner substitution and incomplete provider configuration',()=>{
  expect(()=>validatedBinding(manifest,{...binding,legacyOwnerSubject:'wrong'})).toThrow('canonical owner');
  expect(()=>validatedBinding(manifest,{...binding,mcpClientId:undefined})).toThrow('client');
  expect(()=>validatedBinding(manifest,{...binding,mcpClientId:binding.websiteClientId})).toThrow('distinct');
 });
 it('binds freeze/drain markers to the entire reviewed bundle',()=>{
  const sql=freezeSql(manifest);expect(sql).toContain(BUNDLE_SHA256);expect(sql).toContain('access exclusive mode');
  expect(sql).toContain('pg_terminate_backend');expect(sql).toContain('revoke execute on all functions');
 });
 it('assembles complete schema, history and explicit owner alias checks behind local/freeze guards',async()=>{
  const sql=migrationSql(manifest,parametersFile(values),await readMigrationBundle(),binding);
  expect(sql).toContain('Synthetic binding is local-rehearsal only');
  expect(sql).toContain('Require committed freeze, completed drain and a subsequent final backup');
  expect(sql).toContain('Explicit owner alias was not preserved');
  expect(sql).toContain('Provider configuration mismatch');
  expect(sql).toContain("set local createrole_self_grant='set';");
  expect(sql.indexOf("set local createrole_self_grant='set';")).toBeLessThan(sql.indexOf('create role livestocks_merge_executor'));
  expect(sql).toContain('Unsafe auth backend membership options');
  for(const migration of MIGRATIONS)expect(sql).toContain(`Reviewed source: ${migration.name}`);
  expect(sql.match(/insert into supabase_migrations.schema_migrations/g)).toHaveLength(4);
  expect(sql).toContain("'app.better_auth_legacy_owner_subject','synthetic-new-owner',true");
  expect(sql.trimEnd()).toMatch(/commit;\nnotify pgrst,'reload schema';$/);
 });
 it('compares full financial business data while excluding only added ownership/merge metadata',()=>{
  const sql=comparisonSql(manifest,true);
  expect(sql).toContain("array[''user_id'',''consolidated_into_position_id'',''is_active'']");
  expect(sql).toContain('Owner mismatch');
  expect(()=>comparisonSql({...manifest,tables:{}},true)).toThrow('six-table');
 });
 it('refuses changing the backup owner through the protected parameter artifact',async()=>{
  const bundle=await readMigrationBundle();
  expect(()=>migrationSql(manifest,parametersFile({...values,'app.legacy_owner_subject':'someone-else'}),bundle,binding)).toThrow('owner');
 });
});
