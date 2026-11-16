import { reconciliationQuality, positionFxTimestamps } from '@/lib/reconciliation-quality';
import { fetchYahooCandlesData } from '@/lib/services/yahoo-candles';
import { NextRequest, NextResponse } from 'next/server';
import {
  mapCandleDataToPoints,
  calculatePortfolioSummary,
  calculatePositionMetrics,
  calculateRealizedPortfolioTotals,
  calculateRealizedTaxLiability,
  enrichPortfolioSummaryWithRealized,
} from '@/lib/calculations';
import { buildUsdIlsRateResolver, normalizeToUtcDay } from '@/lib/services/historical-fx';
import { computeRealizedSalesWithFx, mapPositionRow } from '@/lib/positions';
import { fetchFinnhubQuote } from '@/lib/services/finnhub';
import { getUsdToIlsRate } from '@/lib/services/exchange-rate';
import { requireApiPrincipal, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { readFinnhubCredential } from '@/lib/auth/credentials';
import { isFiniteNumber, toFixedNumber } from '@/lib/utils/numbers';
import { Position } from '@/types';

const DEFAULT_GROWTH_RATE = Number.parseFloat(process.env.DEFAULT_GROWTH_RATE ?? '0.05');
const NO_STORE_HEADERS = PRIVATE_HEADERS;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPrincipal(request);
    const supabase = principal.supabase;

    const [positionsResult, settingsResult] = await Promise.all([
      supabase
        .from('positions')
        .select('*, position_lots(*)')
        .eq('user_id', principal.userId)
        .order('symbol'),
      supabase
        .from('settings')
        .select('*')
        .eq('user_id', principal.userId)
        .eq('is_active', true)
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

    const usdToIlsRate = await getUsdToIlsRate({ allowFallback: false });

    const annualGrowthRate = settingsResult.data && isFiniteNumber(settingsResult.data.annual_growth_rate)
      ? settingsResult.data.annual_growth_rate
      : DEFAULT_GROWTH_RATE;

    const finnhubToken = await readFinnhubCredential(principal.userId);

    const lotTimestamps = mappedPositions.flatMap(positionFxTimestamps);
    const earliestLotTimestamp = lotTimestamps.length
      ? Math.min(...lotTimestamps)
      : Date.now() - 365 * 24 * 60 * 60 * 1000;
    const fxPoints = await fetchYahooCandlesData(
      'ILS=X',
      Math.max(0, Math.floor(normalizeToUtcDay(earliestLotTimestamp) / 1000) - 10 * 86400),
      Math.floor(Date.now() / 1000),
      'D',
    ).then(mapCandleDataToPoints).catch(() => []);
    const getFxRateAt = buildUsdIlsRateResolver(fxPoints, usdToIlsRate, { allowFallback: false });

    const metrics = await Promise.all(
      openPositions.map(async (position) => {
        const quote = await fetchFinnhubQuote(position.symbol, { token: finnhubToken ?? undefined });
        const currentPrice = quote?.price && Number.isFinite(quote.price) && quote.price > 0 ? quote.price : position.quantity <= 0 ? 0 : Number.NaN;

        return calculatePositionMetrics(
          position,
          currentPrice,
          usdToIlsRate,
          annualGrowthRate,
          undefined,
          getFxRateAt,
        );
      }),
    );

    const summary = calculatePortfolioSummary(metrics, usdToIlsRate, mappedPositions, getFxRateAt);

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
        dataQuality: reconciliationQuality(mappedPositions),
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
    const authResponse = authenticationResponse(error);
    if (authResponse) return authResponse;
    console.error('Net PnL API error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate net PnL' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
