import { z } from 'zod';
import { requireWebPrincipal, requireSameOrigin, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { reviewScreenshotSync, applyScreenshotSync } from '@/lib/screenshot-sync-server';
export const dynamic = 'force-dynamic';
const input = z.object({ token: z.string().min(1).max(50000), action: z.enum(['review', 'apply']) }).strict();
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const principal = await requireWebPrincipal();
    const raw = await request.text();
    if (raw.length > 52000) return Response.json({ error: 'Request too large' }, { status: 413, headers: PRIVATE_HEADERS });
    const body = input.parse(JSON.parse(raw));
    const data = body.action === 'apply' ? await applyScreenshotSync(principal, body.token) : await reviewScreenshotSync(principal, body.token);
    return Response.json(data, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return authenticationResponse(error) ?? Response.json({ error: error instanceof z.ZodError || error instanceof SyntaxError ? 'בקשה לא תקינה.' : error instanceof Error ? error.message : 'הסנכרון אינו זמין.' }, { status: 409, headers: PRIVATE_HEADERS });
  }
}
