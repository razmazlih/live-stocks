import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { getBetterAuth } from '@/lib/auth/better-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth = getBetterAuth();
  if (!auth) return Response.json({ error: 'Authentication is not configured' }, { status: 503 });
  return oauthProviderAuthServerMetadata(auth)(request);
}
