import { NextRequest, NextResponse } from 'next/server';

import { mapCandleDataToPoints } from '@/lib/calculations';
import { expandPositionActivations, mapPositionRow } from '@/lib/positions';
import { getUsdToIlsRate } from '@/lib/services/exchange-rate';
import {
  fetchFinnhubQuoteCached,
  FinnhubConfigError,
  resolveFinnhubToken,
} from '@/lib/services/finnhub-cache';
import { fetchYahooCandlesData } from '@/lib/services/yahoo-candles';
import { getSupabaseClient } from '@/lib/supabase';
import { HistoricalPoint, Position } from '@/types';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RangeInfo = {
  key: string;
  symbol: string;
  from: number;
  to: number;
  activationStartBoundaryMs: number | null;
  activationEndBoundaryMs: number | null;
};

function buildRangeInfo(position: Position): RangeInfo {
  const key = position.activationId ?? position.id ?? position.symbol;
  const now = Math.floor(Date.now() / 1000);
  const activationStartMsRaw = position.activationStart
    ? new Date(position.activationStart).getTime()
    : undefined;
  const activationEndMsRaw = position.activationEnd
    ? new Date(position.activationEnd).getTime()
    : undefined;
  const activationStartMs =
    typeof activationStartMsRaw === 'number' && Number.isFinite(activationStartMsRaw)
      ? activationStartMsRaw
      : null;
  const activationEndMs =
    typeof activationEndMsRaw === 'number' && Number.isFinite(activationEndMsRaw)
      ? activationEndMsRaw
      : null;
  const activationStartBoundaryMs =
    activationStartMs !== null
      ? (() => {
          const startOfDay = new Date(activationStartMs);
          startOfDay.setHours(0, 0, 0, 0);
          return startOfDay.getTime();
        })()
      : null;
  const activationEndBoundaryMs =
    activationEndMs !== null
      ? (() => {
          const endOfDay = new Date(activationEndMs);
          endOfDay.setHours(23, 59, 59, 999);
          return endOfDay.getTime();
        })()
      : null;
  const entryDate = position.entryDate ? new Date(position.entryDate) : null;
  const entryTimestamp = entryDate instanceof Date && !Number.isNaN(entryDate.getTime())
    ? Math.floor(entryDate.getTime() / 1000)
    : null;
  const lotTimestamps = (position.lots ?? [])
    .map((lot) => Math.floor(new Date(lot.executedAt).getTime() / 1000))
    .filter((timestamp): timestamp is number => Number.isFinite(timestamp));
  const earliestLotTimestamp = lotTimestamps.length > 0 ? Math.min(...lotTimestamps) : null;
  const defaultLookback = now - 60 * 60 * 24 * 30;
  let baselineTimestamp = activationStartBoundaryMs !== null
    ? Math.floor(activationStartBoundaryMs / 1000)
    : earliestLotTimestamp ?? entryTimestamp ?? defaultLookback;
  const to = activationEndBoundaryMs !== null ? Math.floor(activationEndBoundaryMs / 1000) : now;

  if (!Number.isFinite(baselineTimestamp)) {
    baselineTimestamp = defaultLookback;
  }

  if (baselineTimestamp > to) {
    baselineTimestamp = to - 60 * 60 * 24 * 5;
  }

  let from = Math.min(baselineTimestamp, to);
  if (from === to) {
    from = Math.max(0, to - 60 * 60 * 24 * 5);
  }

  return {
    key,
    symbol: position.symbol,
    from,
    to,
    activationStartBoundaryMs,
    activationEndBoundaryMs,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceQuoteRefresh = searchParams.get('forceQuoteRefresh') === '1';

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
        .select('finnhub_token')
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

    const mappedPositions: Position[] = (positionsResult.data ?? []).map(mapPositionRow);
    const activationPositions = mappedPositions.flatMap((position) =>
      expandPositionActivations(position),
    );
    const rangeInfoList = activationPositions.map((position) => buildRangeInfo(position));
    const validFroms = rangeInfoList
      .map((range) => range.from)
      .filter((from): from is number => Number.isFinite(from) && from > 0);
    const validTos = rangeInfoList
      .map((range) => range.to)
      .filter((to): to is number => Number.isFinite(to) && to > 0);
    const minFrom = validFroms.length > 0 ? Math.min(...validFroms) : 0;
    const maxTo = validTos.length > 0 ? Math.max(...validTos) : 0;

    const usdToIlsPromise = getUsdToIlsRate();

    const fxHistoryPromise = (async (): Promise<HistoricalPoint[]> => {
      const allTimestamps = mappedPositions.flatMap((position) =>
        (position.lots ?? [])
          .map((lot) => new Date(lot.executedAt).getTime())
          .filter((timestamp) => Number.isFinite(timestamp)),
      );
      const activationBoundaries = activationPositions
        .flatMap((position) => [
          position.activationStart ? new Date(position.activationStart).getTime() : Number.NaN,
          position.activationEnd ? new Date(position.activationEnd).getTime() : Number.NaN,
          position.entryDate ? new Date(position.entryDate).getTime() : Number.NaN,
        ])
        .filter((timestamp) => Number.isFinite(timestamp));
      const nowSeconds = Math.floor(Date.now() / 1000);
      const minFxTimestamp = [...allTimestamps, ...activationBoundaries].reduce<number | null>(
        (min, value) => (min === null ? value : Math.min(min, value)),
        null,
      );
      const fxFrom = Math.max(
        0,
        Math.floor(((minFxTimestamp ?? Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000) - 2 * 24 * 60 * 60),
      );

      try {
        const fxCandles = await fetchYahooCandlesData('ILS=X', fxFrom, nowSeconds, 'D');
        return mapCandleDataToPoints(fxCandles);
      } catch (error) {
        console.error('Failed to load FX candles:', error);
        return [];
      }
    })();

    const quotesPromise = (async (): Promise<Record<string, { c?: number; d?: number }>> => {
      const normalizedSymbols = Array.from(
        new Set(mappedPositions.map((position) => position.symbol.trim().toUpperCase()).filter(Boolean)),
      );
      if (normalizedSymbols.length === 0) {
        return {};
      }

      let token: string;
      try {
        token = await resolveFinnhubToken(settingsResult.data?.finnhub_token);
      } catch (error) {
        if (error instanceof FinnhubConfigError) {
          console.warn('Finnhub token is not configured; skipping quote fetch.');
          return {};
        }
        throw error;
      }

      const quotePairs = await Promise.all(
        normalizedSymbols.map(async (symbol) => {
          try {
            const quote = await fetchFinnhubQuoteCached(symbol, token, { forceRefresh: forceQuoteRefresh });
            return [symbol, { c: quote.c, d: quote.d }] as const;
          } catch (error) {
            console.error(`Failed to fetch quote for ${symbol}:`, error);
            return [symbol, null] as const;
          }
        }),
      );

      const quotes: Record<string, { c?: number; d?: number }> = {};
      quotePairs.forEach(([symbol, quote]) => {
        if (quote) {
          quotes[symbol] = quote;
        }
      });

      return quotes;
    })();

    const candlesByKeyPromise = (async (): Promise<Record<string, HistoricalPoint[]>> => {
      const entries = await Promise.all(
        rangeInfoList.map(async (range) => {
          try {
            const candleData = await fetchYahooCandlesData(range.symbol, range.from, range.to, 'D');
            const points = mapCandleDataToPoints(candleData);
            const filteredPoints = points.filter((point) => {
              if (range.activationStartBoundaryMs !== null && point.timestamp < range.activationStartBoundaryMs) {
                return false;
              }
              if (range.activationEndBoundaryMs !== null && point.timestamp > range.activationEndBoundaryMs) {
                return false;
              }
              return true;
            });
            return [range.key, filteredPoints.length > 0 ? filteredPoints : points] as const;
          } catch (error) {
            console.error(`Failed to fetch candles for ${range.symbol}:`, error);
            return [range.key, [] as HistoricalPoint[]] as const;
          }
        }),
      );

      return Object.fromEntries(entries);
    })();

    const spyPointsPromise = (async (): Promise<HistoricalPoint[]> => {
      if (!(minFrom < Number.MAX_SAFE_INTEGER && maxTo > 0)) {
        return [];
      }

      try {
        const spyData = await fetchYahooCandlesData('SPY', minFrom, maxTo, 'D');
        return mapCandleDataToPoints(spyData);
      } catch (error) {
        console.error('Failed to load SPY candles:', error);
        return [];
      }
    })();

    const [usdToIls, fxHistoryPoints, quotes, candlesByKey, spyPoints] = await Promise.all([
      usdToIlsPromise,
      fxHistoryPromise,
      quotesPromise,
      candlesByKeyPromise,
      spyPointsPromise,
    ]);

    return NextResponse.json(
      {
        positions: mappedPositions,
        activationPositions,
        usdToIls,
        fxHistoryPoints,
        quotes,
        candlesByKey,
        spyPoints,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error('Portfolio dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to load portfolio dashboard data' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
