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
  // Development may serve browser cookies locally while retaining the database's
  // registered issuer, audiences and identity mappings. Never derive trust from Host.
  let browserOrigin = url.origin;
  if (process.env.LOCAL_AUTH_ORIGIN) {
    const browser = new URL(process.env.LOCAL_AUTH_ORIGIN);
    if (process.env.NODE_ENV !== 'development' || browser.protocol !== 'http:'
      || !['localhost', '127.0.0.1', '[::1]'].includes(browser.hostname)
      || browser.username || browser.password || browser.search || browser.hash || browser.pathname !== '/') {
      throw new Error('Local authentication origin requires development and an HTTP loopback origin');
    }
    browserOrigin = browser.origin;
  }
  return { origin: browserOrigin, issuer: `${url.origin}/api/auth`, websiteAudience: `${url.origin}/api/web`,
    mcpAudience: `${url.origin}/api/mcp`, websiteClientId: BETTER_AUTH_WEBSITE_CLIENT_ID,
    mcpClientId: BETTER_AUTH_MCP_CLIENT_ID, secret: BETTER_AUTH_SECRET, databaseUrl: BETTER_AUTH_DATABASE_URL };
}

export function isPasswordAuthEnabled(): boolean { return process.env.PASSWORD_AUTH_ENABLED === 'true'; }

export function getAuthSmtpPort(): number | null {
  const value = process.env.SMTP_PORT?.trim();
  if (!value || !/^\d+$/.test(value)) return null;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

export const PASSWORD_AUTH_PATHS = ['/sign-in/email', '/sign-up/email', '/request-password-reset', '/reset-password', '/verify-email', '/send-verification-email', '/change-password', '/set-password', '/verify-password', '/change-email'];
export function isPasswordAuthPath(path: string): boolean { return PASSWORD_AUTH_PATHS.includes(path) || path.startsWith('/reset-password/'); }

export function getAuthPublicOptions() {
  let configured = false;
  try { betterAuthConfiguration(); configured = true; } catch { /* Public pages render while setup is incomplete. */ }
  return { configured, demoEnabled: process.env.NODE_ENV === 'development', passwordEnabled: isPasswordAuthEnabled(),
    googleEnabled: configured && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    emailDeliveryConfigured: isPasswordAuthEnabled() && getAuthSmtpPort() !== null && Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
  };
}
