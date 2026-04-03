import { NextRequest, NextResponse } from 'next/server';
import {
  calculatePortfolioSummary,
  calculatePositionMetrics,
  calculateRealizedTaxLiability,
} from '@/lib/calculations';
import { computeRealizedSalesWithFx, expandPositionActivations, mapPositionRow } from '@/lib/positions';
import { fetchQuotesForSymbols, FinnhubConfigError } from '@/lib/services/quote-provider';
import { getUsdToIlsRate } from '@/lib/services/exchange-rate';
import { buildUsdIlsRateResolver, fetchUsdIlsHistoricalPoints } from '@/lib/services/historical-fx';
import { getSupabaseClient } from '@/lib/supabase';
import { isFiniteNumber, toFixedNumber } from '@/lib/utils/numbers';
import { Position, PositionMetrics } from '@/types';

const DEFAULT_GROWTH_RATE = Number.parseFloat(process.env.DEFAULT_GROWTH_RATE ?? '0.05');
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PortfolioRequestBody {
  includeWeightedPrice?: boolean;
  targetCurrency?: string;
  includeClosed?: boolean;
}

interface WeightedPortfolioPrices {
  entry: number;
  current: number;
  projected: number;
}

function calculateWeightedPortfolioPrices(metrics: PositionMetrics[]): WeightedPortfolioPrices | null {
  const totals = metrics.reduce(
    (acc, metric) => {
      const quantity = isFiniteNumber(metric.position.quantity) ? metric.position.quantity : 0;
      if (quantity <= 0) {
        return acc;
      }

      const entryPrice = isFiniteNumber(metric.position.entryPrice) ? metric.position.entryPrice : 0;
      const currentPrice = isFiniteNumber(metric.currentPrice) ? metric.currentPrice : 0;
      const projectedPrice = isFiniteNumber(metric.projectedPrice) ? metric.projectedPrice : 0;

      return {
        quantity: acc.quantity + quantity,
        entry: acc.entry + entryPrice * quantity,
        current: acc.current + currentPrice * quantity,
        projected: acc.projected + projectedPrice * quantity,
      };
    },
    { quantity: 0, entry: 0, current: 0, projected: 0 },
  );

  if (totals.quantity <= 0) {
    return null;
  }

  return {
    entry: totals.entry / totals.quantity,
    current: totals.current / totals.quantity,
    projected: totals.projected / totals.quantity,
  };
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
    const mappedPositions: Position[] = rawPositions.map(mapPositionRow);
    const activationPositions = mappedPositions.flatMap((position) =>
      expandPositionActivations(position),
    );
    const includeClosed = Boolean(body?.includeClosed);
    const positions: Position[] = activationPositions.filter((position) => {
      if (isFiniteNumber(position.quantity) && position.quantity > 0) {
        return true;
      }
      return includeClosed;
    });

    const usdToIlsRate = await getUsdToIlsRate();

    const annualGrowthRate = settingsData && isFiniteNumber(settingsData.annual_growth_rate)
      ? settingsData.annual_growth_rate
      : DEFAULT_GROWTH_RATE;

    const finnhubToken = settingsData?.finnhub_token ?? process.env.FINNHUB_TOKEN;
    let quotesBySymbol: Record<string, { c?: number; d?: number }> = {};
    try {
      const quoteMap = await fetchQuotesForSymbols(
        positions.map((position) => position.symbol),
        { token: finnhubToken, forceRefresh: false },
      );

      quotesBySymbol = Object.fromEntries(
        Object.entries(quoteMap).map(([symbol, quote]) => [symbol, { c: quote.c, d: quote.d }]),
      );
    } catch (error) {
      if (error instanceof FinnhubConfigError) {
        console.warn('Finnhub token is not configured; using entry prices as fallback.');
      } else {
        console.error('Failed to fetch live quotes for portfolio route:', error);
      }
    }

    const metrics = positions.map((position) => {
      const quote = quotesBySymbol[position.symbol.trim().toUpperCase()];
      const currentPrice =
        typeof quote?.c === 'number' && quote.c > 0
          ? quote.c
          : position.entryPrice;
      const dailyChange = typeof quote?.d === 'number' ? quote.d : undefined;

      return calculatePositionMetrics(
        position,
        currentPrice,
        usdToIlsRate,
        annualGrowthRate,
        dailyChange,
      );
    });

    const allTimestamps = mappedPositions.flatMap((position) =>
      (position.lots ?? [])
        .map((lot) => new Date(lot.executedAt).getTime())
        .filter((timestamp) => Number.isFinite(timestamp)),
    );
    const nowSeconds = Math.floor(Date.now() / 1000);
    const minFxTimestamp = allTimestamps.reduce<number | null>(
      (min, value) => (min === null ? value : Math.min(min, value)),
      null,
    );
    const fxFrom = Math.max(
      0,
      Math.floor(((minFxTimestamp ?? Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000) - 2 * 24 * 60 * 60),
    );
    const fxHistoryPoints = await fetchUsdIlsHistoricalPoints(fxFrom, nowSeconds, {
      baseUrl: request.nextUrl.origin,
    });
    const getFxRateAt = buildUsdIlsRateResolver(fxHistoryPoints, usdToIlsRate);

    const realizedSales = mappedPositions.flatMap((position) =>
      computeRealizedSalesWithFx(position, getFxRateAt),
    );
    const realizedTotals = realizedSales.reduce(
      (acc, sale) => {
        const holdingYears = Math.max((sale.holdingPeriodDays ?? 0) / 365.25, 0);
        const expectedFactor = Math.pow(1 + annualGrowthRate, holdingYears);
        const expectedProfitUsd = sale.costBasisUsd * (expectedFactor - 1);

        acc.profitUsd += sale.profitUsd;
        acc.profitIls += sale.profitIls ?? sale.profitUsd * usdToIlsRate;
        acc.expectedProfitUsd += expectedProfitUsd;
        acc.expectedProfitIls += expectedProfitUsd * getFxRateAt(new Date(sale.sellDate).getTime());
        return acc;
      },
      { profitUsd: 0, profitIls: 0, expectedProfitUsd: 0, expectedProfitIls: 0 },
    );

    const chronologicalSales = realizedSales
      .slice()
      .sort((a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime());
    const taxSummary = calculateRealizedTaxLiability(
      chronologicalSales.map((sale) => ({
        profitUsd: sale.profitUsd,
        profitIls: sale.profitIls ?? sale.profitUsd * usdToIlsRate,
        timestamp: new Date(sale.sellDate).getTime(),
      })),
    );

    const baseSummary = calculatePortfolioSummary(metrics, usdToIlsRate);
    const totalCurrentPnLUsd = baseSummary.totalCurrentPnLUsd + realizedTotals.profitUsd;
    const totalCurrentPnLIls = baseSummary.totalCurrentPnLIls + realizedTotals.profitIls;
    const totalProjectedPnLUsd = Math.max(
      baseSummary.totalProjectedPnLUsd + realizedTotals.expectedProfitUsd,
      0,
    );
    const totalProjectedPnLIls = Math.max(
      baseSummary.totalProjectedPnLIls + realizedTotals.expectedProfitIls,
      0,
    );
    const totalCombinedUsd = totalCurrentPnLUsd - totalProjectedPnLUsd;
    const totalCombinedIls = totalCurrentPnLIls - totalProjectedPnLIls;
    const totalNetPnLUsd = totalCurrentPnLUsd - taxSummary.taxUsd;
    const totalNetPnLIls = totalCurrentPnLIls - taxSummary.taxIls;
    const totalForecastGapUsd = totalNetPnLUsd - totalProjectedPnLUsd;
    const totalForecastGapIls = totalNetPnLIls - totalProjectedPnLIls;

    const summary = {
      ...baseSummary,
      totalCurrentPnLUsd: toFixedNumber(totalCurrentPnLUsd),
      totalCurrentPnLIls: toFixedNumber(totalCurrentPnLIls),
      totalProjectedPnLUsd: toFixedNumber(totalProjectedPnLUsd),
      totalProjectedPnLIls: toFixedNumber(totalProjectedPnLIls),
      totalCombinedUsd: toFixedNumber(totalCombinedUsd),
      totalCombinedIls: toFixedNumber(totalCombinedIls),
      totalRealizedProfitUsd: toFixedNumber(realizedTotals.profitUsd),
      totalRealizedProfitIls: toFixedNumber(realizedTotals.profitIls),
      totalTaxesPaidUsd: toFixedNumber(taxSummary.taxUsd),
      totalTaxesPaidIls: toFixedNumber(taxSummary.taxIls),
      totalNetPnLUsd: toFixedNumber(totalNetPnLUsd),
      totalNetPnLIls: toFixedNumber(totalNetPnLIls),
      totalForecastGapUsd: toFixedNumber(totalForecastGapUsd),
      totalForecastGapIls: toFixedNumber(totalForecastGapIls),
      totalValue: toFixedNumber(baseSummary.totalValue),
      totalCost: toFixedNumber(baseSummary.totalCost),
      usdToIlsRate: toFixedNumber(baseSummary.usdToIlsRate),
    };

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

    const mappedStocks = gapCandidates.map(({ metric, priceGap, pnlGapUsd }) => ({
      symbol: metric.position.symbol,
      display: metric.position.display,
      imageUrl: metric.position.imageUrl,
      location: metric.position.location,
      entryPrice: toFixedNumber(metric.position.entryPrice),
      quantity: metric.position.quantity,
      entryDate: metric.position.entryDate,
      currentPrice: toFixedNumber(metric.currentPrice),
      projectedPrice: toFixedNumber(metric.projectedPrice),
      currentPnLUsd: toFixedNumber(metric.positionPnLUsd),
      currentPnLIls: toFixedNumber(metric.positionPnLIls),
      projectedPnLUsd: toFixedNumber(metric.projectedPnLUsd),
      projectedPnLIls: toFixedNumber(metric.projectedPnLIls),
      totalValueUsd: toFixedNumber(metric.currentValue),
      totalValueIls: toFixedNumber(metric.currentValueIls),
      roiPercent: toFixedNumber(metric.roiPercent),
      dailyChange: isFiniteNumber(metric.dailyChange) ? toFixedNumber(metric.dailyChange) : null,
      dailyChangePercent: isFiniteNumber(metric.dailyChangePercent)
        ? toFixedNumber(metric.dailyChangePercent)
        : null,
      pnlDelta: {
        currency: 'USD',
        value: toFixedNumber(pnlGapUsd),
        ...(targetCurrency !== 'USD' ? {
          targetCurrency,
          targetValue: toFixedNumber(convertToTarget(pnlGapUsd)),
        } : {}),
      },
      priceGap: {
        currency: 'USD',
        value: toFixedNumber(priceGap),
        ...(targetCurrency !== 'USD' ? {
          targetCurrency,
          targetValue: toFixedNumber(convertToTarget(priceGap)),
        } : {}),
      },
    }));
    const topStocks = mappedStocks.slice(0, 3);

    const responsePayload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      usdToIlsRate,
      targetCurrency,
      summary,
      stocks: mappedStocks,
      topStocks,
      realizedSalesCount: realizedSales.length,
    };

    if (includeWeightedPrice) {
      const weightedPrices = calculateWeightedPortfolioPrices(metrics);
      if (weightedPrices) {
        responsePayload.weightedPrice = {
          currency: 'USD',
          value: toFixedNumber(weightedPrices.entry),
        };

        responsePayload.weightedPrices = {
          currency: 'USD',
          entry: toFixedNumber(weightedPrices.entry),
          current: toFixedNumber(weightedPrices.current),
          projected: toFixedNumber(weightedPrices.projected),
          ...(targetCurrency !== 'USD'
            ? {
              targetCurrency,
              entryTarget: toFixedNumber(convertToTarget(weightedPrices.entry)),
              currentTarget: toFixedNumber(convertToTarget(weightedPrices.current)),
              projectedTarget: toFixedNumber(convertToTarget(weightedPrices.projected)),
            }
            : {}),
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
