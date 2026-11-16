'use client';

import { createAuthClient } from 'better-auth/react';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';

/** Same-origin cookies only. The browser never stores API or refresh tokens. */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [oauthProviderClient()],
});
