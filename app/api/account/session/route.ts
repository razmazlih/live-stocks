import { getAuth0, isAuth0Configured } from '@/lib/auth/auth0';
import { requireWebPrincipal, bootstrapWebAccount, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!isAuth0Configured()) return Response.json({ configured: false, user: null }, { headers: PRIVATE_HEADERS });
  try {
    const principal = await requireWebPrincipal();
    await bootstrapWebAccount(principal);
    const session = await getAuth0()!.getSession();
    return Response.json({ configured: true, user: { id: principal.userId, email: session!.user.email ?? '',
      name: session!.user.name ?? '', emailVerified: true } }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return authenticationResponse(error) ?? Response.json({ error: 'Could not load account' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
