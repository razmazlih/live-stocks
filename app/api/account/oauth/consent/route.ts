import { z } from 'zod';
import { betterAuthConfiguration } from '@/lib/auth/better-auth-config';
import { ConsentError, decideConsent } from '@/lib/auth/oauth-consent';

export const dynamic = 'force-dynamic';
const PRIVATE = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', Vary: 'Cookie' };
const bodySchema = z.object({ query: z.string().min(1).max(16_384), receipt: z.string().min(1).max(2048), accept: z.boolean() }).strict();
export async function POST(request: Request) {
  try {
    const config = betterAuthConfiguration();
    if (request.headers.get('origin') !== config.origin || request.headers.get('sec-fetch-site') === 'cross-site') {
      return Response.json({ code: 'INVALID_ORIGIN' }, { status: 403, headers: PRIVATE });
    }
    if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 20_000) {
      return Response.json({ code: 'INVALID_REQUEST' }, { status: 400, headers: PRIVATE });
    }
    const text = await request.text();
    if (text.length > 20_000) return Response.json({ code: 'INVALID_REQUEST' }, { status: 400, headers: PRIVATE });
    const input = bodySchema.safeParse(JSON.parse(text));
    if (!input.success) return Response.json({ code: 'INVALID_REQUEST' }, { status: 400, headers: PRIVATE });
    const url = await decideConsent(input.data, new Headers(request.headers));
    return Response.json({ url }, { headers: PRIVATE });
  } catch (error) {
    const code = error instanceof ConsentError ? error.code : 'UNAVAILABLE';
    return Response.json({ code }, { status: code === 'UNAVAILABLE' ? 503 : code === 'SIGN_IN_REQUIRED' ? 401 : code === 'ACCOUNT_CHANGED' ? 409 : 400, headers: PRIVATE });
  }
}
