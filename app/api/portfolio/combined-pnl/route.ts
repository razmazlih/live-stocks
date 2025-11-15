import { NextResponse } from 'next/server';
import {
  calculatePortfolioSummary,
  calculatePositionMetrics,
  calculateRealizedTaxLiability,
} from '@/lib/calculations';
import { computeRealizedSales, mapPositionRow } from '@/lib/positions';
import { fetchFinnhubQuote } from '@/lib/services/finnhub';
import { getUsdToIlsRate } from '@/lib/services/exchange-rate';
import { getSupabaseClient } from '@/lib/supabase';
import { isFiniteNumber, toFixedNumber } from '@/lib/utils/numbers';
import { Position } from '@/types';

const DEFAULT_GROWTH_RATE = Number.parseFloat(process.env.DEFAULT_GROWTH_RATE ?? '0.05');
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
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

    const realizedSales = mappedPositions.flatMap(computeRealizedSales);
    const realizedTotals = realizedSales.reduce(
      (acc, sale) => {
        const profitUsd = isFiniteNumber(sale.profitUsd) ? sale.profitUsd : 0;
        const costBasisUsd = isFiniteNumber(sale.costBasisUsd) ? sale.costBasisUsd : 0;
        const holdingDays = isFiniteNumber(sale.holdingPeriodDays) ? sale.holdingPeriodDays : 0;
        const yearsHeld = Math.max(holdingDays / 365.25, 0);
        const expectedFactor = Math.pow(1 + annualGrowthRate, yearsHeld);
        const expectedProfitUsd = costBasisUsd * (expectedFactor - 1);
        const profitIls = profitUsd * usdToIlsRate;
        const expectedProfitIls = expectedProfitUsd * usdToIlsRate;

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
        profitIls: isFiniteNumber(sale.profitUsd) ? sale.profitUsd * usdToIlsRate : 0,
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
