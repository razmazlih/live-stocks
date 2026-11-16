import { requireApiPrincipal, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { NextResponse } from 'next/server';
import { extractExchangeRate, fetchExchangeRateResponse } from '@/lib/services/exchange-rate';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireApiPrincipal(request);
    const data = await fetchExchangeRateResponse({
      init: { next: { revalidate: 3600 } },
    });
    const rate = extractExchangeRate(data, 'ILS');

    if (rate === null) {
      return NextResponse.json(
        { error: 'ILS rate not available' },
        { status: 404, headers: PRIVATE_HEADERS }
      );
    }

    return NextResponse.json({
      usdToIls: rate,
      timestamp: new Date().toISOString(),
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    const authResponse = authenticationResponse(error);
    if (authResponse) return authResponse;
    console.error('Exchange rate API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exchange rate' },
      { status: 500, headers: PRIVATE_HEADERS }
    );
  }
}
