import { z } from 'zod';
import { requireWebPrincipal, requireSameOrigin, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { readFinnhubCredential, saveFinnhubCredential } from '@/lib/auth/credentials';
export const dynamic = 'force-dynamic';
const input = z.object({ token: z.string().trim().min(1).max(512).regex(/^[A-Za-z0-9_.-]+$/) }).strict();
export async function GET() {
  try {
    const principal = await requireWebPrincipal();
    return Response.json({ configured: Boolean(await readFinnhubCredential(principal.userId)) }, { headers: PRIVATE_HEADERS });
  } catch (error) { return authenticationResponse(error) ?? Response.json({ error: 'Could not load market-data configuration' }, { status: 503, headers: PRIVATE_HEADERS }); }
}
export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    const principal = await requireWebPrincipal();
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: 'Enter a valid Finnhub key' }, { status: 400, headers: PRIVATE_HEADERS });
    await saveFinnhubCredential(principal.userId, parsed.data.token);
    return Response.json({ configured: true }, { headers: PRIVATE_HEADERS });
  } catch (error) { return authenticationResponse(error) ?? Response.json({ error: 'Could not save market-data configuration' }, { status: 503, headers: PRIVATE_HEADERS }); }
}
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const principal = await requireWebPrincipal();
    await saveFinnhubCredential(principal.userId, null);
    return Response.json({ configured: false }, { headers: PRIVATE_HEADERS });
  } catch (error) { return authenticationResponse(error) ?? Response.json({ error: 'Could not remove market-data configuration' }, { status: 503, headers: PRIVATE_HEADERS }); }
}
