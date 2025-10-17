'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useApp } from '@/lib/context';
import { computeRealizedSales, mapPositionRow } from '@/lib/positions';
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
} from '@/types';

interface PositionOpenTimelinePoint {
  timestamp: number;
  openPnLUsd: number;
  openValueUsd: number;
}

interface SparklineResult {
  symbol: string;
  points: HistoricalPoint[];
  timeline: PositionOpenTimelinePoint[];
}

interface LoadSparklinesResult {
  sparklineData: Record<string, HistoricalPoint[]>;
  portfolioTimeline: PortfolioTimelinePoint[];
}

interface LoadOptions {
  background?: boolean;
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

  const loadSparklines = useCallback(
    async (positionsList: Position[], usdToIlsRate: number): Promise<LoadSparklinesResult> => {
      if (positionsList.length === 0) {
        return { sparklineData: {}, portfolioTimeline: [] };
      }

      const results = await Promise.all<SparklineResult>(
        positionsList.map(async (position) => {
          try {
            if (!position || position.quantity <= 0) {
              return {
                symbol: position.symbol,
                points: [],
                timeline: [],
              };
            }

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
            const safeQuantity = Math.max(position.quantity, 0);
            const timeline = points.map<PositionOpenTimelinePoint>((point) => {
              const openPnLUsd = (point.close - position.entryPrice) * safeQuantity;
              const costBasisUsd = position.entryPrice * safeQuantity;

              return {
                timestamp: point.timestamp,
                openPnLUsd,
                openValueUsd: costBasisUsd + openPnLUsd,
              };
            });

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

      const aggregatedOpenTimeline = new Map<
        number,
        { openPnLUsd: number; openValueUsd: number }
      >();

      results.forEach((result) => {
        result.timeline.forEach((point) => {
          const current = aggregatedOpenTimeline.get(point.timestamp) ?? {
            openPnLUsd: 0,
            openValueUsd: 0,
          };

          current.openPnLUsd += point.openPnLUsd;
          current.openValueUsd += point.openValueUsd;

          aggregatedOpenTimeline.set(point.timestamp, current);
        });
      });

      const realizedSales = positionsList.flatMap((position) =>
        computeRealizedSales(position).map((sale) => ({
          ...sale,
          profitIls: sale.profitUsd * usdToIlsRate,
        }))
      );

      const saleEvents = new Map<
        number,
        { realizedUsd: number; realizedIls: number; taxesUsd: number; taxesIls: number }
      >();

      let cumulativeProfitUsd = 0;
      let peakProfitUsd = 0;

      realizedSales
        .slice()
        .sort((a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime())
        .forEach((sale) => {
          const timestamp = new Date(sale.sellDate).getTime();
          if (!Number.isFinite(timestamp)) {
            return;
          }

          cumulativeProfitUsd += sale.profitUsd;

          let taxUsdDelta = 0;
          let taxIlsDelta = 0;

          if (sale.profitUsd > 0) {
            const newPeakProfitUsd = Math.max(peakProfitUsd, cumulativeProfitUsd);
            const taxableProfitUsd = Math.max(0, newPeakProfitUsd - peakProfitUsd);

            if (taxableProfitUsd > 1e-8) {
              const saleRate = sale.profitUsd !== 0 ? sale.profitIls / sale.profitUsd : usdToIlsRate;
              taxUsdDelta = taxableProfitUsd * 0.25;
              taxIlsDelta = taxUsdDelta * saleRate;
            }

            peakProfitUsd = newPeakProfitUsd;
          } else {
            peakProfitUsd = Math.max(peakProfitUsd, cumulativeProfitUsd);
          }

          const current = saleEvents.get(timestamp) ?? {
            realizedUsd: 0,
            realizedIls: 0,
            taxesUsd: 0,
            taxesIls: 0,
          };

          current.realizedUsd += sale.profitUsd;
          current.realizedIls += sale.profitIls;
          current.taxesUsd += taxUsdDelta;
          current.taxesIls += taxIlsDelta;

          saleEvents.set(timestamp, current);
        });

      const allTimestamps = new Set<number>();
      aggregatedOpenTimeline.forEach((_, key) => allTimestamps.add(key));
      saleEvents.forEach((_, key) => allTimestamps.add(key));

      const sortedTimeline = Array.from(allTimestamps)
        .sort((a, b) => a - b)
        .map((timestamp) => {
          const openData = aggregatedOpenTimeline.get(timestamp);
          const saleData = saleEvents.get(timestamp);

          return { timestamp, openData, saleData };
        });

      let lastOpenPnLUsd = 0;
      let lastOpenValueUsd = 0;
      let cumulativeRealizedUsd = 0;
      let cumulativeRealizedIls = 0;
      let cumulativeTaxesUsd = 0;
      let cumulativeTaxesIls = 0;

      const portfolioTimeline: PortfolioTimelinePoint[] = sortedTimeline.map(({ timestamp, openData, saleData }) => {
        if (openData) {
          lastOpenPnLUsd = openData.openPnLUsd;
          lastOpenValueUsd = openData.openValueUsd;
        }

        if (saleData) {
          cumulativeRealizedUsd += saleData.realizedUsd;
          cumulativeRealizedIls += saleData.realizedIls;
          cumulativeTaxesUsd += saleData.taxesUsd;
          cumulativeTaxesIls += saleData.taxesIls;
        }

        const totalPnLUsd = lastOpenPnLUsd + cumulativeRealizedUsd - cumulativeTaxesUsd;
        const totalPnLIls = totalPnLUsd * usdToIlsRate;
        const openValueIls = lastOpenValueUsd * usdToIlsRate;
        const netWorthUsd = lastOpenValueUsd + cumulativeRealizedUsd - cumulativeTaxesUsd;
        const netWorthIls = netWorthUsd * usdToIlsRate;

        return {
          timestamp,
          totalPnLUsd,
          totalPnLIls,
          openValueUsd: lastOpenValueUsd,
          openValueIls,
          realizedProfitUsd: cumulativeRealizedUsd,
          realizedProfitIls: cumulativeRealizedIls,
          taxesPaidUsd: cumulativeTaxesUsd,
          taxesPaidIls: cumulativeTaxesIls,
          netWorthUsd,
          netWorthIls,
        };
      });

      const sparklineData = Object.fromEntries(sparklineEntries);

      return {
        sparklineData,
        portfolioTimeline,
      };
    },
    [settings.finnhubToken]
  );

  const loadData = useCallback(
    async ({ background = false }: LoadOptions = {}) => {
      try {
        if (!background) {
          setLoading(true);
        }

        const { data: positionsData, error: positionsError } = await supabase
          .from('positions')
          .select('*, position_lots(*)')
          .order('symbol');

        if (positionsError) throw positionsError;

        const mappedPositions: Position[] = (positionsData || []).map(mapPositionRow);
        const rateResponse = await fetch('/api/exchange-rate');
        const rateData = await rateResponse.json();
        const rate = rateData.usdToIls || 3.7;

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
        const portfolioSummary = calculatePortfolioSummary(calculatedMetrics, rate);
        const { sparklineData: nextSparklineData, portfolioTimeline: nextPortfolioTimeline } =
          await loadSparklines(mappedPositions, rate);

        setPositions(mappedPositions);
        setUsdToIls(rate);
        setMetrics(calculatedMetrics);
        setSummary(portfolioSummary);
        setSparklineData(nextSparklineData);
        setPortfolioTimeline(nextPortfolioTimeline);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Error loading portfolio data:', error);
      } finally {
        if (!background) {
          setLoading(false);
        }
      }
    },
    [loadSparklines, settings.annualGrowthRate, settings.finnhubToken]
  );

  useEffect(() => {
    void loadData();
  }, [loadData, refreshTrigger]);

  useEffect(() => {
    if (!settings.refreshInterval || settings.refreshInterval <= 0) {
      return;
    }

    const intervalMs = settings.refreshInterval * 60 * 1000;
    const intervalId = window.setInterval(() => {
      void loadData({ background: true });
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadData, settings.refreshInterval]);

  return {
    loading,
    positions,
    metrics,
    summary,
    sparklineData,
    portfolioTimeline,
    usdToIls,
    lastUpdate,
    reload: () => loadData(),
  };
}
