import 'server-only';
import type { BetterAuthOptions } from 'better-auth';
import { getAuthoritativeSessionFromCtx, getOAuthState } from 'better-auth/api';
import { jwtVerify } from 'jose';
import type { Pool } from 'pg';
import { isPasswordAuthEnabled } from './better-auth-config';
import type { BetterAuthConfiguration } from './better-auth-config';

export const METHOD_AUDIENCE = 'livestocks:add-sign-in-method';
type Validator = NonNullable<NonNullable<BetterAuthOptions['user']>['validateUserInfo']>;

/** Invoked by the SDK before linking its verified provider response to an account. */
export function methodUserValidator(pool: Pool, config: BetterAuthConfiguration): Validator {
  return async ({ user, source }, ctx) => {
    if (source.action !== 'link-account') return;
    const denied = { error: 'METHOD_LINK_REJECTED', errorDescription: 'Restart method linking from account settings' };
    if (!isPasswordAuthEnabled() || source.method !== 'oauth' || source.oauth?.providerId !== 'google' || user.emailVerified !== true || typeof user.email !== 'string') return denied;
    const state = await getOAuthState();
    const ticket = state?.livestocksMethodTicket;
    if (typeof ticket !== 'string' || ticket.length > 2048 || !state?.link) return denied;
    let payload;
    try { ({ payload } = await jwtVerify(ticket, new TextEncoder().encode(config.secret), { algorithms: ['HS256'], issuer: config.issuer, audience: METHOD_AUDIENCE })); }
    catch { return denied; }
    const session = await getAuthoritativeSessionFromCtx(ctx);
    if (!session?.user.emailVerified || payload.sub !== session.user.id || payload.sid !== session.session.id
      || state.link.userId !== session.user.id || user.id !== session.user.id
      || state.link.email.toLowerCase() !== session.user.email.toLowerCase() || user.email.toLowerCase() !== session.user.email.toLowerCase()
      || typeof payload.jti !== 'string' || !/^[0-9a-f-]{36}$/.test(payload.jti)) return denied;
    // This is consumed before the SDK writes the new provider account. Failure later
    // requires a fresh attempt; replay can never create a second authorization.
    const result = await pool.query(`update private.signin_method_operations o set status='used',used_at=now()
      from livestocks_auth."session" s where o.id=$1::uuid and o.user_id=$2 and o.session_id=$3
      and o.purpose='google' and o.status='pending' and o.expires_at>now()
      and s.id=o.session_id and s."userId"=o.user_id and s."expiresAt">now() returning o.id`,
    [payload.jti, session.user.id, session.session.id]);
    if (result.rowCount !== 1) return denied;
  };
}
