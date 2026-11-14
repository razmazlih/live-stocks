import 'server-only';

export type BetterAuthConfiguration = {
  origin: string; issuer: string; websiteAudience: string; mcpAudience: string;
  websiteClientId: string; mcpClientId: string; secret: string; databaseUrl: string;
};

export function betterAuthConfiguration(): BetterAuthConfiguration {
  const { APP_BASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_DATABASE_URL, BETTER_AUTH_WEBSITE_CLIENT_ID, BETTER_AUTH_MCP_CLIENT_ID } = process.env;
  if (!APP_BASE_URL || !BETTER_AUTH_SECRET || BETTER_AUTH_SECRET.length < 32 || !BETTER_AUTH_DATABASE_URL
    || !BETTER_AUTH_WEBSITE_CLIENT_ID || !BETTER_AUTH_MCP_CLIENT_ID || BETTER_AUTH_WEBSITE_CLIENT_ID === BETTER_AUTH_MCP_CLIENT_ID) {
    throw new Error('Authentication is not configured');
  }
  const url = new URL(APP_BASE_URL);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:' && process.env.NODE_ENV !== 'production'))
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid authentication origin');
  for (const id of [BETTER_AUTH_WEBSITE_CLIENT_ID, BETTER_AUTH_MCP_CLIENT_ID]) {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new Error('Invalid authentication client identifier');
  }
  return { origin: url.origin, issuer: `${url.origin}/api/auth`, websiteAudience: `${url.origin}/api/web`,
    mcpAudience: `${url.origin}/api/mcp`, websiteClientId: BETTER_AUTH_WEBSITE_CLIENT_ID,
    mcpClientId: BETTER_AUTH_MCP_CLIENT_ID, secret: BETTER_AUTH_SECRET, databaseUrl: BETTER_AUTH_DATABASE_URL };
}

export function getAuthPublicOptions() {
  let configured = false;
  try { betterAuthConfiguration(); configured = true; } catch { /* Public pages render while setup is incomplete. */ }
  return { configured,
    googleEnabled: configured && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    emailDeliveryConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
  };
}
