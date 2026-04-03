import { NextRequest } from 'next/server';
import { errorNoStore, jsonNoStore } from '@/lib/api/route';
import { fetchYahooCandlesData, YahooCandlesError } from '@/lib/services/yahoo-candles';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeResolution(value: string): '60' | 'D' | 'W' | 'M' {
  return value === '60' || value === 'W' || value === 'M' ? value : 'D';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const resolution = searchParams.get('resolution') || 'D';

    if (!symbol || !from || !to) {
      return errorNoStore('Symbol, from, and to parameters are required', 400);
    }

    const fromSeconds = Number.parseInt(from, 10);
    const toSeconds = Number.parseInt(to, 10);

    if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || fromSeconds >= toSeconds) {
      return errorNoStore('Invalid time range provided', 400);
    }

    const candleData = await fetchYahooCandlesData(
      symbol,
      fromSeconds,
      toSeconds,
      normalizeResolution(resolution),
    );
    return jsonNoStore(candleData);
  } catch (error) {
    if (error instanceof YahooCandlesError) {
      return errorNoStore(error.message, error.status);
    }

    console.error('Candles API error:', error);
    return errorNoStore('Failed to fetch candle data', 500);
  }
}
