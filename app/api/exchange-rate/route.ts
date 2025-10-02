import { NextResponse } from 'next/server';
import { ExchangeRateResponse } from '@/types';

export const revalidate = 3600;

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { next: { revalidate: 3600 } });
      if (response.ok) return response;
      if (response.status === 429 && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries reached');
}

export async function GET() {
  try {
    const url = process.env.EXCHANGE_RATE_URL || 'https://open.er-api.com/v6/latest/USD';
    const response = await fetchWithRetry(url);
    const data: ExchangeRateResponse = await response.json();

    if (!data.rates || !data.rates.ILS) {
      return NextResponse.json(
        { error: 'ILS rate not available' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      usdToIls: data.rates.ILS,
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
