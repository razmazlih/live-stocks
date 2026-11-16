#!/usr/bin/env node
/** Read-only final-store owner proof export. Never imports users or transfers portfolios. */
import { lstat, readFile, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { jwtVerify } from 'jose';
import { Pool } from 'pg';

const ISSUER = 'http://localhost:3109/api/auth';
const AUDIENCE = 'livestocks:legacy-owner-confirmation:v1';
const SECRET_DIRECTORY = '/Users/razmaz/.codex/secrets/livestocks/';
const PROJECT = 'osvwctooasdxsztatirz';
function check(value) { if (!value) throw new Error('Owner proof verification failed'); }
async function privateFile(path) {
  check(typeof path === 'string' && resolve(path).startsWith(SECRET_DIRECTORY));
  const info = await lstat(path);
  check(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid() && (info.mode & 0o077) === 0);
  return JSON.parse(await readFile(path, 'utf8'));
}
async function main() {
  const args = process.argv.slice(2), options = {};
  check(args.length === 8);
  for (let i = 0; i < args.length; i += 2) {
    check(['--env-file','--legacy-owner-file','--run-id','--output'].includes(args[i]) && !options[args[i]]);
    options[args[i]] = args[i + 1];
  }
  const config = await privateFile(options['--env-file']);
  const legacy = await privateFile(options['--legacy-owner-file']);
  const runId = options['--run-id'];
  check(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(runId));
  check(legacy.emailVerified === true && typeof legacy.userId === 'string' && Number.isFinite(Date.parse(legacy.confirmedAt)));
  check(typeof config.BETTER_AUTH_SECRET === 'string' && config.BETTER_AUTH_SECRET.length >= 32);
  const url = new URL(config.BETTER_AUTH_DATABASE_URL);
  check(url.hostname === 'aws-1-us-east-1.pooler.supabase.com' && url.port === '5432' && url.pathname === '/postgres'
    && decodeURIComponent(url.username) === `livestocks_auth_backend.${PROJECT}` && !url.searchParams.has('options'));
  for (const key of ['sslmode','sslkey','sslcert','sslrootcert']) url.searchParams.delete(key);
  const pool = new Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 15_000,
    ssl: { rejectUnauthorized: true, ca: config.BETTER_AUTH_DATABASE_CA }, options: '-c search_path=livestocks_auth -c statement_timeout=15000' });
  try {
    const connection = await pool.connect();
    let data;
    try {
      await connection.query('begin read only');
      const result = await connection.query(`select v.value receipt from livestocks_auth.verification v
        where v.id=$1 and v.identifier=$2 and v."expiresAt">now()`,
      [runId, `livestocks:owner-confirmation:${runId}`]);
      check(result.rows.length > 0);
      // A verified signature selects the exact user/session; an email never selects ownership.
      const { payload } = await jwtVerify(result.rows[0].receipt, new TextEncoder().encode(config.BETTER_AUTH_SECRET), {
        algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE,
        requiredClaims: ['sub','jti','iat','exp','sid','email','email_verified','legacy_subject','auth_session_created_at','confirmed_at','purpose','runId'],
      });
      check(payload.purpose === 'confirmed' && payload.runId === runId && payload.jti === runId && payload.email_verified === true
        && payload.legacy_subject === legacy.userId && payload.email === String(legacy.email).toLowerCase()
        && Number.isSafeInteger(payload.iat) && payload.iat >= Math.floor(Date.now() / 1000) - 900 && payload.iat <= Math.floor(Date.now() / 1000) + 5
        && Number.isSafeInteger(payload.auth_session_created_at) && payload.auth_session_created_at <= payload.iat
        && Number.isFinite(Date.parse(payload.confirmed_at)));
      const identity = await connection.query(`select u.id,u.email,u.name,s.id session_id,
        floor(extract(epoch from s."createdAt"))::bigint session_created from livestocks_auth."user" u
        join livestocks_auth."session" s on s."userId"=u.id where u.id=$1 and s.id=$2
        and u."emailVerified" and s."expiresAt">now() and exists(select 1 from livestocks_auth.account a where a."userId"=u.id and a."providerId"='google')`,
      [payload.sub, payload.sid]);
      const row = identity.rows.find(row => row.id === payload.sub && row.session_id === payload.sid
        && Number(row.session_created) === payload.auth_session_created_at && row.email.toLowerCase() === payload.email);
      check(row);
      data = { proofType: 'better_auth_final_store_confirmation', userId: row.id, email: row.email, name: row.name,
        emailVerified: true, confirmedAt: payload.confirmed_at, authSessionId: row.session_id,
        authSessionCreatedAt: Number(row.session_created), confirmationRunId: runId, confirmationReceipt: result.rows[0].receipt,
        confirmationIssuer: ISSUER, legacyOwnerSubject: legacy.userId, finalAuthStoreProject: PROJECT };
      await connection.query('rollback');
    } catch (error) { await connection.query('rollback'); throw error; }
    finally { connection.release(); }
    const output = resolve(options['--output']);
    check(output.startsWith(SECRET_DIRECTORY));
    const directory = await lstat(dirname(output));
    check(directory.isDirectory() && !directory.isSymbolicLink() && directory.uid === process.getuid() && (directory.mode & 0o077) === 0);
    const file = await open(output, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(data)); } finally { await file.close(); }
    process.stdout.write(JSON.stringify({ status: 'OWNER_CONFIRMED', finalStoreVerified: true, financialWrites: false }) + '\n');
  } finally { await pool.end(); }
}
main().catch(() => { process.stderr.write('Owner confirmation export failed; no portfolio changes performed and sensitive diagnostics suppressed.\n'); process.exitCode = 1; });
