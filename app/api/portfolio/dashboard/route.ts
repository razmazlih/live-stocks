import { positionFxTimestamps } from '@/lib/reconciliation-quality';
import { NextRequest, NextResponse } from 'next/server';

import { mapCandleDataToPoints } from '@/lib/calculations';
import { expandPositionActivations, mapPositionRow } from '@/lib/positions';
import { getUsdToIlsRate } from '@/lib/services/exchange-rate';
import { normalizeToUtcDay } from '@/lib/services/historical-fx';
import {
  fetchFinnhubQuoteCached,
  FinnhubConfigError,
  resolveFinnhubToken,
} from '@/lib/services/finnhub-cache';
import { fetchYahooCandlesData } from '@/lib/services/yahoo-candles';
import { requireApiPrincipal, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { HistoricalPoint, Position } from '@/types';

const NO_STORE_HEADERS = PRIVATE_HEADERS;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RangeInfo = {
  key: string;
  symbol: string;
  from: number;
  contextFrom: number;
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
      ? normalizeToUtcDay(activationStartMs)
      : null;
  const activationEndBoundaryMs =
    activationEndMs !== null
      ? normalizeToUtcDay(activationEndMs) + 24 * 60 * 60 * 1000 - 1
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

  // Yahoo's daily candle timestamp can precede an intraday purchase. Request
  // from midnight so that the purchase day's closing price is retained.
  let from = Math.floor(normalizeToUtcDay(Math.min(baselineTimestamp, to) * 1000) / 1000);
  if (from === to) {
    from = Math.max(0, to - 60 * 60 * 24 * 5);
  }

  return {
    key,
    symbol: position.symbol,
    from,
    contextFrom: Math.max(0, (activationStartBoundaryMs !== null ? Math.floor(activationStartBoundaryMs / 1000) : from) - 7 * 24 * 60 * 60),
    to,
    activationStartBoundaryMs,
    activationEndBoundaryMs,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceQuoteRefresh = searchParams.get('forceQuoteRefresh') === '1';

    const principal = await requireApiPrincipal(request);
    const supabase = principal.supabase;

    const positionsResult = await (
      supabase
        .from('positions')
        .select('*, position_lots(*)')
        .eq('user_id', principal.userId)
        .order('symbol')
    );

    if (positionsResult.error) {
      console.error('Failed to load positions:', positionsResult.error);
      return NextResponse.json(
        { error: 'Failed to load positions' },
        { status: 500, headers: NO_STORE_HEADERS },
      );
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

    const usdToIlsPromise = getUsdToIlsRate({ allowFallback: false });

    const fxHistoryPromise = (async (): Promise<HistoricalPoint[]> => {
      const allTimestamps = mappedPositions.flatMap(positionFxTimestamps);
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
        Math.floor(normalizeToUtcDay(minFxTimestamp ?? Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000) - 10 * 24 * 60 * 60,
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
        token = await resolveFinnhubToken(principal.userId);
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

    const candlesByKeyPromise = (async () => {
      const entries = await Promise.all(
        rangeInfoList.map(async (range) => {
          try {
            const candleData = await fetchYahooCandlesData(range.symbol, Math.min(range.from, range.contextFrom), range.to, 'D');
            const points = mapCandleDataToPoints(candleData);
            // Context prices are presentation-only. Portfolio valuation must keep
            // the original activation range and must never acquire pre-entry P/L.
            const contextPoints = points.filter(point => point.timestamp >= range.contextFrom * 1000 && point.timestamp <= range.to * 1000
              && (range.activationEndBoundaryMs === null || point.timestamp <= range.activationEndBoundaryMs));
            const originalPoints = points.filter(point => point.timestamp >= range.from * 1000);
            const filteredPoints = originalPoints.filter((point) => {
              if (range.activationStartBoundaryMs !== null && point.timestamp < range.activationStartBoundaryMs) {
                return false;
              }
              if (range.activationEndBoundaryMs !== null && point.timestamp > range.activationEndBoundaryMs) {
                return false;
              }
              return true;
            });
            return { key: range.key, points: filteredPoints.length > 0 ? filteredPoints : originalPoints, contextPoints };
          } catch (error) {
            console.error(`Failed to fetch candles for ${range.symbol}:`, error);
            return { key: range.key, points: [] as HistoricalPoint[], contextPoints: [] as HistoricalPoint[] };
          }
        }),
      );

      return {
        candlesByKey: Object.fromEntries(entries.map(entry => [entry.key, entry.points])),
        contextCandlesByKey: Object.fromEntries(entries.map(entry => [entry.key, entry.contextPoints])),
      };
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

    const [usdToIls, fxHistoryPoints, quotes, candles, spyPoints] = await Promise.all([
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
        candlesByKey: candles.candlesByKey,
        contextCandlesByKey: candles.contextCandlesByKey,
        spyPoints,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const authResponse = authenticationResponse(error);
    if (authResponse) return authResponse;
    console.error('Portfolio dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to load portfolio dashboard data' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
