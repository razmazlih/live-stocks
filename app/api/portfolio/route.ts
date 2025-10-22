import { NextRequest, NextResponse } from 'next/server';
import { calculatePositionMetrics } from '@/lib/calculations';
import { mapPositionRow } from '@/lib/positions';
import { fetchFinnhubQuote } from '@/lib/services/finnhub';
import { getUsdToIlsRate } from '@/lib/services/exchange-rate';
import { supabase } from '@/lib/supabase';
import { isFiniteNumber, toFixedNumber } from '@/lib/utils/numbers';
import { Position, PositionMetrics } from '@/types';

const DEFAULT_GROWTH_RATE = Number.parseFloat(process.env.DEFAULT_GROWTH_RATE ?? '0.05');
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PortfolioRequestBody {
  includeWeightedPrice?: boolean;
  targetCurrency?: string;
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

    const [{ data: positionsData, error: positionsError }, { data: settingsData, error: settingsError }] = await Promise.all([
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

    const usdToIlsRate = await getUsdToIlsRate();

    const annualGrowthRate = settingsData && isFiniteNumber(settingsData.annual_growth_rate)
      ? settingsData.annual_growth_rate
      : DEFAULT_GROWTH_RATE;

    const finnhubToken = settingsData?.finnhub_token || process.env.FINNHUB_TOKEN;

    const metrics = await Promise.all(
      positions.map(async (position) => {
        const quote = await fetchFinnhubQuote(position.symbol, { token: finnhubToken ?? undefined });
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
      entryPrice: toFixedNumber(metric.position.entryPrice),
      quantity: metric.position.quantity,
      entryDate: metric.position.entryDate,
      currentPrice: toFixedNumber(metric.currentPrice),
      projectedPrice: toFixedNumber(metric.projectedPrice),
      currentPnLUsd: toFixedNumber(metric.positionPnLUsd),
      projectedPnLUsd: toFixedNumber(metric.projectedPnLUsd),
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

    const responsePayload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      usdToIlsRate,
      targetCurrency,
      stocks: topStocks,
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
