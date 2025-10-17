import { NextRequest, NextResponse } from 'next/server';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

const FORECAST_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_FORECAST_URL === '1' || process.env.FORECAST_URL === '1';

const DEFAULT_FORECAST_BASE = 'http://127.0.0.1:8000';

function buildForecastEndpoint(ticker: string): string {
  const base = (process.env.FORECAST_API_BASE || DEFAULT_FORECAST_BASE).replace(/\/$/, '');
  return `${base}/predict?ticker=${encodeURIComponent(ticker)}`;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  if (!FORECAST_FEATURE_ENABLED) {
    return NextResponse.json(
      { error: 'Forecast feature is disabled' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const params = request.nextUrl.searchParams;
  const ticker = params.get('ticker');

  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker parameter is required' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const normalizedTicker = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9.\-]+$/.test(normalizedTicker)) {
    return NextResponse.json(
      { error: 'Invalid ticker provided' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const endpoint = buildForecastEndpoint(normalizedTicker);

  try {
    const response = await fetch(endpoint, { cache: 'no-store' });

    if (!response.ok) {
      const body = await response.text();
      console.error('Forecast service error:', response.status, body);
      return NextResponse.json(
        { error: 'Forecast service responded with an error' },
        { status: response.status, headers: NO_STORE_HEADERS }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Forecast API error:', error);
    return NextResponse.json(
      { error: 'Failed to reach forecast service' },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}
