import { APIError } from 'better-auth/api';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { jwt } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { createHash, randomBytes } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { writeFileSync } from 'node:fs';
// In-process dummy data only. Fail if any library attempts external network I/O.
globalThis.fetch = async () => { throw new Error('External network is forbidden in this probe'); };
const origin = 'http://localhost:54979', issuer = origin + '/api/auth', resource = origin + '/api/mcp', callback = 'https://client.example.invalid/callback';
const db = Object.fromEntries(['user', 'account', 'session', 'verification', 'jwks', 'oauthClient', 'oauthResource', 'oauthClientResource', 'oauthRefreshToken', 'oauthAccessToken', 'oauthConsent', 'oauthClientAssertion'].map(k => [k, []])), mail = [];
const cases = [];
const references = new Map();
let bootstrapUserId;
const auth = betterAuth({ baseURL: origin, secret: randomBytes(48).toString('hex'), database: memoryAdapter(db), trustedOrigins: [origin], telemetry: { enabled: false }, logger: { disabled: true }, disabledPaths: ['/token'], emailAndPassword: { enabled: true, requireEmailVerification: true }, emailVerification: { sendVerificationEmail: async (e) => mail.push(e.url), sendOnSignUp: true }, account: { accountLinking: { disableImplicitLinking: true } }, plugins: [jwt({ disableSettingJwtHeader: true, jwks: { keyPairConfig: { alg: 'ES256' } } }), oauthProvider({ loginPage: '/sign-in', consentPage: '/consent', postLogin: { page: '/grant-context', shouldRedirect: () => false, consentReferenceId: ({ user }) => references.get(user.id) }, grantTypes: ['authorization_code', 'refresh_token'], scopes: ['openid', 'email', 'profile', 'offline_access', 'portfolio:read'], resources: [{ identifier: resource, allowedScopes: ['openid', 'email', 'profile', 'offline_access', 'portfolio:read'], customClaims: { role: 'authenticated', 'https://livestocks.app/read_only': true } }], extensions: process.env.PROBE_SESSION_GUARD === '1' ? [{ claims: { accessToken: async ({ ctx, user, sessionId, referenceId }) => { const session = sessionId ? await ctx.context.adapter.findOne({ model: 'session', where: [{ field: 'id', value: sessionId }] }) : null; if (!user?.emailVerified || referenceId !== references.get(user.id) || !session || session.userId !== user.id || new Date(session.expiresAt) <= new Date())
                            throw new APIError('BAD_REQUEST', { error: 'invalid_grant', error_description: 'An active verified session is required' }); return { 'https://livestocks.app/email_verified': true, 'https://livestocks.app/grant_id': referenceId }; } } }] : [], clientPrivileges: ({ user }) => user?.id === bootstrapUserId, resourcePrivileges: ({ user }) => user?.id === bootstrapUserId, allowDynamicClientRegistration: false, allowUnauthenticatedClientRegistration: false })] });
const record = (name, pass, detail = {}) => { const item = { name, status: pass ? 'PASS' : 'FAIL', ...detail }; cases.push(item); console.log(JSON.stringify(item)); };
async function request(path, body, cookie = '', method = body ? 'POST' : 'GET', form = false) { const headers = { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}) }; const res = await auth.handler(new Request(path.startsWith('http') ? path : issuer + path, { method, headers, body: body ? (form ? new URLSearchParams(body).toString() : JSON.stringify(body)) : undefined })); const text = await res.text(); let data; try {
    data = JSON.parse(text);
}
catch {
    data = {};
} return { res, data, cookie: res.headers.getSetCookie().map(x => x.split(';')[0]).join('; ') }; }
async function account(label) { const email = label + '@example.invalid', password = randomBytes(24).toString('base64url') + 'A!1'; await request('/sign-up/email', { name: 'Synthetic', email, password }); const unverified = await request('/sign-in/email', { email, password }); record(label + '_unverified_denied', unverified.res.status === 403); if (!mail.length)
    throw Error('no verification'); await request(mail.pop()); const login = await request('/sign-in/email', { email, password }); record(label + '_verified_signin', login.res.status === 200 && !!login.cookie); return { cookie: login.cookie, id: login.data.user?.id }; }
try {
    const a = await account('a'), b = await account('b');
    record('separate_accounts', a.id !== b.id);
    bootstrapUserId = a.id;
    references.set(a.id, randomBytes(20).toString('hex'));
    references.set(b.id, randomBytes(20).toString('hex'));
    const client = await auth.api.adminCreateOAuthClient({ headers: new Headers({ cookie: a.cookie }), body: { client_name: 'Dummy MCP', redirect_uris: [callback], token_endpoint_auth_method: 'client_secret_post', grant_types: ['authorization_code', 'refresh_token'], scope: 'openid email profile offline_access portfolio:read', resources: [resource], require_pkce: true, skip_consent: false } });
    const jwks = await request('/jwks');
    const key = createLocalJWKSet(jwks.data);
    async function authorize(cookie = a.cookie, target = resource) { const verifier = randomBytes(32).toString('base64url'), params = new URLSearchParams({ client_id: client.client_id, response_type: 'code', redirect_uri: callback, scope: 'openid email profile offline_access portfolio:read', state: randomBytes(20).toString('hex'), nonce: randomBytes(20).toString('hex'), code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }); if (target !== null)
        params.set('resource', target); const started = await request('/oauth2/authorize?' + params, undefined, cookie); let location = started.res.headers.get('location'); if (location?.includes('/consent?')) {
        const signed = new URL(location, origin).search.slice(1);
        const approved = await request('/oauth2/consent', { accept: true, oauth_query: signed }, cookie);
        location = approved.data.url;
    } const url = location ? new URL(location, origin) : null; return { code: url?.searchParams.get('code'), error: url?.searchParams.get('error') || started.data.error, status: started.res.status, verifier }; }
    async function token(fields) { return request('/oauth2/token', { client_id: client.client_id, client_secret: client.client_secret, ...fields }, '', 'POST', true); }
    async function exchange(target = resource, tokenTarget = resource, cookie = a.cookie) { const code = await authorize(cookie, target); if (!code.code)
        return { data: { error: code.error }, res: { status: code.status } }; return token({ grant_type: 'authorization_code', code: code.code, code_verifier: code.verifier, redirect_uri: callback, ...(tokenTarget === null ? {} : { resource: tokenTarget }) }); }
    async function verify(t) { if (!t)
        return null; try {
        return (await jwtVerify(t, key, { issuer, audience: resource, algorithms: ['ES256'] })).payload;
    }
    catch {
        return null;
    } }
    const positive = await exchange();
    let claims = await verify(positive.data.access_token);
    record('canonical_code', !!claims, { httpStatus: positive.res.status, oauthError: positive.data.error, hasIdToken: !!positive.data.id_token, roleAuthenticated: claims?.role === 'authenticated', sidPresent: typeof claims?.sid === 'string' });
    if (!claims)
        throw Error('positive incomplete');
    for (const [name, ar, tr] of [['wrong_authorize', 'http://evil.invalid/api', resource], ['wrong_exchange', resource, 'http://evil.invalid/api'], ['omitted_exchange', resource, null], ['missing_authorize_yields_no_mcp_jwt', null, null]]) {
        const r = await exchange(ar, tr);
        const p = await verify(r.data.access_token);
        record(name, name === 'omitted_exchange' ? !!p : !p, { httpStatus: r.res.status, oauthError: r.data.error, jwtAccepted: !!p, tokenIssued: !!r.data.access_token });
    }
    const other = await exchange(resource, resource, b.cookie);
    const otherClaims = await verify(other.data.access_token);
    record('oauth_account_binding', claims.sub === a.id && otherClaims?.sub === b.id && claims.sub !== otherClaims.sub);
    const pkce = await authorize();
    const wrongPkce = await token({ grant_type: 'authorization_code', code: pkce.code, code_verifier: randomBytes(32).toString('base64url'), redirect_uri: callback, resource });
    record('wrong_pkce', wrongPkce.data.error === 'invalid_grant' && !wrongPkce.data.access_token, { httpStatus: wrongPkce.res.status });
    const single = await authorize();
    const onceFields = { grant_type: 'authorization_code', code: single.code, code_verifier: single.verifier, redirect_uri: callback, resource };
    const once = await token(onceFields), twice = await token(onceFields);
    record('code_single_use', !!(await verify(once.data.access_token)) && twice.data.error === 'invalid_grant');
    const noAuth = await request('/oauth2/create-client', { redirect_uris: [callback] });
    record('anonymous_client_creation_denied', noAuth.res.status === 401);
    const consent = await authorize(b.cookie, 'http://unrelated.invalid');
    record('unknown_resource_denied_for_second_user', consent.error === 'invalid_target');
    const initial = claims;
    let rt = positive.data.refresh_token;
    for (let i = 1; i <= 2; i++) {
        const r = await token({ grant_type: 'refresh_token', refresh_token: rt, resource });
        claims = await verify(r.data.access_token);
        record('refresh_' + i, !!claims && claims.sid === initial.sid, { sameSubject: claims?.sub === initial.sub, sameSid: claims?.sid === initial.sid });
        rt = r.data.refresh_token;
    }
    const wrong = await token({ grant_type: 'refresh_token', refresh_token: rt, resource: 'http://evil.invalid/api' });
    record('wrong_refresh', !(await verify(wrong.data.access_token)), { httpStatus: wrong.res.status, oauthError: wrong.data.error });
    const disabled = await request('/token', undefined, a.cookie);
    record('browser_jwt_endpoint_disabled', disabled.res.status === 404);
    const nonAdmin = await request('/oauth2/create-client', { redirect_uris: [callback] }, b.cookie);
    record('nonadmin_client_creation_denied', nonAdmin.res.status === 401);
    const dcr = await request('/oauth2/register', { redirect_uris: [callback] });
    record('dcr_disabled', dcr.res.status >= 400);
    if (process.env.PROBE_SESSION_GUARD === '1') {
        references.set(b.id, randomBytes(20).toString('hex'));
        const oldGrant = await token({ grant_type: 'refresh_token', refresh_token: other.data.refresh_token, resource });
        record('old_grant_cannot_inherit_new_generation', oldGrant.data.error === 'invalid_grant' && !oldGrant.data.access_token);
        const newGrant = await exchange(resource, resource, b.cookie);
        const ng = await verify(newGrant.data.access_token);
        record('new_grant_keeps_same_user_with_new_reference', ng?.sub === b.id && ng?.['https://livestocks.app/grant_id'] === references.get(b.id) && ng?.['https://livestocks.app/grant_id'] !== otherClaims?.['https://livestocks.app/grant_id']);
    }
    await request('/sign-out', {}, a.cookie);
    const revoked = await token({ grant_type: 'refresh_token', refresh_token: rt, resource });
    record('session_end_revokes_refresh', !revoked.data.access_token, { httpStatus: revoked.res.status, oauthError: revoked.data.error });
}
catch (error) {
    record('execution_complete', false, { reason: error instanceof Error ? error.message.slice(0, 100) : 'unknown', errorStatus: error?.status, errorCode: error?.body?.code, errorDescription: error?.body?.error_description });
}
process.exitCode = cases.every(item => item.status === 'PASS') ? 0 : 1;
writeFileSync(new URL(process.env.PROBE_SESSION_GUARD === '1' ? 'guarded-report.json' : 'report.json', import.meta.url), JSON.stringify({ packageVersions: { 'better-auth': '1.7.23', '@better-auth/oauth-provider': '1.7.23' }, status: cases.every(x => x.status === 'PASS') ? 'PASS_DUMMY_ONLY' : 'INCOMPLETE', guardEnabled: process.env.PROBE_SESSION_GUARD === '1', missingAuthorizeResourceRejected: false, cases, limits: ['In-process Fetch handler with dummy memory adapter; no hosted calls, real Google, SMTP, PostgreSQL concurrency, hosted Supabase JWT trust, or ChatGPT host test.'] }, null, 2));
