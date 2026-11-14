#!/usr/bin/env node
/** Isolated GoTrue compatibility probe. Never point this at a production project. */
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SignJWT, jwtVerify } from 'jose';

const authUrl = (process.env.GATE_AUTH_URL ?? 'http://127.0.0.1:54999').replace(/\/$/, '');
const siteUrl = (process.env.GATE_SITE_URL ?? 'http://127.0.0.1:54876').replace(/\/$/, '');
const resource = 'https://razmaz-live-stocks.vercel.app/api/mcp';
const evilResource = 'https://unrelated.example.invalid/mcp';
const redirectUri = `${siteUrl}/callback`;
const secret = process.env.GATE_JWT_SECRET;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeEvidence = (value, pattern) => typeof value === 'string' && pattern.test(value) ? value : null;
const report = {
  generatedAt: new Date().toISOString(),
  status: 'INCOMPLETE',
  environment: 'isolated-local-GoTrue',
  signatureAlgorithm: 'HS256 (isolated test only)',
  runtimeEvidence: {
    version: safeEvidence(process.env.GATE_AUTH_VERSION, /^v?\d+\.\d+\.\d+(?:[-.][a-zA-Z0-9]+)*$/),
    binarySha256: safeEvidence(process.env.GATE_AUTH_BINARY_SHA256, /^[a-f0-9]{64}$/i),
    archiveSha256: safeEvidence(process.env.GATE_AUTH_ARCHIVE_SHA256, /^[a-f0-9]{64}$/i),
    source: 'Runner-supplied evidence; probe does not independently identify the running binary',
  },
  resource,
  limitations: ['Not a production ES256/JWKS test', 'Not a real ChatGPT host test', 'Does not verify database RLS or revoked-token REST denial'],
  cases: [],
  skippedGates: ['Production ES256/JWKS discovery', 'Real ChatGPT authorization', 'Database RLS isolation and write denial', 'Immediate revoked-access-token REST denial'],
};
let phase = 'configuration';
let approvedClientId;
let key;

function requireLocal(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
    || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('LOCAL_ENDPOINT_REQUIRED');
  }
}

function oauthFailure(data = {}) {
  const allowed = new Set(['invalid_request', 'invalid_target', 'invalid_grant', 'access_denied',
    'invalid_client', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope', 'server_error', 'temporarily_unavailable']);
  const code = data.error ?? data.error_code;
  return {
    oauthError: allowed.has(code) ? code : null,
    errorMentionsResource: typeof data.error_description === 'string'
      && /\b(resource|audience|target)\b/i.test(data.error_description),
  };
}

async function http(path, { method = 'GET', bearer, body, form, origin = false } = {}) {
  const headers = {};
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (origin) headers.Origin = new URL(siteUrl).origin;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(Object.entries(form).filter(([, value]) => value !== undefined));
  }
  const response = await fetch(`${authUrl}${path}`, {
    method, headers, body: payload, redirect: 'manual', signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  if (response.status >= 500 || response.status === 429) throw new Error(`HTTP_${response.status}`);
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* Never print response bodies. */ }
  return { status: response.status, ok: response.ok, data, location: response.headers.get('location') };
}

async function inspectToken(token, expectedSubject) {
  const flags = { signatureAndLifetime: false, issuer: false, audience: false, approvedClient: false, subject: false, session: false, readOnly: false };
  if (typeof token !== 'string') return { accepted: false, flags };
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], requiredClaims: ['exp', 'iat', 'sub', 'iss', 'aud'] });
    flags.signatureAndLifetime = typeof payload.iat === 'number' && Number.isSafeInteger(payload.iat)
      && payload.iat <= Math.floor(Date.now() / 1000) + 5;
    flags.issuer = payload.iss === authUrl;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    flags.audience = audiences.every(value => typeof value === 'string' && value.length > 0) && audiences.includes(resource);
    flags.approvedClient = typeof payload.client_id === 'string' && uuidPattern.test(payload.client_id) && payload.client_id === approvedClientId;
    flags.subject = typeof payload.sub === 'string' && uuidPattern.test(payload.sub) && payload.sub === expectedSubject;
    flags.session = typeof payload.session_id === 'string' && uuidPattern.test(payload.session_id);
    flags.readOnly = payload.read_only === true;
  } catch { /* Invalid JWTs are represented only by flags. */ }
  return { accepted: Object.values(flags).every(Boolean), flags };
}

async function authorization(user, client, requestedResource, decision = 'approve') {
  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(24).toString('base64url');
  const query = new URLSearchParams({ response_type: 'code', client_id: client.client_id,
    redirect_uri: redirectUri, scope: 'email', state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  if (requestedResource !== undefined) query.set('resource', requestedResource);
  const start = await http(`/oauth/authorize?${query}`);
  if (!start.location) return { stage: 'authorize', status: start.status, ...oauthFailure(start.data) };
  const consentUrl = new URL(start.location, authUrl);
  const authorizationId = consentUrl.searchParams.get('authorization_id');
  if (!authorizationId) {
    if (`${consentUrl.origin}${consentUrl.pathname}` !== redirectUri || consentUrl.searchParams.get('state') !== state) {
      return { stage: 'callback_validation', status: 0 };
    }
    return { stage: 'authorize', status: start.status, denied: consentUrl.searchParams.get('error') === 'access_denied',
      ...oauthFailure(Object.fromEntries(consentUrl.searchParams)) };
  }
  const details = await http(`/oauth/authorizations/${encodeURIComponent(authorizationId)}`, { bearer: user.token, origin: true });
  if (!details.ok) return { stage: 'details', status: details.status };
  const resourceVisibleInDetails = Object.hasOwn(details.data, 'resource');
  let destination = details.data.redirect_url;
  if (!destination) {
    const consent = await http(`/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`, {
      method: 'POST', bearer: user.token, origin: true, body: { action: decision },
    });
    if (!consent.ok) return { stage: 'consent', status: consent.status };
    destination = consent.data.redirect_url;
  } else if (decision === 'deny') {
    return { stage: 'consent', status: details.status, autoApprovedBeforeDeny: true };
  }
  if (typeof destination !== 'string') return { stage: 'consent_redirect', status: 0 };
  const callback = new URL(destination);
  if (`${callback.origin}${callback.pathname}` !== redirectUri || callback.searchParams.get('state') !== state) {
    return { stage: 'callback_validation', status: 0 };
  }
  return { stage: 'authorized', status: 200, verifier, code: callback.searchParams.get('code'),
    denied: callback.searchParams.get('error') === 'access_denied', resourceVisibleInDetails };
}

async function exchange(user, client, authResource, tokenResource) {
  const grant = await authorization(user, client, authResource);
  if (!grant.code) return { stage: grant.stage, status: grant.status, oauthError: grant.oauthError ?? null,
    errorMentionsResource: grant.errorMentionsResource ?? false, accepted: false, tokenIssued: false };
  const response = await http('/oauth/token', { method: 'POST', form: {
    grant_type: 'authorization_code', code: grant.code, client_id: client.client_id,
    client_secret: client.client_secret, redirect_uri: redirectUri, code_verifier: grant.verifier, resource: tokenResource,
  } });
  return { stage: 'token', status: response.status, tokenIssued: typeof response.data.access_token === 'string',
    ...oauthFailure(response.data),
    resourceVisibleInDetails: grant.resourceVisibleInDetails,
    ...await inspectToken(response.data.access_token, user.id),
    refreshToken: response.data.refresh_token };
}

function record(name, outcome, expectedAccepted, resources = {}) {
  const { refreshToken: _secret, ...sanitized } = outcome;
  let result = 'INCOMPLETE';
  if (outcome.tokenIssued && outcome.flags?.signatureAndLifetime) {
    result = outcome.accepted === expectedAccepted ? 'PASS' : 'FAIL';
  } else if (!expectedAccepted && name !== 'unapproved_client'
    && ['authorize', 'token', 'refresh'].includes(outcome.stage)
    && [302, 303, 400, 403].includes(outcome.status)
    && (outcome.oauthError === 'invalid_target'
      || (['invalid_request', 'invalid_grant'].includes(outcome.oauthError) && outcome.errorMentionsResource))) {
    result = 'PASS';
  }
  report.cases.push({ name, ...resources, ...sanitized,
    result });
}

async function main() {
  requireLocal(authUrl);
  requireLocal(siteUrl);
  const databaseUrl = process.env.GATE_DATABASE_URL;
  if (databaseUrl) {
    const database = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(database.protocol)
      || database.hostname !== '127.0.0.1' || database.port !== '54998'
      || database.pathname !== '/postgres' || database.username !== 'postgres'
      || (database.search !== '' && database.search !== '?sslmode=disable') || database.hash) {
      throw new Error('ISOLATED_DATABASE_REQUIRED');
    }
  }
  if (!secret || secret.length < 32) throw new Error('LOCAL_SECRET_REQUIRED');
  key = new TextEncoder().encode(secret);
  const adminToken = await new SignJWT({ role: 'service_role', aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').setIssuer(authUrl).sign(key);
  const users = [];
  for (let index = 0; index < 2; index++) {
    phase = `create_test_user_${index + 1}`;
    const credentials = { email: `gate-${randomBytes(12).toString('hex')}@example.invalid`, password: randomBytes(32).toString('base64url') };
    const created = await http('/admin/users', { method: 'POST', bearer: adminToken, body: { ...credentials, email_confirm: true } });
    if (!created.ok) throw new Error(`HTTP_${created.status}`);
    const login = await http('/token?grant_type=password', { method: 'POST', body: credentials });
    if (!login.ok || !login.data.access_token || !login.data.user?.id) throw new Error(`HTTP_${login.status}`);
    users.push({ id: login.data.user.id, token: login.data.access_token });
  }
  const makeClient = async (name) => {
    const response = await http('/admin/oauth/clients', { method: 'POST', bearer: adminToken,
      body: { client_name: name, client_type: 'confidential', redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'client_secret_post', grant_types: ['authorization_code', 'refresh_token'] } });
    if (!response.ok || !response.data.client_id || !response.data.client_secret) throw new Error(`HTTP_${response.status}`);
    return response.data;
  };
  phase = 'create_approved_client';
  const client = await makeClient('LiveStocks isolated gate');
  approvedClientId = client.client_id;
  if (databaseUrl) {
    phase = 'register_hook_client';
    if (!uuidPattern.test(approvedClientId)) {
      throw new Error('INVALID_CLIENT_UUID');
    }
    execFileSync(process.env.GATE_PSQL_PATH ?? 'psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-c',
      `insert into private.gate_client (singleton, approved_client_id) values (true, '${approvedClientId}'::uuid) on conflict (singleton) do update set approved_client_id = excluded.approved_client_id;`],
    { stdio: ['ignore', 'pipe', 'pipe'], env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', PGAPPNAME: 'livestocks-isolated-oauth-gate',
      PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null', PGSYSCONFDIR: '/dev/null',
    }, timeout: 20_000 });
  }
  phase = 'positive_control';
  const positive = await exchange(users[0], client, resource, resource);
  record(phase, positive, true, { authorizationResource: resource, exchangeResource: resource });
  if (!positive.accepted) {
    report.incompleteReason = 'Positive control failed: resource-negative results would be inconclusive.';
    return;
  }
  phase = 'deny_consent';
  const denied = await authorization(users[1], client, resource, 'deny');
  report.cases.push({ name: phase, status: denied.status, stage: denied.stage,
    result: denied.denied === true && !denied.code ? 'PASS' : denied.code || denied.autoApprovedBeforeDeny ? 'FAIL' : 'INCOMPLETE' });
  phase = 'second_user_binding';
  record(phase, await exchange(users[1], client, resource, resource), true);
  for (const [name, authResource, exchangeResource] of [
    ['wrong_resource', evilResource, evilResource],
    ['missing_resource', undefined, undefined],
    ['exchange_resource_mismatch', resource, evilResource],
    ['authorization_resource_mismatch', evilResource, resource],
  ]) {
    phase = name;
    record(name, await exchange(users[0], client, authResource, exchangeResource), false,
      { authorizationResource: authResource ?? null, exchangeResource: exchangeResource ?? null });
  }
  for (const [name, refreshResource, expectedAccepted] of [
    ['valid_refresh', resource, true], ['wrong_resource_refresh', evilResource, false],
    // Omitting resource on refresh must retain the original authorized target.
    ['omitted_resource_refresh_retains_binding', undefined, true],
  ]) {
    phase = name;
    const seed = await exchange(users[0], client, resource, resource);
    if (!seed.accepted || typeof seed.refreshToken !== 'string') throw new Error('REFRESH_POSITIVE_CONTROL_FAILED');
    const refreshed = await http('/oauth/token', { method: 'POST', form: {
      grant_type: 'refresh_token', refresh_token: seed.refreshToken, client_id: client.client_id,
      client_secret: client.client_secret, resource: refreshResource,
    } });
    record(name, { stage: 'refresh', status: refreshed.status, tokenIssued: typeof refreshed.data.access_token === 'string',
      ...oauthFailure(refreshed.data),
      ...await inspectToken(refreshed.data.access_token, users[0].id) }, expectedAccepted,
    { authorizationResource: resource, refreshResource: refreshResource ?? null });
  }
  phase = 'unapproved_client';
  const otherClient = await makeClient('Unapproved isolated gate client');
  record(phase, await exchange(users[0], otherClient, resource, resource), false);
  report.status = report.cases.some(item => item.result === 'FAIL') ? 'FAIL'
    : report.cases.some(item => item.result === 'INCOMPLETE') ? 'INCOMPLETE' : 'PASS_LOCAL';
}

try {
  await main();
} catch (error) {
  report.incompletePhase = phase;
  report.incompleteReason = error instanceof Error && /^(HTTP_\d+|[A-Z_]+)$/.test(error.message)
    ? error.message : 'Unexpected probe or network error; details suppressed to protect credentials.';
  report.status = report.cases.some(item => item.result === 'FAIL' && item.name !== 'positive_control') ? 'FAIL' : 'INCOMPLETE';
}
const output = `${JSON.stringify(report, null, 2)}\n`;
if (process.env.GATE_REPORT_PATH) {
  await mkdir(dirname(process.env.GATE_REPORT_PATH), { recursive: true });
  await writeFile(process.env.GATE_REPORT_PATH, output, { mode: 0o600 });
}
process.stdout.write(output);
process.exitCode = report.status === 'PASS_LOCAL' ? 0 : report.status === 'FAIL' ? 1 : 2;
