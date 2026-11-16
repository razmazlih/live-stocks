#!/usr/bin/env node
/** Human-only owner identity capture. No Supabase client, queries, or portfolio writes. */
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { constants, openSync, closeSync, writeFileSync, readFileSync, existsSync, lstatSync, realpathSync, renameSync, unlinkSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import ts from 'typescript';

const ORIGIN = 'http://localhost:3109';
const CALLBACK = `${ORIGIN}/auth/callback`;
const COOKIE = 'livestocks_owner_capture';
const TTL_MS = 15 * 60 * 1000;
const diagnosticCodes = new Set(['UNCLASSIFIED', 'TOKEN_EXCHANGE_REJECTED', 'TOKEN_RESPONSE_MISSING_ACCESS', 'TOKEN_RESPONSE_MISSING_ID',
  'SUB_MISMATCH', 'EMAIL_UNVERIFIED', 'EMAIL_MISSING', 'CAPTURE_EXPIRED', 'CAPTURE_SUPERSEDED', 'ACCESS_EXPIRED', 'NONCE_MISMATCH', 'ID_IAT_INVALID', 'ID_EXP_INVALID', 'ID_AZP_MISMATCH',
  'ACCESS_CLAIM_INVALID', 'ERR_JWT_CLAIM_VALIDATION_FAILED', 'ERR_JWT_EXPIRED', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED', 'ERR_JWKS_NO_MATCHING_KEY', 'ERR_JWKS_TIMEOUT', 'ERR_JOSE_ALG_NOT_ALLOWED', 'ERR_JWS_INVALID', 'ERR_JWT_INVALID']);
const diagnosticClaims = new Set(['iss', 'aud', 'sub', 'azp', 'iat', 'exp', 'nbf', 'nonce', 'email', 'email_verified', 'scope', 'role', 'client_id',
  'https://livestocks.app/read_only', 'https://livestocks.app/email_verified']);
function captureError(code, claim) { const error = new Error('Owner capture verification failed'); error.code = code; if (claim) error.claim = claim; return error; }
function sanitizedError(error) {
  return { code: diagnosticCodes.has(error?.code) ? error.code : 'UNCLASSIFIED', ...(diagnosticClaims.has(error?.claim) ? { claim: error.claim } : {}) };
}
const random = () => randomBytes(32).toString('base64url');
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const equal = (left, right) => typeof left === 'string' && typeof right === 'string'
  && Buffer.byteLength(left) === Buffer.byteLength(right) && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const headers = {
  'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache',
  'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
  // Preserve Origin on same-origin form POSTs while suppressing cross-origin
  // referrers. no-referrer makes browsers send Origin:null on these POSTs.
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
const page = (title, content) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:680px;margin:4rem auto;padding:1rem;line-height:1.7;background:#f4f7fa;color:#142332}main{background:white;padding:2rem;border-radius:16px}dt{font-weight:700}dd{margin:0 0 1rem;overflow-wrap:anywhere}button,a{font:inherit}button{padding:.8rem 1rem;background:#124e73;color:white;border:0;border-radius:8px;cursor:pointer}.note{color:#445568}</style></head><body><main><h1>${escapeHtml(title)}</h1>${content}</main></body></html>`;
const retry = '<p><a href="/start">ניסיון כניסה נוסף</a></p>';
function send(response, status, title, content, extra = {}) {
  response.writeHead(status, { ...headers, ...extra }); response.end(page(title, content));
}
function cookieValue(request) {
  const matches = String(request.headers.cookie || '').split(';').map(item => item.trim()).filter(item => item.startsWith(`${COOKIE}=`));
  return matches.length === 1 ? matches[0].slice(COOKIE.length + 1) : undefined;
}
async function formBody(request) {
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers['content-type'] || '')) throw new Error('Invalid form');
  let length = 0; const chunks = [];
  for await (const chunk of request) { length += chunk.length; if (length > 4096) throw new Error('Form too large'); chunks.push(chunk); }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

/** Dependency injection supports offline boundary checks; the CLI wires real token verification. */
export function createOwnerCapture({ env, exchangeCode, verifyAccess, verifyId, persistOwner, onConfirmed = () => {}, onDiagnostic = () => {}, now = () => Date.now(), localOrigin = ORIGIN }) {
  const parsedOrigin = new URL(localOrigin);
  if (parsedOrigin.protocol !== 'http:' || parsedOrigin.hostname !== 'localhost' || !parsedOrigin.port || parsedOrigin.origin !== localOrigin) {
    throw new Error('Capture origin must be an exact localhost HTTP origin with an explicit port.');
  }
  const captureHost = parsedOrigin.host;
  const callbackUrl = `${localOrigin}/auth/callback`;
  const issuer = `https://${env.AUTH0_DOMAIN}/`;
  const deadline = now() + TTL_MS;
  let transaction; let candidate; let generation = 0; let completed = false;
  function authorizationUrl() {
    if (completed || now() >= deadline) throw new Error('Capture is closed');
    candidate = undefined;
    const verifier = random();
    transaction = { state: random(), nonce: random(), verifier, generation: ++generation };
    const url = new URL('authorize', issuer);
    url.search = new URLSearchParams({ client_id: env.AUTH0_CLIENT_ID, response_type: 'code', redirect_uri: callbackUrl,
      audience: env.AUTH0_WEB_AUDIENCE, scope: 'openid profile email offline_access portfolio:read portfolio:write', prompt: 'login',
      state: transaction.state, nonce: transaction.nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    return url.href;
  }
  async function handle(request, response) {
    if (request.headers.host !== captureHost) { send(response, 400, 'בקשה לא תקינה', '<p>כתובת השרת המקומי אינה תואמת.</p>'); return; }
    if (now() >= deadline) { candidate = undefined; transaction = undefined; send(response, 410, 'חלון האישור הסתיים', '<p>יש להפעיל מחדש את תהליך הכניסה המקומי.</p>'); return; }
    const url = new URL(request.url, localOrigin);
    if (url.origin !== localOrigin) { send(response, 400, 'בקשה לא תקינה', ''); return; }
    if (request.method === 'GET' && url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ ready: !completed })); return;
    }
    if (completed) { send(response, 409, 'האישור כבר נשמר', '<p>אין צורך לשלוח את הטופס שוב.</p>'); return; }
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/start')) {
      response.writeHead(302, { ...headers, Location: authorizationUrl(), 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` }); response.end(); return;
    }
    if (request.method === 'GET' && url.pathname === '/auth/callback') {
      if (!transaction || url.searchParams.getAll('state').length !== 1 || !equal(url.searchParams.get('state'), transaction.state)
        || url.searchParams.getAll('iss').length !== 1 || url.searchParams.get('iss') !== issuer) {
        send(response, 400, 'לא ניתן לאמת את החזרה מהכניסה', `<p>יש להתחיל כניסה חדשה מהקישור המקומי.</p>${retry}`); return;
      }
      const current = transaction; transaction = undefined;
      if (url.searchParams.has('error')) {
        send(response, 403, 'הכניסה לא אושרה', `<p>אם נרשמת באמצעות אימייל וסיסמה, אמת את כתובת האימייל באמצעות ההודעה שנשלחה אליך ואז נסה שוב.</p>${retry}`); return;
      }
      if (url.searchParams.getAll('code').length !== 1 || !url.searchParams.get('code')) { send(response, 400, 'חסר אישור כניסה', retry); return; }
      let phase = 'exchange';
      try {
        onDiagnostic({ phase, status: 'started' });
        const tokens = await exchangeCode(url.searchParams.get('code'), current.verifier);
        onDiagnostic({ phase, status: 'passed' }); phase = 'token_response';
        if (typeof tokens?.access_token !== 'string' || !tokens.access_token) throw captureError('TOKEN_RESPONSE_MISSING_ACCESS');
        if (typeof tokens.id_token !== 'string' || !tokens.id_token) throw captureError('TOKEN_RESPONSE_MISSING_ID');
        onDiagnostic({ phase, status: 'passed', refreshTokenPresent: typeof tokens.refresh_token === 'string' && tokens.refresh_token.length > 0 });
        phase = 'access_jwt';
        const identity = await verifyAccess(tokens.access_token);
        onDiagnostic({ phase, status: 'passed' }); phase = 'id_jwt';
        const profile = await verifyId(tokens.id_token, current.nonce);
        onDiagnostic({ phase, status: 'passed' }); phase = 'identity_binding';
        if (profile.sub !== identity.userId) throw captureError('SUB_MISMATCH', 'sub');
        if (profile.email_verified !== true) throw captureError('EMAIL_UNVERIFIED', 'email_verified');
        if (typeof profile.email !== 'string' || !profile.email.trim()) throw captureError('EMAIL_MISSING', 'email');
        if (now() >= deadline) throw captureError('CAPTURE_EXPIRED');
        if (current.generation !== generation) throw captureError('CAPTURE_SUPERSEDED');
        if (identity.expiresAt * 1000 <= now()) throw captureError('ACCESS_EXPIRED', 'exp');
        onDiagnostic({ phase, status: 'passed' });
        candidate = { userId: identity.userId, email: profile.email, name: typeof profile.name === 'string' ? profile.name : '', emailVerified: true,
          accessToken: tokens.access_token, ...(typeof tokens.refresh_token === 'string' && tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}), expiresAt: identity.expiresAt,
          cookie: random(), csrf: random(), generation: current.generation };
        // Clear OAuth parameters first. A separate same-origin navigation is
        // needed before browsers send the Strict cookie after an IdP redirect.
        response.writeHead(303, { ...headers, Location: '/continue', 'Set-Cookie': `${COOKIE}=${candidate.cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1, Math.floor((deadline - now()) / 1000))}` }); response.end();
      } catch (error) {
        onDiagnostic({ phase, status: 'failed', ...sanitizedError(error) });
        candidate = undefined;
        send(response, 403, 'לא ניתן לאמת את החשבון', `<p>נדרשים חשבון מאומת ואישור גישה תקין. לא נשמר חשבון ולא הועברו נתונים.</p>${retry}`);
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/continue') {
      // This page discloses no identity and does not grant confirmation rights.
      // Clicking establishes a same-origin navigation; /confirm still requires
      // the opaque HttpOnly cookie, and POST additionally requires CSRF+Origin.
      send(response, 200, 'הכניסה הושלמה', '<p>המשך להצגת החשבון המאומת ולאישורו.</p><p><a href="/confirm">המשך לאישור החשבון</a></p>'); return;
    }
    if (url.pathname === '/confirm' && (request.method === 'GET' || request.method === 'POST')) {
      const suppliedCookie = cookieValue(request);
      const cookieMatches = Boolean(candidate && equal(suppliedCookie, candidate.cookie));
      const expired = Boolean(candidate && candidate.expiresAt * 1000 <= now());
      onDiagnostic({ phase: 'confirmation_session', status: candidate && cookieMatches && !expired ? 'passed' : 'failed',
        candidatePresent: Boolean(candidate), cookiePresent: typeof suppliedCookie === 'string', cookieMatches, expired });
      if (!candidate || !cookieMatches || expired) {
        send(response, 401, 'נדרשת כניסה חדשה', retry); return;
      }
      if (request.method === 'GET') {
        send(response, 200, 'אישור החשבון שלך', `<p>זה החשבון המאומת שיקבל את התיק הקיים בשלב ההעברה הבא:</p><dl><dt>שם</dt><dd>${escapeHtml(candidate.name || 'לא נמסר')}</dd><dt>אימייל מאומת</dt><dd dir="ltr">${escapeHtml(candidate.email)}</dd><dt>מזהה חשבון קבוע</dt><dd dir="ltr">${escapeHtml(candidate.userId)}</dd></dl><p class="note">האישור כאן שומר את זהות החשבון בלבד. הוא אינו מעביר או משנה נתוני תיק.</p><form method="post" action="/confirm"><input type="hidden" name="csrf" value="${escapeHtml(candidate.csrf)}"><button type="submit" name="confirm" value="yes">אשר שזה החשבון להעברת התיק הקיים</button></form><p><a href="/start">זה לא החשבון הנכון — כניסה מחדש</a></p>`);
        return;
      }
      const originMatches = request.headers.origin === localOrigin;
      const fetchSite = ['same-origin', 'same-site', 'cross-site', 'none'].includes(request.headers['sec-fetch-site']) ? request.headers['sec-fetch-site'] : 'absent-or-invalid';
      onDiagnostic({ phase: 'confirmation_origin', status: originMatches && (!request.headers['sec-fetch-site'] || fetchSite === 'same-origin') ? 'passed' : 'failed', originMatches, fetchSite });
      if (!originMatches || (request.headers['sec-fetch-site'] && fetchSite !== 'same-origin')) {
        send(response, 403, 'בקשת האישור נחסמה', '<p>יש לאשר באמצעות הטופס המקומי בלבד.</p>'); return;
      }
      try {
        const form = await formBody(request);
        if ([...form.keys()].some(key => key !== 'csrf' && key !== 'confirm') || form.getAll('csrf').length !== 1 || form.getAll('confirm').length !== 1
          || !equal(form.get('csrf'), candidate.csrf) || form.get('confirm') !== 'yes') { send(response, 403, 'בקשת האישור נחסמה', ''); return; }
        const confirmed = candidate; candidate = undefined;
        const owner = { userId: confirmed.userId, email: confirmed.email, name: confirmed.name, emailVerified: true,
          confirmedAt: new Date(now()).toISOString(), accessToken: confirmed.accessToken, ...(confirmed.refreshToken ? { refreshToken: confirmed.refreshToken } : {}), expiresAt: confirmed.expiresAt };
        await persistOwner(owner);
        completed = true;
        send(response, 200, 'החשבון אושר', '<p>זהות החשבון נשמרה בצורה מוגנת. לא הועברו נתוני תיק. אפשר לחזור לשיחה.</p>', { 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
        onConfirmed({ userId: owner.userId, email: owner.email });
      } catch {
        send(response, 409, 'זהות החשבון לא נשמרה', `<p>ייתכן שכבר נשמר חשבון אחר. לא בוצעה החלפה אוטומטית ולא הועברו נתונים.</p>${retry}`);
      }
      return;
    }
    send(response, 404, 'העמוד לא נמצא', '');
  }
  return { handle, authorizationUrl, clear: () => { candidate = undefined; transaction = undefined; completed = true; } };
}

export async function runOwnerCapture() {
  process.umask(0o077);
  const directory = process.env.AUTH0_SETUP_DIR;
  if (!directory || !/^\/private\/tmp\/livestocks-auth0-setup(?:-[A-Za-z0-9]+)?$/.test(directory)
    || realpathSync(directory) !== directory || !lstatSync(directory).isDirectory() || (lstatSync(directory).mode & 0o077)) throw new Error('Use the existing protected setup directory with mode 0700.');
  const readPrivate = path => {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw new Error('Private file permissions are invalid.');
    return JSON.parse(readFileSync(path, 'utf8'));
  };
  const env = readPrivate(`${directory}/env.json`);
  if (!/^[a-z0-9-]+\.(?:us|eu|au)\.auth0\.com$/.test(env.AUTH0_DOMAIN || '') || !env.AUTH0_CLIENT_SECRET) throw new Error('Auth0 configuration is invalid.');
  const issuer = `https://${env.AUTH0_DOMAIN}/`;
  const jwks = createRemoteJWKSet(new URL('.well-known/jwks.json', issuer));
  const source = readFileSync(new URL('../lib/auth/auth0-token.ts', import.meta.url), 'utf8').replace("from 'jose'", `from '${import.meta.resolve('jose')}'`);
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const { createAuth0TokenVerifier } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const verifyAccess = createAuth0TokenVerifier({ issuer, websiteAudience: env.AUTH0_WEB_AUDIENCE, mcpAudience: env.AUTH0_MCP_AUDIENCE,
    websiteClientId: env.AUTH0_CLIENT_ID, mcpClientId: env.AUTH0_MCP_CLIENT_ID, jwks });
  const lockPath = `${directory}/owner-capture.lock`;
  const lock = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600); closeSync(lock);
  const ownerPath = `${directory}/owner.json`;
  const replace = process.argv.includes('--replace');
  let stopped = false; let timer; let server;
  function stop(code) {
    if (stopped) return; stopped = true; capture.clear(); clearTimeout(timer);
    try { unlinkSync(lockPath); } catch { /* Already removed. */ }
    server?.closeAllConnections(); server?.close(); process.exitCode = code;
  }
  const capture = createOwnerCapture({ env,
    exchangeCode: async (code, verifier) => {
      const response = await fetch(new URL('oauth/token', issuer), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'authorization_code', client_id: env.AUTH0_CLIENT_ID, client_secret: env.AUTH0_CLIENT_SECRET,
          redirect_uri: CALLBACK, code, code_verifier: verifier }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw captureError('TOKEN_EXCHANGE_REJECTED');
      return response.json();
    },
    verifyAccess: async token => {
      try { return await verifyAccess(token, 'web'); }
      catch {
        // Diagnostics never replace the application verifier. Re-verify only to
        // identify an allowlisted claim name; never emit its value or a token.
        const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.AUTH0_WEB_AUDIENCE, algorithms: ['RS256', 'ES256'],
          requiredClaims: ['iss', 'aud', 'sub', 'azp', 'scope', 'role', 'iat', 'exp', 'https://livestocks.app/read_only', 'https://livestocks.app/email_verified'] });
        const checks = [
          ['sub', typeof payload.sub === 'string' && payload.sub.length > 0 && payload.sub.length <= 255 && payload.sub.trim() === payload.sub],
          ['azp', payload.azp === env.AUTH0_CLIENT_ID], ['client_id', payload.client_id === undefined || payload.client_id === env.AUTH0_CLIENT_ID],
          ['role', payload.role === 'authenticated'], ['https://livestocks.app/read_only', payload['https://livestocks.app/read_only'] === false],
          ['https://livestocks.app/email_verified', payload['https://livestocks.app/email_verified'] === true],
          ['scope', typeof payload.scope === 'string' && ['portfolio:read', 'portfolio:write'].every(scope => payload.scope.split(/\s+/).includes(scope))],
          ['iat', Number.isSafeInteger(payload.iat) && payload.iat >= 0 && payload.iat <= Math.floor(Date.now() / 1000) + 5],
          ['exp', Number.isSafeInteger(payload.exp) && payload.exp > payload.iat],
        ];
        throw captureError('ACCESS_CLAIM_INVALID', checks.find(([, valid]) => !valid)?.[0]);
      }
    },
    verifyId: async (token, nonce) => {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.AUTH0_CLIENT_ID, algorithms: ['RS256', 'ES256'],
        requiredClaims: ['sub', 'iss', 'aud', 'iat', 'exp', 'nonce', 'email', 'email_verified'] });
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!equal(payload.nonce, nonce)) throw captureError('NONCE_MISMATCH', 'nonce');
      if (payload.email_verified !== true) throw captureError('EMAIL_UNVERIFIED', 'email_verified');
      if (typeof payload.iat !== 'number' || !Number.isSafeInteger(payload.iat) || payload.iat > Math.floor(Date.now() / 1000) + 5) throw captureError('ID_IAT_INVALID', 'iat');
      if (typeof payload.exp !== 'number' || payload.exp <= payload.iat) throw captureError('ID_EXP_INVALID', 'exp');
      if ((payload.azp !== undefined && payload.azp !== env.AUTH0_CLIENT_ID) || (audiences.length > 1 && payload.azp !== env.AUTH0_CLIENT_ID)) throw captureError('ID_AZP_MISMATCH', 'azp');
      return payload;
    },
    persistOwner: async owner => {
      if (existsSync(ownerPath)) {
        const previous = readPrivate(ownerPath);
        if (previous.userId !== owner.userId && !replace) throw new Error('Replacing another owner requires --replace');
      }
      const temporary = `${directory}/owner-${random()}.tmp`;
      const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      try { writeFileSync(descriptor, JSON.stringify(owner, null, 2)); } finally { closeSync(descriptor); }
      renameSync(temporary, ownerPath); chmodSync(ownerPath, 0o600);
    },
    onDiagnostic: diagnostic => {
      // Every field is a fixed local phase/status, allowlisted code/claim, or boolean.
      // Do not persist exception messages, HTTP bodies, identity values or tokens.
      const entry = { at: new Date().toISOString(), ...diagnostic };
      const diagnosticPath = `${directory}/owner-capture-diagnostic.json`;
      writeFileSync(diagnosticPath, JSON.stringify(entry), { mode: 0o600 }); chmodSync(diagnosticPath, 0o600);
      console.log(JSON.stringify({ status: 'OWNER_CAPTURE_DIAGNOSTIC', ...entry }));
    },
    onConfirmed: identity => {
      console.log(JSON.stringify({ status: 'OWNER_CONFIRMED', ownerPath, userId: identity.userId, email: identity.email, portfolioDataChanged: false }));
      setTimeout(() => stop(0), 1500);
    },
  });
  server = createServer((request, response) => { capture.handle(request, response).catch(() => { if (!response.headersSent) send(response, 500, 'הפעולה לא הושלמה', retry); else response.end(); }); });
  server.requestTimeout = 20000; server.headersTimeout = 10000; server.keepAliveTimeout = 1000;
  process.once('SIGINT', () => stop(130)); process.once('SIGTERM', () => stop(143));
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3109, '127.0.0.1', resolve); });
    timer = setTimeout(() => { console.log(JSON.stringify({ status: 'OWNER_CAPTURE_EXPIRED', portfolioDataChanged: false })); stop(2); }, TTL_MS);
    console.log(JSON.stringify({ status: 'AWAITING_HUMAN_SIGN_IN', localUrl: `${ORIGIN}/start`, authorizeUrl: capture.authorizationUrl(), expiresInMinutes: 15,
      instructions: 'Sign in or register yourself, verify your email, then confirm the displayed account on the local page. No portfolio data is moved.' }));
  } catch { stop(2); throw new Error('Could not start the loopback identity confirmation server.'); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runOwnerCapture().catch(() => { console.error('Owner capture could not start. Check the protected configuration, permissions, and local port. No portfolio data was changed.'); process.exitCode = 2; });
}
