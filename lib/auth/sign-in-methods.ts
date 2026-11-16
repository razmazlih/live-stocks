import 'server-only';
import { isPasswordAuthEnabled } from './better-auth-config';
import { SignJWT } from 'jose';
import { betterAuthConfiguration, getAuthPublicOptions, getBetterAuth, getAuthDatabasePool } from './better-auth';
import { METHOD_AUDIENCE } from './sign-in-method-guard';

export class SignInMethodError extends Error {
  constructor(public code: 'UNAUTHORIZED' | 'UNAVAILABLE' | 'INVALID_PROOF' | 'ALREADY_LINKED' | 'RATE_LIMITED') { super(code); }
}
async function current(headers: Headers) {
  const auth = getBetterAuth(); if (!auth) throw new SignInMethodError('UNAVAILABLE');
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session?.user.emailVerified || new Date(session.session.expiresAt).getTime() <= Date.now()) throw new SignInMethodError('UNAUTHORIZED');
  const context = await auth.$context;
  const accounts = await context.internalAdapter.findAccounts(session.user.id);
  return { auth, session, accounts, pool: getAuthDatabasePool() };
}
export async function getSignInMethods(headers: Headers) {
  const { session, accounts } = await current(headers);
  const options = getAuthPublicOptions();
  return { account: { id: session.user.id, email: session.user.email },
    methods: { password: accounts.some(a => a.providerId === 'credential' && Boolean(a.password)), google: accounts.some(a => a.providerId === 'google') },
    passwordEnabled: options.passwordEnabled, googleEnabled: options.googleEnabled, emailDeliveryConfigured: options.emailDeliveryConfigured };
}
async function operation(value: Awaited<ReturnType<typeof current>>, purpose: 'google' | 'password') {
  try {
    const { rows } = await value.pool.query<{ id: string }>('select private.begin_signin_method_operation($1,$2,$3)::text as id', [value.session.user.id, value.session.session.id, purpose]);
    return rows[0].id;
  } catch (error) {
    if (error instanceof Error && error.message === 'Sign-in method attempt limit') throw new SignInMethodError('RATE_LIMITED');
    throw new SignInMethodError('UNAVAILABLE');
  }
}
export async function startGoogleMethod(headers: Headers, password: string): Promise<Response> {
  if (!isPasswordAuthEnabled()) throw new SignInMethodError('UNAVAILABLE');
  const value = await current(headers), config = betterAuthConfiguration();
  if (!getAuthPublicOptions().googleEnabled) throw new SignInMethodError('UNAVAILABLE');
  if (value.accounts.some(a => a.providerId === 'google')) throw new SignInMethodError('ALREADY_LINKED');
  if (!value.accounts.some(a => a.providerId === 'credential' && Boolean(a.password))) throw new SignInMethodError('INVALID_PROOF');
  const id = await operation(value, 'google');
  try {
    const result = await value.auth.api.verifyPassword({ headers, body: { password } });
    if (!result.status) throw new Error('Invalid proof');
  } catch { throw new SignInMethodError('INVALID_PROOF'); }
  await value.pool.query("update private.signin_method_operations set status='pending' where id=$1::uuid and status='started'", [id]);
  const ticket = await new SignJWT({ sid: value.session.session.id }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(value.session.user.id).setJti(id).setIssuer(config.issuer).setAudience(METHOD_AUDIENCE)
    .setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(config.secret));
  return value.auth.api.linkSocialAccount({ headers, asResponse: true, body: { provider: 'google',
    callbackURL: `${config.origin}/account/sign-in-methods/complete`, errorCallbackURL: `${config.origin}/account/sign-in-methods/complete?failed=1`,
    disableRedirect: true, loginHint: value.session.user.email, scopes: ['openid', 'email', 'profile'],
    additionalData: { livestocksMethodTicket: ticket }, additionalParams: { prompt: 'select_account' } } });
}
export async function requestPasswordMethod(headers: Headers): Promise<void> {
  if (!isPasswordAuthEnabled()) throw new SignInMethodError('UNAVAILABLE');
  const value = await current(headers);
  if (value.accounts.some(a => a.providerId === 'credential' && Boolean(a.password))) throw new SignInMethodError('ALREADY_LINKED');
  if (!value.accounts.some(a => a.providerId === 'google')) throw new SignInMethodError('INVALID_PROOF');
  if (!getAuthPublicOptions().emailDeliveryConfigured) throw new SignInMethodError('UNAVAILABLE');
  await operation(value, 'password');
  await value.auth.api.requestPasswordReset({ headers, body: { email: value.session.user.email,
    redirectTo: `${betterAuthConfiguration().origin}/reset-password?returnTo=%2Fsettings` } });
}
