import { NextRequest, NextResponse } from 'next/server';
import {
  calculatePortfolioSummary,
  calculatePositionMetrics,
  calculateRealizedTaxLiability,
} from '@/lib/calculations';
import { buildUsdIlsRateResolver, fetchUsdIlsHistoricalPoints } from '@/lib/services/historical-fx';
import { computeRealizedSalesWithFx, mapPositionRow } from '@/lib/positions';
import { fetchQuotesForSymbols, FinnhubConfigError } from '@/lib/services/quote-provider';
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

    const finnhubToken = settingsResult.data?.finnhub_token ?? process.env.FINNHUB_TOKEN;
    let quotesBySymbol: Record<string, { c?: number }> = {};
    try {
      const quoteMap = await fetchQuotesForSymbols(
        openPositions.map((position) => position.symbol),
        { token: finnhubToken, forceRefresh: false },
      );

      quotesBySymbol = Object.fromEntries(
        Object.entries(quoteMap).map(([symbol, quote]) => [symbol, { c: quote.c }]),
      );
    } catch (error) {
      if (error instanceof FinnhubConfigError) {
        console.warn('Finnhub token is not configured; using entry prices as fallback.');
      } else {
        console.error('Failed to fetch live quotes for combined PnL route:', error);
      }
    }

    const metrics = openPositions.map((position) => {
      const quote = quotesBySymbol[position.symbol.trim().toUpperCase()];
      const currentPrice =
        typeof quote?.c === 'number' && quote.c > 0
          ? quote.c
          : position.entryPrice;

      return calculatePositionMetrics(
        position,
        currentPrice,
        usdToIlsRate,
        annualGrowthRate,
      );
    });

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
    const realizedTotals = realizedSales.reduce(
      (acc, sale) => {
        const profitUsd = isFiniteNumber(sale.profitUsd) ? sale.profitUsd : 0;
        const costBasisUsd = isFiniteNumber(sale.costBasisUsd) ? sale.costBasisUsd : 0;
        const holdingDays = isFiniteNumber(sale.holdingPeriodDays) ? sale.holdingPeriodDays : 0;
        const yearsHeld = Math.max(holdingDays / 365.25, 0);
        const expectedFactor = Math.pow(1 + annualGrowthRate, yearsHeld);
        const expectedProfitUsd = costBasisUsd * (expectedFactor - 1);
        const sellTimestamp = new Date(sale.sellDate).getTime();
        const sellRate = getFxRateAt(sellTimestamp);
        const profitIls = isFiniteNumber(sale.profitIls) ? sale.profitIls : profitUsd * sellRate;
        const expectedProfitIls = expectedProfitUsd * sellRate;

        return {
          profitUsd: acc.profitUsd + profitUsd,
          profitIls: acc.profitIls + profitIls,
          expectedProfitUsd: acc.expectedProfitUsd + expectedProfitUsd,
          expectedProfitIls: acc.expectedProfitIls + expectedProfitIls,
        };
      },
      { profitUsd: 0, profitIls: 0, expectedProfitUsd: 0, expectedProfitIls: 0 },
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

    const totalCurrentPnLUsd = summary.totalCurrentPnLUsd + realizedTotals.profitUsd;
    const totalCurrentPnLIls = summary.totalCurrentPnLIls + realizedTotals.profitIls;
    const totalProjectedPnLUsd = Math.max(
      summary.totalProjectedPnLUsd + realizedTotals.expectedProfitUsd,
      0,
    );
    const totalProjectedPnLIls = Math.max(
      summary.totalProjectedPnLIls + realizedTotals.expectedProfitIls,
      0,
    );

    const netPnLUsd = totalCurrentPnLUsd - taxSummary.taxUsd;
    const netPnLIls = totalCurrentPnLIls - taxSummary.taxIls;
    const forecastGapUsd = netPnLUsd - totalProjectedPnLUsd;
    const forecastGapIls = netPnLIls - totalProjectedPnLIls;

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        usdToIlsRate,
        netPnL: {
          usd: toFixedNumber(netPnLUsd),
          ils: toFixedNumber(netPnLIls),
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
