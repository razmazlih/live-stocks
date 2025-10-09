import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mapPositionRow } from '@/lib/positions';
import { calculatePositionMetrics, calculateWeightedPortfolioPrice } from '@/lib/calculations';
import { Position, StockQuote } from '@/types';
import { fetchUsdToIlsRate } from '@/lib/exchange';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const DEFAULT_GROWTH_RATE = Number.parseFloat(process.env.DEFAULT_GROWTH_RATE ?? '0.05');
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PortfolioRequestBody {
  includeWeightedPrice?: boolean;
  targetCurrency?: string;
}

interface QuoteResult {
  price: number;
  dailyChange?: number;
}

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

async function fetchQuote(symbol: string, token?: string): Promise<QuoteResult | null> {
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

    const result: QuoteResult = { price: data.c };
    if (isFiniteNumber(data.d)) {
      result.dailyChange = data.d;
    }

    return result;
  } catch (error) {
    console.error(`Failed to fetch quote for ${symbol}:`, error);
    return null;
  }
}

function toFixed(value: number, digits = 2): number {
  return Number.parseFloat(value.toFixed(digits));
}

export async function POST(request: NextRequest) {
  try {
    let body: PortfolioRequestBody | null = null;
    try {
      body = await request.json();
    } catch (error) {
      console.warn('Portfolio request JSON parse error:', error);
    }

    const includeWeightedPrice = Boolean(body?.includeWeightedPrice);
    const targetCurrency = (body?.targetCurrency ?? 'USD').toUpperCase();

    const [{ data: positionsData, error: positionsError }, { data: settingsData, error: settingsError }] = await Promise.all([
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

    if (positionsError) {
      console.error('Failed to load positions:', positionsError);
      return NextResponse.json(
        { error: 'Failed to load positions' },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Failed to load settings:', settingsError);
    }

    const rawPositions = Array.isArray(positionsData) ? positionsData : [];
    const positions: Position[] = rawPositions
      .map(mapPositionRow)
      .filter(position => isFiniteNumber(position.quantity) && position.quantity > 0);

    const usdToIlsRate = await fetchUsdToIlsRate();

    const annualGrowthRate = settingsData && isFiniteNumber(settingsData.annual_growth_rate)
      ? settingsData.annual_growth_rate
      : DEFAULT_GROWTH_RATE;

    const finnhubToken = settingsData?.finnhub_token || process.env.FINNHUB_TOKEN;

    const metrics = await Promise.all(
      positions.map(async (position) => {
        const quote = await fetchQuote(position.symbol, finnhubToken ?? undefined);
        const currentPrice = quote?.price && quote.price > 0 ? quote.price : position.entryPrice;
        const dailyChange = quote?.dailyChange;

        return calculatePositionMetrics(
          position,
          currentPrice,
          usdToIlsRate,
          annualGrowthRate,
          dailyChange,
        );
      }),
    );

    const gapCandidates = metrics
      .map((metric) => {
        const priceGap = metric.currentPrice - metric.projectedPrice;
        const pnlGapUsd = metric.combined;
        return { metric, priceGap, pnlGapUsd };
      })
      .sort((a, b) => Math.abs(b.pnlGapUsd) - Math.abs(a.pnlGapUsd));

    const convertToTarget = (value: number): number => {
      if (!isFiniteNumber(value)) {
        return 0;
      }

      if (targetCurrency === 'ILS') {
        return value * usdToIlsRate;
      }

      return value;
    };

    const topStocks = gapCandidates.slice(0, 3).map(({ metric, priceGap, pnlGapUsd }) => ({
      symbol: metric.position.symbol,
      display: metric.position.display,
      imageUrl: metric.position.imageUrl,
      entryPrice: toFixed(metric.position.entryPrice),
      quantity: metric.position.quantity,
      entryDate: metric.position.entryDate,
      currentPrice: toFixed(metric.currentPrice),
      projectedPrice: toFixed(metric.projectedPrice),
      currentPnLUsd: toFixed(metric.positionPnLUsd),
      projectedPnLUsd: toFixed(metric.projectedPnLUsd),
      pnlDelta: {
        currency: 'USD',
        value: toFixed(pnlGapUsd),
        ...(targetCurrency !== 'USD' ? {
          targetCurrency,
          targetValue: toFixed(convertToTarget(pnlGapUsd)),
        } : {}),
      },
      priceGap: {
        currency: 'USD',
        value: toFixed(priceGap),
        ...(targetCurrency !== 'USD' ? {
          targetCurrency,
          targetValue: toFixed(convertToTarget(priceGap)),
        } : {}),
      },
    }));

    const responsePayload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      usdToIlsRate,
      targetCurrency,
      stocks: topStocks,
    };

    if (includeWeightedPrice) {
      const weightedPrice = calculateWeightedPortfolioPrice(metrics.map(metric => metric.position));
      if (isFiniteNumber(weightedPrice)) {
        responsePayload.weightedPrice = {
          currency: 'USD',
          value: toFixed(weightedPrice),
        };
      }
    }

    return NextResponse.json(responsePayload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Portfolio API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate portfolio snapshot' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
