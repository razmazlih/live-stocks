import { PRIVATE_HEADERS } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

/** Do not expose merge actions until proof, data-preservation and revocation gates pass. */
export async function GET() {
  return Response.json({ available: false }, { headers: PRIVATE_HEADERS });
}
