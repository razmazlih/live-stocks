import { reconciliationQuality, RECONCILIATION_HISTORY_WARNING, positionFxTimestamps } from '@/lib/reconciliation-quality';
import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PRIVATE_HEADERS } from '@/lib/auth/server';
import { fetchYahooCandlesData } from '@/lib/services/yahoo-candles';
import {
  mapCandleDataToPoints,
  calculatePortfolioSummary,
  calculatePositionMetrics,
  calculateRealizedPortfolioTotals,
  calculateRealizedTaxLiability,
  enrichPortfolioSummaryWithRealized,
} from '@/lib/calculations';
import { computeRealizedSalesWithFx, expandPositionActivations, mapPositionRow } from '@/lib/positions';
import { fetchFinnhubQuote } from '@/lib/services/finnhub';
import { getUsdToIlsRate } from '@/lib/services/exchange-rate';
import { buildUsdIlsRateResolver, normalizeToUtcDay } from '@/lib/services/historical-fx';
import { isFiniteNumber, toFixedNumber } from '@/lib/utils/numbers';
import { Position, PositionMetrics } from '@/types';

const DEFAULT_GROWTH_RATE = Number.parseFloat(process.env.DEFAULT_GROWTH_RATE ?? '0.05');
const NO_STORE_HEADERS = PRIVATE_HEADERS;


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

export type PortfolioSourceSnapshot = {
  positions: Record<string, unknown>[];
  position_lots: Record<string, unknown>[];
  settings: Record<string, unknown> | null;
};

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

export async function buildPortfolioResponse(
  context: { supabase: SupabaseClient; userId: string; finnhubToken: string | null; snapshot?: PortfolioSourceSnapshot },
  body: PortfolioRequestBody = {},
): Promise<Response> {
  try {
    const { supabase, userId, finnhubToken } = context;
    if (!userId) throw new Error('Account is required');
    const includeWeightedPrice = Boolean(body.includeWeightedPrice);
    const targetCurrency = (body.targetCurrency ?? 'USD').toUpperCase();

    const [{ data: positionsData, error: positionsError }, { data: settingsData, error: settingsError }] = context.snapshot ? [
      { data: context.snapshot.positions.map(position => ({ ...position,
        position_lots: context.snapshot!.position_lots.filter(lot => lot.position_id === position.id),
      })), error: null },
      { data: context.snapshot.settings, error: null },
    ] : await Promise.all([
      supabase
        .from('positions')
        .select('*, position_lots(*)')
        .eq('user_id', userId)
        .order('symbol'),
      supabase
        .from('settings')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
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
    const historyQuality = reconciliationQuality(mappedPositions);
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

    const usdToIlsRate = await getUsdToIlsRate({ allowFallback: false });

    const annualGrowthRate = settingsData && isFiniteNumber(settingsData.annual_growth_rate)
      ? settingsData.annual_growth_rate
      : DEFAULT_GROWTH_RATE;


    const allTimestamps = mappedPositions.flatMap(positionFxTimestamps);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const minFxTimestamp = allTimestamps.reduce<number | null>(
      (min, value) => (min === null ? value : Math.min(min, value)),
      null,
    );
    const fxFrom = Math.max(
      0,
      Math.floor(normalizeToUtcDay(minFxTimestamp ?? Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000) - 10 * 86400,
    );
    const fxHistoryPoints = await fetchYahooCandlesData('ILS=X', fxFrom, nowSeconds, 'D')
      .then(mapCandleDataToPoints).catch(() => []);
    const getFxRateAt = buildUsdIlsRateResolver(fxHistoryPoints, usdToIlsRate, { allowFallback: false });

    const metrics = await Promise.all(
      positions.map(async (position) => {
        const quote = await fetchFinnhubQuote(position.symbol, { token: finnhubToken ?? undefined });
        const currentPrice = quote?.price && Number.isFinite(quote.price) && quote.price > 0 ? quote.price : position.quantity <= 0 ? 0 : Number.NaN;
        const dailyChange = quote?.dailyChange;

        return calculatePositionMetrics(
          position,
          currentPrice,
          usdToIlsRate,
          annualGrowthRate,
          dailyChange,
          getFxRateAt,
        );
      }),
    );

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
        profitUsd: sale.profitUsd,
        profitIls: sale.profitIls ?? sale.profitUsd * usdToIlsRate,
        timestamp: new Date(sale.sellDate).getTime(),
      })),
    );

    const baseSummary = calculatePortfolioSummary(metrics, usdToIlsRate, mappedPositions, getFxRateAt);
    const enrichedSummary = enrichPortfolioSummaryWithRealized(baseSummary, realizedTotals, taxSummary);
    const totalForecastGapUsd = enrichedSummary.totalNetPnLUsd - enrichedSummary.totalProjectedPnLUsd;
    const totalForecastGapIls = enrichedSummary.totalNetPnLIls - enrichedSummary.totalProjectedPnLIls;

    const summary = {
      ...baseSummary,
      totalCurrentPnLUsd: toFixedNumber(enrichedSummary.totalCurrentPnLUsd),
      totalCurrentPnLIls: toFixedNumber(enrichedSummary.totalCurrentPnLIls),
      totalProjectedPnLUsd: toFixedNumber(enrichedSummary.totalProjectedPnLUsd),
      totalProjectedPnLIls: toFixedNumber(enrichedSummary.totalProjectedPnLIls),
      totalCombinedUsd: toFixedNumber(enrichedSummary.totalCombinedUsd),
      totalCombinedIls: toFixedNumber(enrichedSummary.totalCombinedIls),
      totalRealizedProfitUsd: toFixedNumber(enrichedSummary.totalRealizedProfitUsd),
      totalRealizedProfitIls: toFixedNumber(enrichedSummary.totalRealizedProfitIls),
      totalTaxesPaidUsd: historyQuality.completeTransactionHistory ? toFixedNumber(enrichedSummary.totalTaxesPaidUsd) : null,
      totalTaxesPaidIls: historyQuality.completeTransactionHistory ? toFixedNumber(enrichedSummary.totalTaxesPaidIls) : null,
      totalNetPnLUsd: toFixedNumber(enrichedSummary.totalNetPnLUsd),
      totalNetPnLIls: toFixedNumber(enrichedSummary.totalNetPnLIls),
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
          targetValue: toFixedNumber(targetCurrency === 'ILS' ? metric.combinedIls : convertToTarget(pnlGapUsd)),
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
      dataQuality: { ...historyQuality, warnings: historyQuality.completeTransactionHistory ? [] : [RECONCILIATION_HISTORY_WARNING] },
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
