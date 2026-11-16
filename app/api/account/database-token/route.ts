import { requireWebPrincipal, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const principal = await requireWebPrincipal();
    return Response.json({ accessToken: principal.accessToken, userId: principal.userId, expiresAt: principal.expiresAt }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return authenticationResponse(error) ?? Response.json({ error: 'Could not refresh account access' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
