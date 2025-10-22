import { NextResponse } from 'next/server';
import { calculatePortfolioSummary, calculatePositionMetrics } from '@/lib/calculations';
import { mapPositionRow } from '@/lib/positions';
import { fetchFinnhubQuote } from '@/lib/services/finnhub';
import { getUsdToIlsRate } from '@/lib/services/exchange-rate';
import { supabase } from '@/lib/supabase';
import { isFiniteNumber, toFixedNumber } from '@/lib/utils/numbers';
import { Position } from '@/types';

const DEFAULT_GROWTH_RATE = Number.parseFloat(process.env.DEFAULT_GROWTH_RATE ?? '0.05');
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [positionsResult, settingsResult] = await Promise.all([
      supabase
        .from('positions')
        .select('*, position_lots(*), position_plans(*)')
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

    const usdToIlsRate = await getUsdToIlsRate();

    const annualGrowthRate = settingsResult.data && isFiniteNumber(settingsResult.data.annual_growth_rate)
      ? settingsResult.data.annual_growth_rate
      : DEFAULT_GROWTH_RATE;

    const finnhubToken = settingsResult.data?.finnhub_token || process.env.FINNHUB_TOKEN;

    const metrics = await Promise.all(
      positions.map(async (position) => {
        const quote = await fetchFinnhubQuote(position.symbol, { token: finnhubToken ?? undefined });
        const currentPrice = quote?.price && quote.price > 0 ? quote.price : position.entryPrice;

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
          usd: toFixedNumber(summary.totalCombinedUsd),
          ils: toFixedNumber(summary.totalCombinedIls),
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
