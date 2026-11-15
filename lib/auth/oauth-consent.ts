import 'server-only';
import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { AUTH_SCOPES, betterAuthConfiguration, getBetterAuth } from './better-auth';
import { signedOAuthQuery, validConsentDestination } from './oauth-continuation';

export type ConsentReview = {
  query: string; receipt: string; callback: string; clientName: string;
  account: { id: string; email: string; name: string }; scopes: string[]; expiresAt: number;
};
export class ConsentError extends Error {
  constructor(public readonly code: 'INVALID_REQUEST' | 'SIGN_IN_REQUIRED' | 'ACCOUNT_CHANGED' | 'UNAVAILABLE') { super(code); }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const RECEIPT_AUDIENCE = 'livestocks:consent-review';

async function verifiedContext(raw: string, headers: Headers) {
  const auth = getBetterAuth();
  if (!auth) throw new ConsentError('UNAVAILABLE');
  const config = betterAuthConfiguration();
  const query = signedOAuthQuery(raw);
  if (!query || query.length > 16_384) throw new ConsentError('INVALID_REQUEST');
  const context = await auth.$context;
  if (!await verifyOAuthQueryParams(query, context.secret)) throw new ConsentError('INVALID_REQUEST');
  const params = new URLSearchParams(query);
  for (const name of ['client_id', 'scope', 'redirect_uri', 'resource', 'response_type', 'exp', 'code_challenge', 'code_challenge_method']) {
    if (params.getAll(name).length !== 1) throw new ConsentError('INVALID_REQUEST');
  }
  const scopes = params.get('scope')!.split(' ').filter(Boolean);
  if (params.get('client_id') !== config.mcpClientId || params.get('resource') !== config.mcpAudience
    || params.get('response_type') !== 'code' || params.get('code_challenge_method') !== 'S256'
    || params.has('claims') || !scopes.includes('portfolio:read')
    || scopes.some(scope => !(AUTH_SCOPES as readonly string[]).includes(scope))) throw new ConsentError('INVALID_REQUEST');
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session?.user.emailVerified || new Date(session.session.expiresAt).getTime() <= Date.now()) throw new ConsentError('SIGN_IN_REQUIRED');
  // Public metadata checks the current registration exists and is enabled. Never render its links or logo.
  const client = await auth.api.getOAuthClientPublic({ headers, query: { client_id: config.mcpClientId } });
  const registered = await context.adapter.findOne<{ redirectUris: string[]; requirePKCE: boolean; skipConsent: boolean }>({
    model: 'oauthClient', where: [{ field: 'clientId', value: config.mcpClientId }],
  });
  const callback = params.get('redirect_uri')!;
  if (!registered?.requirePKCE || registered.skipConsent || !registered.redirectUris.includes(callback)) throw new ConsentError('INVALID_REQUEST');
  return { auth, config, context, query, session, scopes, callback, client,
    expiresAt: Math.min(Number(params.get('exp')), Math.floor(new Date(session.session.expiresAt).getTime() / 1000)) };
}

export async function getConsentReview(raw: string, headers: Headers): Promise<ConsentReview> {
  const value = await verifiedContext(raw, headers);
  const receipt = await new SignJWT({ queryHash: digest(value.query), userId: value.session.user.id })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(value.session.session.id).setAudience(RECEIPT_AUDIENCE)
    .setIssuer(value.config.issuer).setExpirationTime(value.expiresAt).sign(new TextEncoder().encode(value.context.secret));
  return { query: value.query, receipt, callback: value.callback, clientName: value.client.client_name || 'LiveStocks ChatGPT',
    account: { id: value.session.user.id, email: value.session.user.email, name: value.session.user.name },
    scopes: value.scopes, expiresAt: value.expiresAt };
}

export async function decideConsent(input: { query: string; receipt: string; accept: boolean }, headers: Headers): Promise<string> {
  const value = await verifiedContext(input.query, headers);
  let payload;
  try {
    ({ payload } = await jwtVerify(input.receipt, new TextEncoder().encode(value.context.secret), {
      algorithms: ['HS256'], issuer: value.config.issuer, audience: RECEIPT_AUDIENCE,
    }));
  } catch { throw new ConsentError('INVALID_REQUEST'); }
  if (payload.sub !== value.session.session.id || payload.userId !== value.session.user.id) throw new ConsentError('ACCOUNT_CHANGED');
  if (payload.queryHash !== digest(value.query)) throw new ConsentError('INVALID_REQUEST');
  const result = await value.auth.api.oauth2Consent({ headers, body: { accept: input.accept, oauth_query: value.query } });
  const destination = validConsentDestination(result.url, value.callback, value.config.origin);
  if (!result.redirect || !destination) throw new ConsentError('INVALID_REQUEST');
  return destination;
}
