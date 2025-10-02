'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CandleData, Position, PositionMetrics, PortfolioSummary } from '@/types';
import { calculatePositionMetrics, calculatePortfolioSummary, formatCurrency, mapCandleDataToPoints } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { PositionCard } from '@/components/position-card';
import { PortfolioVisualizations } from '@/components/portfolio-visualizations';
import { Button } from '@/components/ui/button';
import { TrendingUp, RefreshCw, Settings, Plus, BarChart3 } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { locale, settings, refreshTrigger } = useApp();
  const { t } = useTranslation(locale);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<PositionMetrics[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [sparklineData, setSparklineData] = useState<Record<string, number[]>>({});
  const [usdToIls, setUsdToIls] = useState(3.7);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadSparklines = useCallback(async (positionsList: Position[]) => {
    setSparklineData({});

    if (positionsList.length === 0) {
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const from = now - 60 * 60 * 24 * 30;

    const results = await Promise.all(
      positionsList.map(async (position) => {
        try {
          const response = await fetch(
            `/api/candles?symbol=${encodeURIComponent(position.symbol)}&resolution=D&from=${from}&to=${now}${settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''}`
          );

          if (!response.ok) {
            console.warn(`Failed to fetch candles for ${position.symbol}: HTTP ${response.status}`);
            return [position.symbol, []] as const;
          }

          const candleData = (await response.json()) as CandleData & { error?: string };

          if (candleData?.error) {
            console.warn(`Candles API error for ${position.symbol}:`, candleData.error);
            return [position.symbol, []] as const;
          }

          const points = mapCandleDataToPoints(candleData);
          const closes = points.map((point) => point.close);

          return [position.symbol, closes] as const;
        } catch (error) {
          console.error(`Failed to load sparkline for ${position.symbol}:`, error);
          return [position.symbol, []] as const;
        }
      })
    );

    setSparklineData(Object.fromEntries(results));
  }, [settings.finnhubToken]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const { data: positionsData, error: positionsError } = await supabase
        .from('positions')
        .select('*')
        .order('symbol');

      if (positionsError) throw positionsError;

      const mappedPositions: Position[] = (positionsData || []).map(p => ({
        id: p.id,
        symbol: p.symbol,
        display: p.display,
        imageUrl: p.image_url,
        entryPrice: parseFloat(p.entry_price.toString()),
        quantity: parseFloat(p.quantity.toString()),
        entryDate: p.entry_date,
      }));

      setPositions(mappedPositions);

      const rateResponse = await fetch('/api/exchange-rate');
      const rateData = await rateResponse.json();
      const rate = rateData.usdToIls || 3.7;
      setUsdToIls(rate);

      const metricsPromises = mappedPositions.map(async (position) => {
        try {
          const quoteResponse = await fetch(
            `/api/quote?symbol=${position.symbol}${settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''}`
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

      const portfolioSummary = calculatePortfolioSummary(calculatedMetrics, rate);
      setSummary(portfolioSummary);

      await loadSparklines(mappedPositions);

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [settings.annualGrowthRate, settings.finnhubToken]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5FAFF] via-[#E6F2FF] to-[#D9E9FF]">
      <div className="max-w-7xl mx-auto p-6">
        <header className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-[#3B82F6]" />
              <h1 className="text-3xl font-bold text-[#0F172A]">{t.app.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Link href="/analysis">
                <Button variant="outline" size="sm" title={t.analysis.title}>
                  <BarChart3 className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/positions">
                <Button variant="outline" size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/settings">
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
          <p className="text-sm text-[#475569]">
            {t.app.updated} {formatTime(lastUpdate)}
          </p>
        </header>

        <div className="backdrop-blur-sm bg-white/85 rounded-2xl border border-white/50 shadow-xl p-6 mb-6">
          {loading ? (
            <div className="text-center py-12 text-gray-500">{t.common.loading}</div>
          ) : positions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">{t.dashboard.noPositions}</p>
              <Link href="/positions">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  {t.positions.add}
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-6">
                {metrics.map((m) => (
                  <PositionCard
                    key={m.position.id || m.position.symbol}
                    metrics={m}
                    sparklineData={sparklineData[m.position.symbol] || []}
                  />
                ))}
              </div>

              {summary && (
                <div className="border-t border-gray-200 pt-6 mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">{t.dashboard.combined}</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">USD:</span>
                          <span className={`font-bold text-lg ${summary.totalCombinedUsd >= 0 ? 'text-[#4AA956]' : 'text-[#D22E2E]'}`}>
                            {formatCurrency(summary.totalCombinedUsd, 'USD', locale)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">ILS:</span>
                          <span className={`font-bold text-lg ${summary.totalCombinedIls >= 0 ? 'text-[#4AA956]' : 'text-[#D22E2E]'}`}>
                            {formatCurrency(summary.totalCombinedIls, 'ILS', locale)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">{t.dashboard.exchangeRate}</h3>
                      <p className="text-gray-700">
                        1 USD ≈ <span className="font-semibold">₪{usdToIls.toFixed(2)}</span>
                      </p>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-4">{t.dashboard.visualizationsTitle}</h3>
                  <PortfolioVisualizations metrics={metrics} summary={summary} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
