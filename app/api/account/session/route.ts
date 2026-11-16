import { getAuthPublicOptions } from '@/lib/auth/better-auth-config';
import { requireWebPrincipal, bootstrapWebAccount, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const options = getAuthPublicOptions();
  if (!options.configured) return Response.json({ configured: false, user: null, options }, { headers: PRIVATE_HEADERS });
  try {
    const principal = await requireWebPrincipal();
    await bootstrapWebAccount(principal);
    return Response.json({ configured: true, options, user: { id: principal.userId, email: principal.accountEmail ?? '',
      name: principal.accountName ?? '', emailVerified: true } }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return authenticationResponse(error) ?? Response.json({ error: 'Could not load account' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
