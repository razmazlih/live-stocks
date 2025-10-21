import { NextResponse } from 'next/server';
import { extractExchangeRate, fetchExchangeRateResponse } from '@/lib/services/exchange-rate';

export const revalidate = 3600;

export async function GET() {
  try {
    const data = await fetchExchangeRateResponse({
      init: { next: { revalidate } },
    });
    const rate = extractExchangeRate(data, 'ILS');

    if (rate === null) {
      return NextResponse.json(
        { error: 'ILS rate not available' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      usdToIls: rate,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Exchange rate API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exchange rate' },
      { status: 500 }
    );
  }
}
