// @vitest-environment node
/** Real SDK/HTTP handlers and local PG; Google token exchange and mail are synthetic. */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { SignJWT, generateKeyPair, exportJWK, jwtVerify } from 'jose';
vi.mock('server-only', () => ({}));
const mailbox = vi.hoisted(() => [] as { email: string; url: string }[]);
vi.mock('@/lib/auth/auth-email', () => ({ requireAuthEmailConfiguration: () => {}, sendAuthEmail: async (email: string, url: string) => { mailbox.push({ email, url }); } }));
import { getBetterAuth, shutdownBetterAuth } from '@/lib/auth/better-auth';
import { handleBetterAuthRequest } from '@/lib/auth/better-auth-handler';
import { GET as methodsGet } from '@/app/api/account/sign-in-methods/route';
import { POST as googlePost } from '@/app/api/account/sign-in-methods/google/route';
import { POST as passwordPost } from '@/app/api/account/sign-in-methods/password/route';
import { confirmOwner, ownerConfirmationView, ownerConfirmationConfiguration, OWNER_CONFIRMATION_AUDIENCE } from '@/lib/auth/owner-confirmation';
import { POST as confirmOwnerPost } from '@/app/api/account/owner-confirmation/route';

describe.skipIf(!process.env.BETTER_AUTH_LOCAL_TEST_STATE)('same-user sign-in methods on real local PostgreSQL', () => {
  it('links only proved matching Google accounts, preserves finance and adds a password to a Google-first user', async () => {
    const state = JSON.parse(readFileSync(process.env.BETTER_AUTH_LOCAL_TEST_STATE!, 'utf8'));
    if (![state.origin, state.adminDatabaseUrl].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local runtime required');
    const origin = state.origin, issuer = origin + '/api/auth';
    const env = { PASSWORD_AUTH_ENABLED: 'true', APP_BASE_URL: origin, BETTER_AUTH_SECRET: randomBytes(48).toString('hex'), BETTER_AUTH_DATABASE_URL: state.backendDatabaseUrl,
      BETTER_AUTH_WEBSITE_CLIENT_ID: state.websiteClientId, BETTER_AUTH_MCP_CLIENT_ID: state.mcpClientId,
      GOOGLE_CLIENT_ID: 'synthetic-google-client', GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
      SMTP_HOST: 'synthetic', SMTP_PORT: '1', SMTP_FROM: 'support@example.invalid', SMTP_USER: 'synthetic', SMTP_PASSWORD: 'synthetic' };
    Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value as string));
    const admin = new Pool({ connectionString: state.adminDatabaseUrl });
    const keys = await generateKeyPair('RS256');
    const publicKey = { ...await exportJWK(keys.publicKey), kid: 'synthetic-google' };
    const codes = new Map<string, { email: string; verified: boolean; sub: string; challenge: string }>();
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [publicKey] });
      if (url !== 'https://oauth2.googleapis.com/token') throw Error('Unexpected network request in isolated test');
      const body = new URLSearchParams(String(init?.body)), code = body.get('code')!, proof = codes.get(code); codes.delete(code);
      if (!proof || createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url') !== proof.challenge) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      const idToken = await new SignJWT({ email: proof.email, email_verified: proof.verified, name: 'Synthetic Google' })
        .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-google' }).setSubject(proof.sub).setAudience(env.GOOGLE_CLIENT_ID).setIssuer('https://accounts.google.com').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
      return Response.json({ access_token: 'synthetic-google-access', token_type: 'Bearer', expires_in: 300, id_token: idToken, scope: 'openid email profile' });
    }));
    const cookieOf = (response: Response) => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    async function auth(path: string, body?: object, cookie = '') {
      const response = await handleBetterAuthRequest(new Request(path.startsWith('http') ? path : issuer + path, { method: body ? 'POST' : 'GET',
        headers: { origin, cookie, 'x-forwarded-for': '192.0.2.22', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }));
      return { response, data: await response.clone().json().catch(() => ({})), cookie: cookieOf(response) };
    }
    async function account() {
      const email = randomBytes(12).toString('hex') + '@example.invalid', password = 'Synthetic-pass-' + randomBytes(12).toString('hex');
      expect((await auth('/sign-up/email', { name: 'Synthetic owner', email, password })).response.status).toBe(200);
      await auth(mailbox.pop()!.url); const login = await auth('/sign-in/email', { email, password });
      expect(login.response.status).toBe(200); return { email, password, id: login.data.user.id as string, cookie: login.cookie };
    }
    const post = (handler: typeof googlePost, body: object, cookie: string, source = origin) => handler(new Request(origin + '/api/account/sign-in-methods/google', { method: 'POST', headers: { origin: source, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    async function googleCallback(response: Response, cookie: string, email: string, verified = true, sub = 'google-' + randomBytes(12).toString('hex')) {
      expect(response.status).toBe(200); const data = await response.json(), url = new URL(data.url), code = randomBytes(12).toString('hex');
      expect(url.origin).toBe('https://accounts.google.com');
      codes.set(code, { email, verified, sub, challenge: url.searchParams.get('code_challenge')! });
      const target = '/callback/google?' + new URLSearchParams({ state: url.searchParams.get('state')!, code });
      const result = await auth(target, undefined, [cookie, cookieOf(response)].filter(Boolean).join('; '));
      return { ...result, target, cookies: [cookie, cookieOf(response)].filter(Boolean).join('; ') };
    }
    try {
      await getBetterAuth()!.$context;
      const owner = await account(), other = await account();
      await admin.query('select public.server_bootstrap_web_account($1,$2)', [issuer, owner.id]);
      await admin.query("insert into public.positions(user_id,symbol,display,image_url,entry_price,quantity,entry_date) values($1,'KEEP','Synthetic preserved','',12.5,3,'2026-01-01')", [owner.id]);
      await admin.query("insert into public.position_lots(position_id,user_id,side,price,quantity,executed_at) select id,user_id,'BUY',12.5,3,'2026-01-01' from public.positions where user_id=$1", [owner.id]);
      await admin.query("insert into public.position_plans(user_id,symbol,target_price,target_quantity,target_date)values($1,'FUTURE',22,4,'2027-01-01')", [owner.id]);
      await admin.query("insert into public.watchlist_groups(user_id,name)values($1,'Preserved watchlist')", [owner.id]);
      await admin.query("insert into public.watchlist_tickers(user_id,group_id,symbol)select user_id,id,'KEEP' from public.watchlist_groups where user_id=$1", [owner.id]);
      const snapshot = async (userId = owner.id) => (await admin.query("select jsonb_build_object('profile',(select to_jsonb(p) from public.user_profiles p where id=$1),'positions',(select jsonb_agg(to_jsonb(p) order by id) from public.positions p where user_id=$1),'lots',(select jsonb_agg(to_jsonb(l) order by id) from public.position_lots l where user_id=$1),'settings',(select jsonb_agg(to_jsonb(s) order by id) from public.settings s where user_id=$1),'plans',(select jsonb_agg(to_jsonb(p) order by id) from public.position_plans p where user_id=$1),'groups',(select jsonb_agg(to_jsonb(g) order by id) from public.watchlist_groups g where user_id=$1),'tickers',(select jsonb_agg(to_jsonb(t) order by id) from public.watchlist_tickers t where user_id=$1)) as data", [userId])).rows[0].data;
      const before = await snapshot();
      const start = (password = owner.password, cookie = owner.cookie) => post(googlePost, { consent: true, password }, cookie);
      expect((await post(googlePost, { consent: true, password: owner.password }, owner.cookie, 'https://evil.invalid')).status).toBe(403);
      expect((await post(googlePost, { consent: true, password: owner.password, provider: 'evil', idToken: 'browser-token' }, owner.cookie)).status).toBe(403);
      expect((await auth('/link-social', { provider: 'google' }, owner.cookie)).response.status).toBe(404);
      expect((await auth('/verify-password', { password: owner.password }, owner.cookie)).response.status).toBe(404);
      expect((await start('incorrect-password')).status).toBe(403);
      const wrongEmail = await googleCallback(await start(), owner.cookie, other.email);
      expect(wrongEmail.response.headers.get('location')).toContain('error=METHOD_LINK_REJECTED');
      const unverified = await googleCallback(await start(), owner.cookie, owner.email, false);
      expect(unverified.response.headers.get('location')).toContain('error=METHOD_LINK_REJECTED');
      const switched = await googleCallback(await start(), other.cookie, owner.email);
      expect(switched.response.headers.get('location')).toContain('error=METHOD_LINK_REJECTED');
      const linked = await googleCallback(await start(), owner.cookie, owner.email, true, 'google-same-owner');
      expect(linked.response.headers.get('location')).toBe(origin + '/account/sign-in-methods/complete');
      expect((await auth(linked.target, undefined, linked.cookies)).response.headers.get('location')).toContain('error=');
      const methods = await (await methodsGet(new Request(origin + '/api/account/sign-in-methods', { headers: { cookie: owner.cookie } }))).json();
      expect(methods).toMatchObject({ account: { id: owner.id }, methods: { password: true, google: true } });
      expect(await snapshot()).toEqual(before);
      expect((await admin.query('select count(*)::int n from livestocks_auth."user" where email=$1', [owner.email])).rows[0].n).toBe(1);
      const googleLoginStart = await auth('/sign-in/social', { provider: 'google', callbackURL: origin + '/settings', disableRedirect: true });
      const googleLogin = await googleCallback(googleLoginStart.response, '', owner.email, true, 'google-same-owner');
      const googleSession = await auth('/get-session', undefined, googleLogin.cookie); expect(googleSession.data.user.id).toBe(owner.id);
      // New Google-first account, followed by an explicitly requested email setup link.
      const googleEmail = randomBytes(12).toString('hex') + '@example.invalid';
      const firstStart = await auth('/sign-in/social', { provider: 'google', callbackURL: origin + '/settings', disableRedirect: true });
      const first = await googleCallback(firstStart.response, '', googleEmail);
      const firstSession = await auth('/get-session', undefined, first.cookie); const firstId = firstSession.data.user.id;
      await admin.query('select public.server_bootstrap_web_account($1,$2)', [issuer, firstId]);
      await admin.query("insert into public.positions(user_id,symbol,display,image_url,entry_price,quantity,entry_date) values($1,'GKEEP','Google portfolio','',19.5,2,'2026-01-01')", [firstId]);
      const googleBefore = await snapshot(firstId);
      const requested = await post(passwordPost, { consent: true }, first.cookie); expect(requested.status).toBe(200);
      const mail = mailbox.pop()!; expect(mail.email).toBe(googleEmail);
      const resetRedirect = await auth(mail.url); const token = new URL(resetRedirect.response.headers.get('location')!).searchParams.get('token');
      expect((await auth('/reset-password', { token, newPassword: 'New-synthetic-password-123' })).response.status).toBe(200);
      const passwordLogin = await auth('/sign-in/email', { email: googleEmail, password: 'New-synthetic-password-123' }); expect(passwordLogin.data.user.id).toBe(firstId);
      expect((await auth('/get-session', undefined, first.cookie)).data).toBeNull();
      expect((await admin.query('select count(*)::int n from livestocks_auth."user" where email=$1', [googleEmail])).rows[0].n).toBe(1);
      expect(await snapshot(firstId)).toEqual(googleBefore);
      const expiredOwner = await account();
      const expiredStart = await post(googlePost, { consent: true, password: expiredOwner.password }, expiredOwner.cookie);
      await admin.query("update private.signin_method_operations set expires_at=now()-interval '1 second' where user_id=$1", [expiredOwner.id]);
      expect((await googleCallback(expiredStart, expiredOwner.cookie, expiredOwner.email)).response.headers.get('location')).toContain('error=METHOD_LINK_REJECTED');
      const revokedOwner = await account();
      const revokedStart = await post(googlePost, { consent: true, password: revokedOwner.password }, revokedOwner.cookie);
      await auth('/sign-out', {}, revokedOwner.cookie);
      expect((await googleCallback(revokedStart, revokedOwner.cookie, revokedOwner.email)).response.headers.get('location')).toContain('error=');
      expect((await admin.query('select count(*)::int n from livestocks_auth."account" where "userId"=$1 and "providerId"=\'google\'', [revokedOwner.id])).rows[0].n).toBe(0);
      const limited = await account();
      for (let i = 0; i < 5; i++) expect((await post(googlePost, { consent: true, password: 'bad' }, limited.cookie)).status).toBe(403);
      expect((await post(googlePost, { consent: true, password: limited.password }, limited.cookie)).status).toBe(429);
      // Launch mode: real SDK Google signup/login works without any mail settings.
      vi.stubEnv('PASSWORD_AUTH_ENABLED', 'false');
      for (const name of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD']) vi.stubEnv(name, '');
      const mailCount = mailbox.length;
      for (const path of ['/sign-up/email', '/sign-in/email', '/request-password-reset', '/reset-password', '/send-verification-email', '/change-password', '/change-email']) {
        expect((await auth(path, { email: owner.email, password: owner.password })).response.status, path).toBe(404);
      }
      for (const path of ['/verify-email?token=unused', '/reset-password/unused']) expect((await auth(path)).response.status).toBe(404);
      expect((await post(passwordPost, { consent: true }, owner.cookie)).status).toBe(404);
      expect((await start()).status).toBe(404);
      const newGoogleEmail = randomBytes(12).toString('hex') + '@example.invalid';
      const googleOnly = await googleCallback((await auth('/sign-in/social', { provider: 'google', callbackURL: origin + '/settings' })).response, '', newGoogleEmail, true, 'google-only-new-' + randomBytes(8).toString('hex'));
      expect(googleOnly.response.headers.get('location')).toBe(origin + '/settings');
      const googleOnlySession = await auth('/get-session', undefined, googleOnly.cookie);
      expect(googleOnlySession.data.user).toMatchObject({ email: newGoogleEmail, emailVerified: true });
      expect(mailbox.length).toBe(mailCount);
      expect(await snapshot()).toEqual(before);

      // Temporary final-store owner confirmation: explicit consent, not an email-based claim.
      const runId = randomUUID(), legacySubject = 'auth0|synthetic-legacy-owner';
      vi.stubEnv('OWNER_CONFIRMATION_RUN_ID', runId); vi.stubEnv('OWNER_CONFIRMATION_EMAIL', newGoogleEmail);
      vi.stubEnv('OWNER_CONFIRMATION_LEGACY_SUBJECT', legacySubject);
      const ownerHeaders = new Headers({ cookie: googleOnly.cookie });
      const review = await ownerConfirmationView(ownerHeaders);
      expect(review.account.id).toBe(googleOnlySession.data.user.id);
      const badOrigin = await confirmOwnerPost(new Request(origin + '/api/account/owner-confirmation', { method: 'POST',
        headers: { origin: 'https://evil.invalid', 'content-type': 'application/json', cookie: googleOnly.cookie },
        body: JSON.stringify({ confirm: true, token: review.token }) }));
      expect(badOrigin.status).toBe(403);
      await expect(confirmOwner(new Headers({ cookie: other.cookie }), review.token)).rejects.toMatchObject({ status: 403 });
      await expect(confirmOwner(ownerHeaders, review.token.slice(0, -8) + 'tampered')).rejects.toMatchObject({ status: 403 });
      expect(await confirmOwner(ownerHeaders, review.token)).toMatchObject({ confirmed: true, account: review.account });
      const receipt = (await admin.query('select value from livestocks_auth.verification where id=$1', [runId])).rows[0].value;
      expect((await jwtVerify(receipt, new TextEncoder().encode(env.BETTER_AUTH_SECRET), { algorithms: ['HS256'], issuer,
        audience: OWNER_CONFIRMATION_AUDIENCE })).payload).toMatchObject({ sub: review.account.id, purpose: 'confirmed', legacy_subject: legacySubject });
      expect(await confirmOwner(ownerHeaders, review.token)).toMatchObject({ confirmed: true });
      expect((await admin.query('select value from livestocks_auth.verification where id=$1', [runId])).rows[0].value).toBe(receipt);
      const activeSession = googleOnlySession.data.session;
      await admin.query('update livestocks_auth."session" set "createdAt"=now()-interval \'1 hour\' where id=$1', [activeSession.id]);
      await expect(ownerConfirmationView(ownerHeaders)).rejects.toMatchObject({ status: 403 });
      await admin.query('update livestocks_auth."session" set "createdAt"=$2 where id=$1', [activeSession.id, activeSession.createdAt]);
      vi.stubEnv('NODE_ENV', 'production'); expect(() => ownerConfirmationConfiguration()).toThrow();
      vi.stubEnv('NODE_ENV', 'test');
      expect(await snapshot()).toEqual(before);

    } finally { await admin.end(); await shutdownBetterAuth(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  }, 90_000);
});
