import { z } from 'zod';
import { confirmOwner, OwnerConfirmationError, ownerConfirmationConfiguration } from '@/lib/auth/owner-confirmation';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', Vary: 'Cookie' };
export async function POST(request: Request) {
  try {
    const config = ownerConfirmationConfiguration();
    if (request.headers.get('origin') !== config.origin || request.headers.get('sec-fetch-site') === 'cross-site'
      || !request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 3072) {
      throw new OwnerConfirmationError(403);
    }
    const text = await request.text();
    if (text.length > 3072) throw new OwnerConfirmationError(400);
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new OwnerConfirmationError(400); }
    const input = z.object({ confirm: z.literal(true), token: z.string().min(1).max(2048) }).strict().safeParse(body);
    if (!input.success) throw new OwnerConfirmationError(400);
    return Response.json(await confirmOwner(new Headers(request.headers), input.data.token), { headers });
  } catch (error) {
    return Response.json({ error: 'Owner confirmation unavailable' }, { status: error instanceof OwnerConfirmationError ? error.status : 503, headers });
  }
}
