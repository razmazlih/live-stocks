import { requireApiPrincipal, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooCandlesData, YahooCandlesError } from '@/lib/services/yahoo-candles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE_HEADERS = PRIVATE_HEADERS;

export async function GET(request: NextRequest) {
  try {
    await requireApiPrincipal(request);
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const resolution = searchParams.get('resolution') || 'D';

    if (!symbol || !from || !to) {
      return NextResponse.json(
        { error: 'Symbol, from, and to parameters are required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const fromSeconds = Number.parseInt(from, 10);
    const toSeconds = Number.parseInt(to, 10);

    if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || fromSeconds >= toSeconds) {
      return NextResponse.json(
        { error: 'Invalid time range provided' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const candleData = await fetchYahooCandlesData(
      symbol,
      fromSeconds,
      toSeconds,
      resolution === '60' || resolution === 'W' || resolution === 'M' ? resolution : 'D',
    );
    return NextResponse.json(candleData, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const authResponse = authenticationResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof YahooCandlesError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: NO_STORE_HEADERS },
      );
    }

    console.error('Candles API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candle data' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
