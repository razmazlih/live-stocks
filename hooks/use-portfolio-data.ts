'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useApp } from '@/lib/context';
import { mapPositionRow } from '@/lib/positions';
import {
  calculatePortfolioSummary,
  calculatePositionMetrics,
  mapCandleDataToPoints,
} from '@/lib/calculations';
import {
  CandleData,
  HistoricalPoint,
  Position,
  PositionMetrics,
  PortfolioSummary,
  PortfolioTimelinePoint,
  PositionTriggerAlert,
} from '@/types';

interface SparklineResult {
  symbol: string;
  points: HistoricalPoint[];
  timeline: PortfolioTimelinePoint[];
}

export function usePortfolioData() {
  const { settings, refreshTrigger } = useApp();

  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<PositionMetrics[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [sparklineData, setSparklineData] = useState<Record<string, HistoricalPoint[]>>({});
  const [portfolioTimeline, setPortfolioTimeline] = useState<PortfolioTimelinePoint[]>([]);
  const [usdToIls, setUsdToIls] = useState(3.7);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [positionTriggers, setPositionTriggers] = useState<Record<string, PositionTriggerAlert | null>>({});

  const loadSparklines = useCallback(
    async (positionsList: Position[]) => {
      setSparklineData({});
      setPortfolioTimeline([]);

      if (positionsList.length === 0) {
        return;
      }

      const results = await Promise.all<SparklineResult>(
        positionsList.map(async (position) => {
          try {
            const now = Math.floor(Date.now() / 1000);
            const entryDate = position.entryDate ? new Date(position.entryDate) : null;
            const entryTimestamp = entryDate instanceof Date && !Number.isNaN(entryDate.getTime())
              ? Math.floor(entryDate.getTime() / 1000)
              : now - 60 * 60 * 24 * 30;
            const from = Math.min(entryTimestamp, now);

            const response = await fetch(
              `/api/candles?symbol=${encodeURIComponent(position.symbol)}&resolution=D&from=${from}&to=${now}${
                settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''
              }`
            );

            if (!response.ok) {
              console.warn(`Failed to fetch candles for ${position.symbol}: HTTP ${response.status}`);
              return {
                symbol: position.symbol,
                points: [],
                timeline: [],
              };
            }

            const candleData = (await response.json()) as CandleData & { error?: string };

            if (candleData?.error) {
              console.warn(`Candles API error for ${position.symbol}:`, candleData.error);
              return {
                symbol: position.symbol,
                points: [],
                timeline: [],
              };
            }

            const points = mapCandleDataToPoints(candleData);
            const timeline = points.map<PortfolioTimelinePoint>((point) => ({
              timestamp: point.timestamp,
              totalPnLUsd: (point.close - position.entryPrice) * position.quantity,
            }));

            return {
              symbol: position.symbol,
              points,
              timeline,
            };
          } catch (error) {
            console.error(`Failed to load sparkline for ${position.symbol}:`, error);
            return {
              symbol: position.symbol,
              points: [],
              timeline: [],
            };
          }
        })
      );

      const sparklineEntries = results.map((result) => [result.symbol, result.points] as const);
      setSparklineData(Object.fromEntries(sparklineEntries));

      const aggregatedTimeline = new Map<number, number>();
      results.forEach((result) => {
        result.timeline.forEach((point) => {
          aggregatedTimeline.set(
            point.timestamp,
            (aggregatedTimeline.get(point.timestamp) ?? 0) + point.totalPnLUsd
          );
        });
      });

      const sortedTimeline = Array.from(aggregatedTimeline.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([timestamp, totalPnLUsd]) => ({ timestamp, totalPnLUsd }));

      setPortfolioTimeline(sortedTimeline);
    },
    [settings.finnhubToken]
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const { data: positionsData, error: positionsError } = await supabase
        .from('positions')
        .select('*, position_lots(*)')
        .order('symbol');

      if (positionsError) throw positionsError;

      const mappedPositions: Position[] = (positionsData || []).map(mapPositionRow);

      setPositions(mappedPositions);

      const rateResponse = await fetch('/api/exchange-rate');
      const rateData = await rateResponse.json();
      const rate = rateData.usdToIls || 3.7;
      setUsdToIls(rate);

      const metricsPromises = mappedPositions.map(async (position) => {
        try {
          const quoteResponse = await fetch(
            `/api/quote?symbol=${position.symbol}${
              settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''
            }`
          );
          const quoteData = await quoteResponse.json();

          const currentPrice = quoteData.c || position.entryPrice;
          const dailyChange = quoteData.d;

          return calculatePositionMetrics(
            position,
            currentPrice,
            rate,
            settings.annualGrowthRate,
            dailyChange
          );
        } catch (error) {
          console.error(`Failed to fetch quote for ${position.symbol}:`, error);
          return calculatePositionMetrics(
            position,
            position.entryPrice,
            rate,
            settings.annualGrowthRate
          );
        }
      });

      const calculatedMetrics = await Promise.all(metricsPromises);
      setMetrics(calculatedMetrics);

      const triggerEntries = await Promise.all(
        mappedPositions.map(async (position) => {
          try {
            const response = await fetch(`/api/${encodeURIComponent(position.symbol)}-trigger`);

            if (!response.ok) {
              return [position.symbol, null] as const;
            }

            const data = (await response.json()) as { alert?: PositionTriggerAlert | null };
            return [position.symbol, data.alert ?? null] as const;
          } catch (error) {
            console.warn(`Failed to fetch triggers for ${position.symbol}:`, error);
            return [position.symbol, null] as const;
          }
        })
      );

      setPositionTriggers(Object.fromEntries(triggerEntries));

      const portfolioSummary = calculatePortfolioSummary(calculatedMetrics, rate);
      setSummary(portfolioSummary);

      await loadSparklines(mappedPositions);

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading portfolio data:', error);
    } finally {
      setLoading(false);
    }
  }, [loadSparklines, settings.annualGrowthRate, settings.finnhubToken]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  return {
    loading,
    positions,
    metrics,
    summary,
    sparklineData,
    portfolioTimeline,
    usdToIls,
    lastUpdate,
    positionTriggers,
    reload: loadData,
  };
}
