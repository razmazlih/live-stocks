import { NextRequest, NextResponse } from 'next/server';
import { requireApiPrincipal, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { readFinnhubCredential } from '@/lib/auth/credentials';
import { buildPortfolioResponse } from '@/lib/server/portfolio-response';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const principal = await requireApiPrincipal(request);
    const body = await request.json().catch(() => ({}));
    const finnhubToken = await readFinnhubCredential(principal.userId);
    return buildPortfolioResponse({ supabase: principal.supabase, userId: principal.userId, finnhubToken }, body ?? {});
  } catch (error) {
    const authResponse = authenticationResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({ error: 'Failed to generate portfolio snapshot' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
