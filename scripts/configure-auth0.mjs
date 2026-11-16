#!/usr/bin/env node
// Explicitly authorized Auth0-only setup. Never writes secrets into the checkout.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const cli = process.env.AUTH0_CLI_PATH;
const tenant = process.env.AUTH0_SETUP_TENANT;
if (!process.argv.includes('--apply') || !cli || !tenant || !/^[a-z0-9-]+\.(?:us|eu|au)\.auth0\.com$/.test(tenant)) {
  throw new Error('Provide --apply, AUTH0_CLI_PATH and AUTH0_SETUP_TENANT after authorizing this tenant setup.');
}
process.umask(0o077);
const supplied = process.env.AUTH0_SETUP_DIR;
if (supplied && !/^\/private\/tmp\/livestocks-auth0-setup(?:-[A-Za-z0-9]+)?$/.test(supplied)) throw new Error('Setup directory must be a dedicated private temporary directory.');
const directory = supplied || (existsSync('/private/tmp/livestocks-auth0-setup') ? mkdtempSync('/private/tmp/livestocks-auth0-setup-') : '/private/tmp/livestocks-auth0-setup');
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const statePath = resolve(directory, 'state.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { tenant, createdAt: new Date().toISOString() };
if (state.tenant !== tenant) throw new Error('Existing setup belongs to another tenant.');
const save = (name, data) => { const path = resolve(directory, name); writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 }); chmodSync(path, 0o600); };
const checkpoint = () => save('state.json', state);
let requestNumber = 0;
function api(method, path, data) {
  const args = ['api', method, path, '--tenant', tenant, '--json', '--reveal-secrets'];
  if (data !== undefined) args.push('--data', '@-');
  const result = spawnSync(cli, args, { input: data === undefined ? undefined : JSON.stringify(data), encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    const errorFile = `api-error-${++requestNumber}.json`;
    save(errorFile, { method, path, status: result.status, stdout: result.stdout, stderr: result.stderr });
    throw new Error(`Auth0 ${method} ${path} failed; private diagnostic: ${directory}/${errorFile}`);
  }
  try { return result.stdout.trim() ? JSON.parse(result.stdout) : {}; }
  catch { throw new Error(`Auth0 ${method} ${path} did not return JSON`); }
}
try {
  const settings = api('get', 'tenants/settings');
  if (!state.originalSettings) { state.originalSettings = settings; checkpoint(); }
  if (settings.default_audience) throw new Error('Existing default audience requires explicit review; left unchanged.');
  if (settings.resource_parameter_profile !== 'compatibility' || settings.authorization_response_iss_parameter_supported !== true) {
    api('patch', 'tenants/settings', { resource_parameter_profile: 'compatibility', authorization_response_iss_parameter_supported: true });
  }
  const origin = 'https://razmaz-live-stocks.vercel.app';
  const audiences = { web: `${origin}/api/web`, mcp: `${origin}/api/mcp` };
  const resources = api('get', 'resource-servers');
  for (const kind of ['web', 'mcp']) {
    if (state[`${kind}Api`]) continue;
    if (resources.some(item => item.identifier === audiences[kind])) throw new Error('Matching API exists outside this setup checkpoint; review ownership before reuse.');
    state[`${kind}Api`] = api('post', 'resource-servers', { name: `LiveStocks ${kind === 'web' ? 'Web' : 'MCP'} API`, identifier: audiences[kind],
      signing_alg: 'RS256', token_lifetime: 900, token_lifetime_for_web: 900, allow_offline_access: true,
      skip_consent_for_verifiable_first_party_clients: false,
      scopes: [{ value: 'portfolio:read', description: 'Read your LiveStocks portfolio and market data' }, ...(kind === 'web' ? [{ value: 'portfolio:write', description: 'Manage your LiveStocks account data' }] : [])] });
    checkpoint();
  }
  const clients = api('get', 'clients');
  const refresh = { rotation_type: 'rotating', expiration_type: 'expiring', token_lifetime: 604800, infinite_token_lifetime: false, idle_token_lifetime: 86400, infinite_idle_token_lifetime: false, leeway: 0 };
  const specifications = {
    web: { name: 'LiveStocks Web', app_type: 'regular_web', is_first_party: true, oidc_conformant: true, jwt_configuration: { alg: 'RS256' }, token_endpoint_auth_method: 'client_secret_post',
      callbacks: ['http://localhost:3109/auth/callback', `${origin}/auth/callback`], allowed_logout_urls: ['http://localhost:3109', origin], web_origins: ['http://localhost:3109', origin], grant_types: ['authorization_code', 'refresh_token'], refresh_token: refresh },
    mcp: { name: 'LiveStocks MCP', app_type: 'regular_web', is_first_party: false, third_party_security_mode: 'strict', oidc_conformant: true, jwt_configuration: { alg: 'RS256' }, token_endpoint_auth_method: 'client_secret_post',
      callbacks: ['http://localhost:3110/callback'], grant_types: ['authorization_code', 'refresh_token'], refresh_token: refresh },
    management: { name: 'LiveStocks Grant Manager', app_type: 'non_interactive', is_first_party: true, oidc_conformant: true, token_endpoint_auth_method: 'client_secret_post', grant_types: ['client_credentials'] },
  };
  for (const [kind, specification] of Object.entries(specifications)) {
    if (state[`${kind}Client`]) continue;
    if (clients.some(item => item.name === specification.name)) throw new Error('Matching application name already exists outside this setup checkpoint.');
    state[`${kind}Client`] = api('post', 'clients', specification); checkpoint();
  }
  if (!state.managementGrant) {
    state.managementGrant = api('post', 'client-grants', { client_id: state.managementClient.client_id, audience: `https://${tenant}/api/v2/`, scope: ['read:grants', 'delete:grants'] }); checkpoint();
  }
  if (!state.mcpUserGrant) {
    state.mcpUserGrant = api('post', 'client-grants', { client_id: state.mcpClient.client_id, audience: audiences.mcp, subject_type: 'user', scope: ['portfolio:read'] }); checkpoint();
  }
  if (!state.action) {
    state.action = api('post', 'actions/actions', { name: 'LiveStocks account claims', supported_triggers: [{ id: 'post-login', version: 'v3' }], runtime: 'node22',
      code: readFileSync(new URL('../plugins/livestocks/auth0/post-login-action.js', import.meta.url), 'utf8'),
      secrets: [{ name: 'AUTH0_WEBSITE_CLIENT_ID', value: state.webClient.client_id }, { name: 'AUTH0_MCP_CLIENT_ID', value: state.mcpClient.client_id },
        { name: 'AUTH0_WEB_AUDIENCE', value: audiences.web }, { name: 'AUTH0_MCP_AUDIENCE', value: audiences.mcp }] }); checkpoint();
  }
  if (process.argv.includes('--update-action')) {
    api('patch', `actions/actions/${state.action.id}`, { code: readFileSync(new URL('../plugins/livestocks/auth0/post-login-action.js', import.meta.url), 'utf8') });
    state.actionDeployed = false; checkpoint();
  }
  if (!state.actionDeployed) { api('post', `actions/actions/${state.action.id}/deploy`, {}); state.actionDeployed = true; checkpoint(); }
  if (!state.actionBound) {
    const original = api('get', 'actions/triggers/post-login/bindings');
    if (original.next) throw new Error('Paginated bindings need explicit review before append.');
    state.originalBindings = original; checkpoint();
    const bindings = (original.bindings || []).map(binding => ({ ref: { type: 'action_id', value: binding.action.id }, display_name: binding.display_name }));
    if (!bindings.some(binding => binding.ref.value === state.action.id)) bindings.push({ ref: { type: 'action_id', value: state.action.id }, display_name: 'LiveStocks account claims' });
    api('patch', 'actions/triggers/post-login/bindings', { bindings }); state.actionBound = true; checkpoint();
  }
  const connections = api('get', 'connections');
  state.connections = connections.filter(item => ['google-oauth2', 'auth0'].includes(item.strategy)).map(({ id, name, strategy }) => ({ id, name, strategy })); checkpoint();
  if (!state.connectionsEnabled) {
    for (const connection of state.connections) {
      api('patch', `connections/${connection.id}/clients`, [
        { client_id: state.webClient.client_id, status: true },
        { client_id: state.managementClient.client_id, status: false },
      ]);
    }
    state.connectionsEnabled = true; checkpoint();
  }
  if (process.argv.includes('--promote-login-connections') && !state.domainConnectionsConfigured) {
    const selected = connections.filter(connection => connection.name === 'google-oauth2' || connection.name === 'Username-Password-Authentication');
    if (selected.length !== 2) throw new Error('Expected exactly the two approved login sources.');
    state.originalDomainConnections = selected.map(({ id, name, is_domain_connection }) => ({ id, name, is_domain_connection })); checkpoint();
    for (const connection of state.originalDomainConnections) {
      if (!connection.is_domain_connection) api('patch', `connections/${connection.id}`, { is_domain_connection: true });
    }
    state.domainConnectionsConfigured = true; checkpoint();
  }
  if (!state.syntheticUsers) state.syntheticUsers = [];
  const database = state.connections.find(connection => connection.strategy === 'auth0');
  if (!database) throw new Error('No database connection found for isolated synthetic accounts.');
  while (state.syntheticUsers.length < 2) {
    const email = `livestocks-gate-${randomBytes(8).toString('hex')}@example.invalid`;
    const password = `G!9a${randomBytes(24).toString('base64url')}`;
    const user = api('post', 'users', { connection: database.name, email, password, email_verified: true, verify_email: false,
      app_metadata: { livestocks_synthetic_gate: true }, name: `LiveStocks Gate ${state.syntheticUsers.length + 1}` });
    state.syntheticUsers.push({ user_id: user.user_id, email, password, connection: database.name }); checkpoint();
  }
  const env = { AUTH0_DOMAIN: tenant, AUTH0_CLIENT_ID: state.webClient.client_id, AUTH0_CLIENT_SECRET: state.webClient.client_secret,
    AUTH0_MCP_CLIENT_ID: state.mcpClient.client_id, AUTH0_MCP_CLIENT_SECRET: state.mcpClient.client_secret,
    AUTH0_WEB_AUDIENCE: audiences.web, AUTH0_MCP_AUDIENCE: audiences.mcp,
    AUTH0_MANAGEMENT_CLIENT_ID: state.managementClient.client_id, AUTH0_MANAGEMENT_CLIENT_SECRET: state.managementClient.client_secret,
    APP_BASE_URL: 'http://localhost:3109', AUTH0_SECRET: state.sessionSecret || randomBytes(32).toString('hex'),
    CREDENTIAL_ENCRYPTION_KEY: state.encryptionKey || randomBytes(32).toString('hex') };
  state.sessionSecret = env.AUTH0_SECRET; state.encryptionKey = env.CREDENTIAL_ENCRYPTION_KEY; checkpoint(); save('env.json', env);
  console.log(JSON.stringify({ status: 'CONFIGURED_PENDING_LIVE_GATE', directory, webClientId: state.webClient.client_id, mcpClientId: state.mcpClient.client_id, managementClientId: state.managementClient.client_id, actionId: state.action.id }));
} catch (error) {
  checkpoint(); console.error(error instanceof Error ? error.message : 'Auth0 setup failed'); process.exitCode = 1;
}
