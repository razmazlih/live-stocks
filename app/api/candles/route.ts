import { NextRequest, NextResponse } from 'next/server';
import { CandleData } from '@/types';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export const dynamic = 'force-dynamic';
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const resolution = searchParams.get('resolution') || 'D';
    const token = searchParams.get('token') || process.env.FINNHUB_TOKEN;

    if (!symbol || !from || !to) {
      return NextResponse.json(
        { error: 'Symbol, from, and to parameters are required' },
        { status: 400 }
      );
    }

    if (!token) {
      return NextResponse.json(
        { error: 'Finnhub token is not configured' },
        { status: 500 }
      );
    }

    const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${token}`;
    const response = await fetchWithRetry(url);
    const data: CandleData = await response.json();

    if (data.s === 'no_data') {
      return NextResponse.json(
        { error: 'No data available for the specified period' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Candles API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candle data' },
      { status: 500 }
    );
  }
}
