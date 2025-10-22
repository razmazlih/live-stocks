import { NextResponse } from 'next/server';
import {
  calculatePortfolioSummary,
  calculatePositionMetrics,
  calculateRealizedTaxLiability,
} from '@/lib/calculations';
import { computeRealizedSales, mapPositionRow } from '@/lib/positions';
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
        const profitIls = profitUsd * usdToIlsRate;

        return {
          profitUsd: acc.profitUsd + profitUsd,
          profitIls: acc.profitIls + profitIls,
        };
      },
      { profitUsd: 0, profitIls: 0 },
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

    const totalNetPnLUsd = totalCurrentPnLUsd - taxSummary.taxUsd;
    const totalNetPnLIls = totalCurrentPnLIls - taxSummary.taxIls;

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        usdToIlsRate,
        netPnL: {
          usd: toFixedNumber(totalNetPnLUsd),
          ils: toFixedNumber(totalNetPnLIls),
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
