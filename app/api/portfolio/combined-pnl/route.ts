import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mapPositionRow } from '@/lib/positions';
import { calculatePortfolioSummary, calculatePositionMetrics } from '@/lib/calculations';
import { ExchangeRateResponse, Position, StockQuote } from '@/types';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const DEFAULT_GROWTH_RATE = Number.parseFloat(process.env.DEFAULT_GROWTH_RATE ?? '0.05');
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        return response;
      }

      if (response.status === 429 && attempt < retries - 1) {
        const backoff = delay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === retries - 1) {
        throw error;
      }
      const backoff = delay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }

  throw new Error('Max retries reached');
}

async function fetchQuote(symbol: string, token?: string): Promise<number | null> {
  if (!token) {
    return null;
  }

  try {
    const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
    const response = await fetchWithRetry(url);
    const data = await response.json() as StockQuote;

    if (!isFiniteNumber(data.c) || data.c <= 0) {
      return null;
    }

    return data.c;
  } catch (error) {
    console.error(`Failed to fetch quote for ${symbol}:`, error);
    return null;
  }
}

async function fetchUsdToIlsRate(): Promise<number> {
  const fallback = Number.parseFloat(process.env.DEFAULT_USD_TO_ILS_RATE ?? '3.7');
  const url = process.env.EXCHANGE_RATE_URL ?? 'https://open.er-api.com/v6/latest/USD';

  try {
    const response = await fetchWithRetry(url);
    const data = await response.json() as ExchangeRateResponse;
    const rate = data?.rates?.ILS;

    if (isFiniteNumber(rate) && rate > 0) {
      return rate;
    }

    console.warn('ILS rate missing from exchange response, falling back to default');
    return fallback;
  } catch (error) {
    console.error('Failed to fetch exchange rate, using fallback:', error);
    return fallback;
  }
}

function toFixed(value: number, digits = 2): number {
  return Number.parseFloat(value.toFixed(digits));
}

export async function GET() {
  try {
    const [positionsResult, settingsResult] = await Promise.all([
      supabase
        .from('positions')
        .select('*, position_lots(*)')
        .order('symbol'),
      supabase
        .from('settings')
        .select('*')
        .limit(1)
        .maybeSingle(),
    ]);

    if (positionsResult.error) {
      console.error('Failed to load positions:', positionsResult.error);
      return NextResponse.json(
        { error: 'Failed to load positions' },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    if (settingsResult.error && settingsResult.error.code !== 'PGRST116') {
      console.error('Failed to load settings:', settingsResult.error);
    }

    const rawPositions = Array.isArray(positionsResult.data) ? positionsResult.data : [];
    const positions: Position[] = rawPositions
      .map(mapPositionRow)
      .filter(position => isFiniteNumber(position.quantity) && position.quantity > 0);

    const usdToIlsRate = await fetchUsdToIlsRate();

    const annualGrowthRate = settingsResult.data && isFiniteNumber(settingsResult.data.annual_growth_rate)
      ? settingsResult.data.annual_growth_rate
      : DEFAULT_GROWTH_RATE;

    const finnhubToken = settingsResult.data?.finnhub_token || process.env.FINNHUB_TOKEN;

    const metrics = await Promise.all(
      positions.map(async (position) => {
        const quotePrice = await fetchQuote(position.symbol, finnhubToken ?? undefined);
        const currentPrice = quotePrice && quotePrice > 0 ? quotePrice : position.entryPrice;

        return calculatePositionMetrics(
          position,
          currentPrice,
          usdToIlsRate,
          annualGrowthRate,
        );
      }),
    );

    const summary = calculatePortfolioSummary(metrics, usdToIlsRate);

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        usdToIlsRate,
        combinedPnL: {
          usd: toFixed(summary.totalCombinedUsd),
          ils: toFixed(summary.totalCombinedIls),
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error('Combined PnL API error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate combined PnL' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
