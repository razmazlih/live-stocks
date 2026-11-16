/** Deploy as an Auth0 Post Login Action with the four named secrets configured. */
exports.onExecutePostLogin = async (event, api) => {
  const secrets = event.secrets || {};
  const websiteClient = secrets.AUTH0_WEBSITE_CLIENT_ID;
  const mcpClient = secrets.AUTH0_MCP_CLIENT_ID;
  const webAudience = secrets.AUTH0_WEB_AUDIENCE;
  const mcpAudience = secrets.AUTH0_MCP_AUDIENCE;
  const clientId = event.client && event.client.client_id;
  const audience = event.resource_server && event.resource_server.identifier;
  const matches = (value, candidates) => typeof value === 'string' && value.length > 0
    && candidates.some(candidate => typeof candidate === 'string' && candidate.trim().length > 0 && candidate.trim() === value);
  const liveStocksClient = matches(clientId, [websiteClient, mcpClient]);
  const liveStocksAudience = matches(audience, [webAudience, mcpAudience]);
  // Auth0 runs this Action for every application in the tenant. Leave unrelated
  // applications untouched, including when LiveStocks configuration is incomplete.
  // Missing configuration must never stamp LiveStocks claims on any token.
  if (!liveStocksClient && !liveStocksAudience) return;

  const configured = [websiteClient, mcpClient, webAudience, mcpAudience]
    .every(value => typeof value === 'string' && value.length > 0 && value.trim() === value);
  if (!configured || websiteClient === mcpClient || webAudience === mcpAudience) {
    api.access.deny('LiveStocks sign-in configuration is unavailable.');
    return;
  }

  const readOnly = clientId === mcpClient;
  if ((clientId !== websiteClient && !readOnly) || audience !== (readOnly ? mcpAudience : webAudience)) {
    api.access.deny('This application is not authorized for the requested LiveStocks API.');
    return;
  }
  if (readOnly) {
    const refresh = event.transaction && event.transaction.protocol === 'oauth2-refresh-token';
    const queryResource = event.request && event.request.query && event.request.query.resource;
    const bodyResource = event.request && event.request.body && event.request.body.resource;
    // Auth0's compatibility profile gives audience precedence over resource.
    // Check the original authorization parameter rather than only the selected API.
    // During refresh, an omitted resource keeps the already-bound grant; any
    // supplied query/body resource must still identify this one MCP endpoint.
    if ((!refresh && queryResource !== mcpAudience)
      || (refresh && [queryResource, bodyResource].some(value => value !== undefined && value !== mcpAudience))) {
      api.access.deny('The requested resource is not authorized for LiveStocks MCP.');
      return;
    }
  }
  if (!event.user || event.user.email_verified !== true) {
    api.access.deny('Verify your email address before accessing LiveStocks.');
    return;
  }

  // Optional origin evidence. Store it on this grant, never on the user: a
  // refresh must not acquire another session's newer authentication timestamp.
  // Missing evidence remains absent; consumers requiring it must fail closed.
  const refreshing = event.transaction?.protocol === 'oauth2-refresh-token';
  const metadata = event.refresh_token?.metadata || {};
  const sessionId = refreshing ? metadata.livestocks_session_id : event.session?.id;
  const createdAt = refreshing ? metadata.livestocks_session_created_at : event.session?.created_at;
  const createdSeconds = typeof createdAt === 'string' ? Date.parse(createdAt) / 1000 : NaN;
  const validOrigin = typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 255
    && Number.isFinite(createdSeconds) && createdSeconds > 0;
  if (validOrigin) {
    api.accessToken.setCustomClaim('https://livestocks.app/auth_session_id', sessionId);
    api.accessToken.setCustomClaim('https://livestocks.app/auth_session_created_at', Math.floor(createdSeconds));
    if (typeof api.refreshToken?.setMetadata === 'function') {
      api.refreshToken.setMetadata('livestocks_session_id', sessionId);
      api.refreshToken.setMetadata('livestocks_session_created_at', createdAt);
    }
  }

  // This literal role must appear on real custom-API access tokens before rollout.
  // If Auth0 strips it, the application verifier rejects the token; no anon fallback.
  for (const token of [api.accessToken, api.idToken]) {
    token.setCustomClaim('role', 'authenticated');
    token.setCustomClaim('https://livestocks.app/read_only', readOnly);
    token.setCustomClaim('https://livestocks.app/email_verified', true);
    if (typeof event.user.email === 'string' && event.user.email.length <= 320
      && /^[^\s@]+@[^\s@]+$/.test(event.user.email)) {
      token.setCustomClaim('https://livestocks.app/email', event.user.email);
    }
  }
  if (readOnly) api.accessToken.removeScope('portfolio:write');
};
