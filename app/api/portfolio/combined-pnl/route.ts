import { NextRequest, NextResponse } from 'next/server';
import {
  calculatePortfolioSummary,
  calculatePositionMetrics,
  calculateRealizedPortfolioTotals,
  calculateRealizedTaxLiability,
  enrichPortfolioSummaryWithRealized,
} from '@/lib/calculations';
import { buildUsdIlsRateResolver, fetchUsdIlsHistoricalPoints } from '@/lib/services/historical-fx';
import { computeRealizedSalesWithFx, mapPositionRow } from '@/lib/positions';
import { fetchFinnhubQuote } from '@/lib/services/finnhub';
import { getUsdToIlsRate } from '@/lib/services/exchange-rate';
import { getSupabaseClient } from '@/lib/supabase';
import { isFiniteNumber, toFixedNumber } from '@/lib/utils/numbers';
import { Position } from '@/types';

const DEFAULT_GROWTH_RATE = Number.parseFloat(process.env.DEFAULT_GROWTH_RATE ?? '0.05');
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch (error) {
      console.error('Supabase client initialization failed:', error);
      return NextResponse.json(
        { error: 'Supabase client is not configured.' },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

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
    const mappedPositions: Position[] = rawPositions.map(mapPositionRow);
    const openPositions = mappedPositions
      .filter(position => isFiniteNumber(position.quantity) && position.quantity > 0);

    const usdToIlsRate = await getUsdToIlsRate();

    const annualGrowthRate = settingsResult.data && isFiniteNumber(settingsResult.data.annual_growth_rate)
      ? settingsResult.data.annual_growth_rate
      : DEFAULT_GROWTH_RATE;

    const finnhubToken = settingsResult.data?.finnhub_token || process.env.FINNHUB_TOKEN;

    const metrics = await Promise.all(
      openPositions.map(async (position) => {
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

    const lotTimestamps = mappedPositions.flatMap((position) =>
      (Array.isArray(position.lots) ? position.lots : [])
        .map((lot) => new Date(lot.executedAt).getTime())
        .filter((timestamp) => Number.isFinite(timestamp)),
    );
    const earliestLotTimestamp = lotTimestamps.length
      ? Math.min(...lotTimestamps)
      : Date.now() - 365 * 24 * 60 * 60 * 1000;
    const fxPoints = await fetchUsdIlsHistoricalPoints(
      Math.floor(earliestLotTimestamp / 1000),
      Math.floor(Date.now() / 1000),
      { baseUrl: request.nextUrl.origin },
    );
    const getFxRateAt = buildUsdIlsRateResolver(fxPoints, usdToIlsRate);

    const realizedSales = mappedPositions.flatMap((position) =>
      computeRealizedSalesWithFx(position, getFxRateAt),
    );
    const realizedTotals = calculateRealizedPortfolioTotals(
      realizedSales,
      annualGrowthRate,
      usdToIlsRate,
      getFxRateAt,
    );

    const chronologicalSales = realizedSales
      .slice()
      .sort((a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime());

    const taxSummary = calculateRealizedTaxLiability(
      chronologicalSales.map((sale) => ({
        profitUsd: isFiniteNumber(sale.profitUsd) ? sale.profitUsd : 0,
        profitIls: isFiniteNumber(sale.profitIls)
          ? sale.profitIls
          : isFiniteNumber(sale.profitUsd)
            ? sale.profitUsd * getFxRateAt(new Date(sale.sellDate).getTime())
            : 0,
        timestamp: new Date(sale.sellDate).getTime(),
      })),
    );

    const enrichedSummary = enrichPortfolioSummaryWithRealized(summary, realizedTotals, taxSummary);
    const forecastGapUsd = enrichedSummary.totalNetPnLUsd - enrichedSummary.totalProjectedPnLUsd;
    const forecastGapIls = enrichedSummary.totalNetPnLIls - enrichedSummary.totalProjectedPnLIls;

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        usdToIlsRate,
        netPnL: {
          usd: toFixedNumber(enrichedSummary.totalNetPnLUsd),
          ils: toFixedNumber(enrichedSummary.totalNetPnLIls),
        },
        forecastGap: {
          usd: toFixedNumber(forecastGapUsd),
          ils: toFixedNumber(forecastGapIls),
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error('Net PnL API error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate net PnL' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
