// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {SignJWT} from 'jose';
import {randomUUID} from 'node:crypto';
import {readMigrationBundle} from '../scripts/cutover-personal-accounts.mjs';
import {authPrefix,preprovisionAuthSql,removeVerifiedAuthPrefix,adoptionGuardSql,verifyOwnerConfirmation,confirmationRowsSql,CONFIRMATION_ISSUER,CONFIRMATION_AUDIENCE} from '../scripts/owner-store-adoption.mjs';
const secret='synthetic-secret-that-is-long-enough-for-local-test';
const legacy={userId:'auth0|original-owner',email:'owner@example.invalid',emailVerified:true};
async function fixture(changes={},artifactChanges={}){
 const now=Math.floor(Date.now()/1000),runId=randomUUID(),confirmedAt=new Date(now*1000).toISOString();
 const claims={purpose:'confirmed',runId,sid:'live-session',email:legacy.email,email_verified:true,legacy_subject:legacy.userId,auth_session_created_at:now-10,confirmed_at:confirmedAt,...changes};
 const token=await new SignJWT(claims).setProtectedHeader({alg:'HS256'}).setSubject('new-owner').setIssuer(CONFIRMATION_ISSUER).setAudience(CONFIRMATION_AUDIENCE).setJti(runId).setIssuedAt(now).setExpirationTime(now+900).sign(new TextEncoder().encode(secret));
 return {proofType:'better_auth_final_store_confirmation',userId:'new-owner',email:legacy.email,emailVerified:true,confirmedAt,authSessionId:'live-session',authSessionCreatedAt:now-10,confirmationRunId:runId,confirmationReceipt:token,confirmationIssuer:CONFIRMATION_ISSUER,legacyOwnerSubject:legacy.userId,finalAuthStoreProject:'osvwctooasdxsztatirz',...artifactChanges};
}
describe('auth-store-only preprovision and exact adoption',()=>{
 it('extracts only the reviewed auth DDL and ACL prefix',async()=>{
  const source=(await readMigrationBundle())[2].source,prefix=authPrefix(source);
  expect(prefix.match(/create table /g)).toHaveLength(13);
  expect(prefix).not.toContain('alter table private.auth_config');
  expect(removeVerifiedAuthPrefix(source)).not.toContain('create schema livestocks_auth;');
  expect(removeVerifiedAuthPrefix(source)).toContain('alter table private.auth_config');
  expect(()=>authPrefix(source+' ')).toThrow('reviewed');
 });
 it('never blindly adopts an existing schema or grants financial privileges',async()=>{
  const source=(await readMigrationBundle())[2].source,sql=preprovisionAuthSql(source,{backendPassword:'synthetic-password-at-least-24-characters'});
  expect(sql).toContain('Unexpected pre-existing auth store or role');
  expect(sql).not.toContain('create schema if not exists livestocks_auth');
  expect(sql).not.toMatch(/(?:grant|revoke|alter|update|insert|delete)[^;]*public\.positions/i);
  expect(sql).toContain('Auth backend inherits legacy definer execution');
  expect(sql).toContain('catalog_snapshot');
  expect(sql).not.toContain('rolpassword');
 });
 it('locks and fingerprints the exact store for adoption but supports read-only preflight',async()=>{
  const source=(await readMigrationBundle())[2].source;
  expect(adoptionGuardSql(source)).toContain('in share row exclusive mode');
  expect(adoptionGuardSql(source)).toContain('Owner store structure or permissions changed');
  expect(adoptionGuardSql(source,{readOnly:true})).not.toContain('lock table');
  expect(adoptionGuardSql(source,{readOnly:true})).not.toContain('for update');
 });
});
describe('fresh final-store owner confirmation',()=>{
 it('verifies the purpose-specific receipt and emits only fields needed for DB validation',async()=>{
  const artifact=await fixture(),proof=await verifyOwnerConfirmation(artifact,legacy,secret);
  expect(proof.userId).toBe('new-owner');expect(proof.legacyOwnerSubject).toBe(legacy.userId);
  const sql=confirmationRowsSql(proof);expect(sql).toContain(proof.receiptSha256);expect(sql).not.toContain(artifact.confirmationReceipt);
  expect(sql).toContain("a.\"providerId\"='google'");expect(sql).toContain('s."expiresAt">clock_timestamp()');
 });
 it.each([{purpose:'review'},{legacy_subject:'someone-else'},{email:'different@example.invalid'},{email_verified:false},{auth_session_created_at:1}])('rejects mismatched or stale signed claims %j',async changes=>{
  await expect(verifyOwnerConfirmation(await fixture(changes),legacy,secret)).rejects.toThrow();
 });
 it.each([{userId:'someone-else'},{authSessionId:'other-session'},{finalAuthStoreProject:'other-project'},{confirmationIssuer:'https://wrong.invalid/api/auth'}])('rejects modified exported fields %j',async changes=>{
  await expect(verifyOwnerConfirmation(await fixture({},changes),legacy,secret)).rejects.toThrow();
 });
 it('rejects a forged signature',async()=>{
  await expect(verifyOwnerConfirmation(await fixture(),legacy,secret+'wrong')).rejects.toThrow();
 });
});
