import { NextResponse } from 'next/server';
import {
  calculatePortfolioSummary,
  calculatePositionMetrics,
  calculateRealizedTaxLiability,
  mapCandleDataToPoints,
} from '@/lib/calculations';
import { buildUsdIlsRateResolver } from '@/lib/services/historical-fx';
import { computeRealizedSalesWithFx, mapPositionRow } from '@/lib/positions';
import { fetchFinnhubQuote } from '@/lib/services/finnhub';
import { getUsdToIlsRate } from '@/lib/services/exchange-rate';
import { getSupabaseClient } from '@/lib/supabase';
import { fetchWithRetry } from '@/lib/http';
import { isFiniteNumber, toFixedNumber } from '@/lib/utils/numbers';
import { CandleData, Position } from '@/types';

const DEFAULT_GROWTH_RATE = Number.parseFloat(process.env.DEFAULT_GROWTH_RATE ?? '0.05');
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;
const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          close?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
}

async function fetchUsdIlsHistoricalPoints(fromSec: number, toSec: number) {
  if (!Number.isFinite(fromSec) || !Number.isFinite(toSec) || fromSec >= toSec) {
    return [];
  }

  try {
    const url =
      `${YAHOO_BASE_URL}/${encodeURIComponent('ILS=X')}` +
      `?period1=${fromSec}&period2=${toSec}&interval=1d&includeAdjustedClose=true`;

    const response = await fetchWithRetry(
      url,
      { cache: 'no-store' },
      { shouldRetry: (res) => !res.ok },
    );
    const data = (await response.json()) as YahooChartResponse;
    const result = data.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const timestamps = result?.timestamp ?? [];

    if (!timestamps.length || !quote) {
      return [];
    }

    const entries: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> = [];
    const length = Math.max(
      timestamps.length,
      quote.open?.length ?? 0,
      quote.high?.length ?? 0,
      quote.low?.length ?? 0,
      quote.close?.length ?? 0,
      quote.volume?.length ?? 0,
    );

    for (let i = 0; i < length; i += 1) {
      const t = timestamps[i];
      const o = quote.open?.[i] ?? null;
      const h = quote.high?.[i] ?? null;
      const l = quote.low?.[i] ?? null;
      const c = quote.close?.[i] ?? null;
      const v = quote.volume?.[i] ?? null;

      if (
        typeof t !== 'number' ||
        t < fromSec ||
        t > toSec ||
        o === null ||
        h === null ||
        l === null ||
        c === null ||
        v === null
      ) {
        continue;
      }

      entries.push({ t, o, h, l, c, v });
    }

    if (!entries.length) {
      return [];
    }

    const candleData: CandleData = {
      t: entries.map((item) => item.t),
      o: entries.map((item) => item.o),
      h: entries.map((item) => item.h),
      l: entries.map((item) => item.l),
      c: entries.map((item) => item.c),
      v: entries.map((item) => item.v),
      s: 'ok',
    };

    return mapCandleDataToPoints(candleData);
  } catch {
    return [];
  }
}

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
