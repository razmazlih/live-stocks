import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextResponse } from 'next/server';
import { safeSignInReturnTo } from './return-to';

let client: Auth0Client | null = null;

export function isAuth0Configured(): boolean {
  return ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET', 'APP_BASE_URL', 'AUTH0_WEB_AUDIENCE', 'AUTH0_MCP_CLIENT_ID', 'AUTH0_MCP_AUDIENCE']
    .every((name) => Boolean(process.env[name]?.trim()));
}

/** Build lazily so unconfigured previews can render the public sign-in page. */
export function getAuth0(): Auth0Client | null {
  if (!isAuth0Configured()) return null;
  if (!client) {
    const appBaseUrl = process.env.APP_BASE_URL!;
    client = new Auth0Client({
      authorizationParameters: {
        audience: process.env.AUTH0_WEB_AUDIENCE,
        scope: 'openid profile email offline_access portfolio:read portfolio:write',
        ui_locales: 'he',
      },
      enableAccessTokenEndpoint: false,
      onCallback: async (error, context) => {
        const returnTo = safeSignInReturnTo(context.returnTo);
        const destination = new URL(error ? '/sign-in?error=sign-in-failed' : returnTo, appBaseUrl);
        if (error && returnTo !== '/') destination.searchParams.set('returnTo', returnTo);
        const response = NextResponse.redirect(destination);
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      },
      session: { rolling: true, inactivityDuration: 24 * 60 * 60, absoluteDuration: 7 * 24 * 60 * 60 },
    });
  }
  return client;
}
