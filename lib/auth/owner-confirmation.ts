import 'server-only';
import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { betterAuthConfiguration, getAuthDatabasePool, getBetterAuthSession } from './better-auth';

export const OWNER_CONFIRMATION_AUDIENCE = 'livestocks:legacy-owner-confirmation:v1';
export class OwnerConfirmationError extends Error {
  constructor(public status: number) { super('Owner confirmation is unavailable'); }
}

/** This temporary confirmation surface can never be enabled in a production deployment. */
export function ownerConfirmationConfiguration() {
  const runId = process.env.OWNER_CONFIRMATION_RUN_ID;
  const email = process.env.OWNER_CONFIRMATION_EMAIL;
  const legacySubject = process.env.OWNER_CONFIRMATION_LEGACY_SUBJECT;
  if (process.env.NODE_ENV === 'production' || !runId || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(runId)
    || !email || !/^[^\s@]+@[^\s@]+$/.test(email) || !legacySubject || legacySubject.length > 255) {
    throw new OwnerConfirmationError(404);
  }
  const config = betterAuthConfiguration();
  if (!['http://localhost:3109', 'http://127.0.0.1:3109'].includes(config.origin)) throw new OwnerConfirmationError(404);
  return { ...config, runId, email: email.toLowerCase(), legacySubject };
}

async function ownerSession(headers: Headers) {
  const config = ownerConfirmationConfiguration();
  const session = await getBetterAuthSession(headers);
  const createdAt = session ? Math.floor(new Date(session.session.createdAt).getTime() / 1000) : 0;
  const now = Math.floor(Date.now() / 1000);
  if (!session?.user?.emailVerified || session.user.email.toLowerCase() !== config.email
    || new Date(session.session.expiresAt).getTime() <= Date.now()
    || !Number.isSafeInteger(createdAt) || createdAt <= now - 15 * 60 || createdAt > now + 5) {
    throw new OwnerConfirmationError(403);
  }
  const { rows } = await getAuthDatabasePool().query(
    'select 1 from livestocks_auth.account where "userId"=$1 and "providerId"=\'google\' limit 1', [session.user.id]);
  if (rows.length !== 1) throw new OwnerConfirmationError(403);
  return { config, session, createdAt };
}

export async function ownerConfirmationView(headers: Headers) {
  const { config, session } = await ownerSession(headers);
  const token = await new SignJWT({ sid: session.session.id, runId: config.runId, purpose: 'review' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(session.user.id).setIssuer(config.issuer)
    .setAudience(OWNER_CONFIRMATION_AUDIENCE).setJti(randomUUID()).setIssuedAt().setExpirationTime('5m')
    .sign(new TextEncoder().encode(config.secret));
  return { account: { id: session.user.id, email: session.user.email }, token };
}

/** Saves the user's explicit choice; it never queries or changes financial tables. */
export async function confirmOwner(headers: Headers, reviewToken: string) {
  const { config, session, createdAt } = await ownerSession(headers);
  let review;
  try { ({ payload: review } = await jwtVerify(reviewToken, new TextEncoder().encode(config.secret), {
    algorithms: ['HS256'], issuer: config.issuer, audience: OWNER_CONFIRMATION_AUDIENCE,
  })); } catch { throw new OwnerConfirmationError(403); }
  if (review.sub !== session.user.id || review.sid !== session.session.id || review.runId !== config.runId || review.purpose !== 'review') {
    throw new OwnerConfirmationError(403);
  }
  const confirmedAt = new Date().toISOString();
  const receipt = await new SignJWT({ purpose: 'confirmed', runId: config.runId, sid: session.session.id,
    email: session.user.email.toLowerCase(), email_verified: true, legacy_subject: config.legacySubject,
    auth_session_created_at: createdAt, confirmed_at: confirmedAt })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(session.user.id).setIssuer(config.issuer)
    .setAudience(OWNER_CONFIRMATION_AUDIENCE).setJti(config.runId).setIssuedAt().setExpirationTime('15m')
    .sign(new TextEncoder().encode(config.secret));
  const pool = getAuthDatabasePool();
  const connection = await pool.connect();
  try {
    await connection.query('begin');
    const live = await connection.query('select 1 from livestocks_auth."session" s join livestocks_auth."user" u on u.id=s."userId" where s.id=$1 and u.id=$2 and u."emailVerified" and lower(u.email)=$3 and s."expiresAt">now() for share of s,u',
      [session.session.id, session.user.id, config.email]);
    if (live.rowCount !== 1) throw new OwnerConfirmationError(403);
    // One immutable confirmation per operator run. A retry may not swap its subject/session.
    await connection.query('insert into livestocks_auth.verification(id,identifier,value,"expiresAt","createdAt","updatedAt") values($1,$2,$3,now()+interval \'15 minutes\',now(),now()) on conflict(id) do nothing',
      [config.runId, `livestocks:owner-confirmation:${config.runId}`, receipt]);
    const existing = await connection.query<{ value: string }>('select value from livestocks_auth.verification where id=$1 for update', [config.runId]);
    const { payload: saved } = await jwtVerify(existing.rows[0].value, new TextEncoder().encode(config.secret), {
      algorithms: ['HS256'], issuer: config.issuer, audience: OWNER_CONFIRMATION_AUDIENCE,
    });
    if (saved.sub !== session.user.id || saved.sid !== session.session.id || saved.legacy_subject !== config.legacySubject || saved.purpose !== 'confirmed') {
      throw new OwnerConfirmationError(409);
    }
    await connection.query('commit');
  } catch (error) { await connection.query('rollback'); throw error; }
  finally { connection.release(); }
  return { confirmed: true, account: { id: session.user.id, email: session.user.email } };
}
