'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CandleData, Position, PositionMetrics, PortfolioSummary } from '@/types';
import { calculatePositionMetrics, calculatePortfolioSummary, formatCurrency, formatPercent, mapCandleDataToPoints } from '@/lib/calculations';
import { mapPositionRow } from '@/lib/positions';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { PositionCard } from '@/components/position-card';
import { PortfolioVisualizations } from '@/components/portfolio-visualizations';
import { PortfolioOverviewChart, PortfolioTimelinePoint } from '@/components/portfolio-overview-chart';
import { Button } from '@/components/ui/button';
import { TrendingUp, RefreshCw, Settings, Plus, BarChart3, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { locale, settings, refreshTrigger } = useApp();
  const { t } = useTranslation(locale);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<PositionMetrics[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [sparklineData, setSparklineData] = useState<Record<string, number[]>>({});
  const [portfolioTimeline, setPortfolioTimeline] = useState<PortfolioTimelinePoint[]>([]);
  const [usdToIls, setUsdToIls] = useState(3.7);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadSparklines = useCallback(async (positionsList: Position[]) => {
    setSparklineData({});
    setPortfolioTimeline([]);

    if (positionsList.length === 0) {
      return;
    }

    const results = await Promise.all(
      positionsList.map(async (position) => {
        try {
          const now = Math.floor(Date.now() / 1000);
          const entryDate = position.entryDate ? new Date(position.entryDate) : null;
          const entryTimestamp = entryDate instanceof Date && !Number.isNaN(entryDate.getTime())
            ? Math.floor(entryDate.getTime() / 1000)
            : now - 60 * 60 * 24 * 30;
          const from = Math.min(entryTimestamp, now);

          const response = await fetch(
            `/api/candles?symbol=${encodeURIComponent(position.symbol)}&resolution=D&from=${from}&to=${now}${settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''}`
          );

          if (!response.ok) {
            console.warn(`Failed to fetch candles for ${position.symbol}: HTTP ${response.status}`);
            return {
              symbol: position.symbol,
              closes: [],
              timeline: [],
            };
          }

          const candleData = (await response.json()) as CandleData & { error?: string };

          if (candleData?.error) {
            console.warn(`Candles API error for ${position.symbol}:`, candleData.error);
            return {
              symbol: position.symbol,
              closes: [],
              timeline: [],
            };
          }

          const points = mapCandleDataToPoints(candleData);
          const closes = points.map((point) => point.close);
          const timeline = points.map((point) => ({
            timestamp: point.timestamp,
            totalPnLUsd: (point.close - position.entryPrice) * position.quantity,
          }));

          return {
            symbol: position.symbol,
            closes,
            timeline,
          };
        } catch (error) {
          console.error(`Failed to load sparkline for ${position.symbol}:`, error);
          return {
            symbol: position.symbol,
            closes: [],
            timeline: [],
          };
        }
      })
    );

    const sparklineEntries = results.map((result) => [result.symbol, result.closes] as const);
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
  }, [settings.finnhubToken]);

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
  }, [settings.annualGrowthRate, settings.finnhubToken, loadSparklines]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSignedCurrency = (value: number, currency: 'USD' | 'ILS') => {
    const formatted = formatCurrency(value, currency, locale);
    return value > 0 ? `+${formatted}` : formatted;
  };

  const formatSignedPercent = (value: number) => {
    const formatted = formatPercent(value, locale);
    return value > 0 ? `+${formatted}` : formatted;
  };

  const getTrendTone = (value: number) => {
    if (value > 0) {
      return {
        text: 'text-emerald-600',
        badge: 'bg-emerald-50 text-emerald-600',
      };
    }

    if (value < 0) {
      return {
        text: 'text-rose-600',
        badge: 'bg-rose-50 text-rose-600',
      };
    }

    return {
      text: 'text-slate-600',
      badge: 'bg-slate-100 text-slate-500',
    };
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) {
      return <ArrowUpRight className="h-4 w-4" />;
    }

    if (value < 0) {
      return <ArrowDownRight className="h-4 w-4" />;
    }

    return <Minus className="h-4 w-4" />;
  };

  const hasDailyChange = metrics.some((metric) => typeof metric.dailyChange === 'number');
  const totalDailyChangeUsd = metrics.reduce(
    (acc, metric) => acc + (metric.dailyChange ?? 0) * metric.position.quantity,
    0
  );
  const dailyChangeTone = getTrendTone(totalDailyChangeUsd);
  const dailyChangeIcon = getTrendIcon(totalDailyChangeUsd);

  const currentRate = summary?.usdToIlsRate ?? usdToIls;
  const totalValueIls = summary ? summary.totalValue * summary.usdToIlsRate : 0;
  const totalReturnUsd = summary ? summary.totalValue - summary.totalCost : 0;
  const totalReturnPercent = summary && summary.totalCost !== 0 ? (totalReturnUsd / summary.totalCost) * 100 : 0;

  type SummaryCard = {
    key: string;
    label: string;
    value: string;
    valueClass?: string;
    secondary?: { label: string; value: string };
    helper?: { label: string; value: string }[];
    badge?: { value: string; tone: { text: string; badge: string }; icon: JSX.Element };
    footnote?: string;
  };

  const summaryCards: SummaryCard[] = summary
    ? [
        {
          key: 'value',
          label: t.dashboard.totalValue,
          value: formatCurrency(summary.totalValue, 'USD', locale),
          valueClass: 'text-3xl font-semibold text-slate-900',
          secondary: {
            label: 'ILS',
            value: formatCurrency(totalValueIls, 'ILS', locale),
          },
          helper: [
            { label: t.dashboard.totalCost, value: formatCurrency(summary.totalCost, 'USD', locale) },
            { label: t.dashboard.totalReturn, value: formatSignedCurrency(totalReturnUsd, 'USD') },
          ],
          badge: {
            value: formatSignedPercent(totalReturnPercent),
            tone: getTrendTone(totalReturnUsd),
            icon: getTrendIcon(totalReturnUsd),
          },
          footnote: `1 USD ≈ ${formatCurrency(currentRate, 'ILS', locale)}`,
        },
        {
          key: 'current',
          label: t.dashboard.currentPnL,
          value: formatSignedCurrency(summary.totalCurrentPnLUsd, 'USD'),
          valueClass: `text-3xl font-semibold ${getTrendTone(summary.totalCurrentPnLUsd).text}`,
          secondary: {
            label: 'ILS',
            value: formatSignedCurrency(summary.totalCurrentPnLIls, 'ILS'),
          },
        },
        {
          key: 'projected',
          label: t.dashboard.projectedPnL,
          value: formatSignedCurrency(summary.totalProjectedPnLUsd, 'USD'),
          valueClass: `text-3xl font-semibold ${getTrendTone(summary.totalProjectedPnLUsd).text}`,
          secondary: {
            label: 'ILS',
            value: formatSignedCurrency(summary.totalProjectedPnLIls, 'ILS'),
          },
        },
        {
          key: 'combined',
          label: t.dashboard.combinedPnL,
          value: formatSignedCurrency(summary.totalCombinedUsd, 'USD'),
          valueClass: `text-3xl font-semibold ${getTrendTone(summary.totalCombinedUsd).text}`,
          secondary: {
            label: 'ILS',
            value: formatSignedCurrency(summary.totalCombinedIls, 'ILS'),
          },
        },
      ]
    : [];

  const pageSections = [
    { id: 'portfolio-overview', label: t.dashboard.summaryTitle },
    { id: 'positions', label: t.dashboard.positionsTitle },
    { id: 'visualizations', label: t.dashboard.visualizationsTitle },
    { id: 'settings', label: t.settings.title, href: '/settings' },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#EEF5FF]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#E4F1FF] via-[#F8FBFF] to-[#E3EEFF]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_60%)]" />
      <div className="relative">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-6 py-6 shadow-xl backdrop-blur-sm">
            <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-blue-200/60 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-blue-100 p-3 text-blue-600 shadow-inner">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-[#0F172A] sm:text-4xl">{t.app.title}</h1>
                    <p className="mt-2 max-w-xl text-base text-slate-600">{t.app.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
                  <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-600 shadow-sm">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                    {t.app.updated} {formatTime(lastUpdate)}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-slate-600 shadow-sm">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    1 USD ≈ {formatCurrency(currentRate, 'ILS', locale)}
                  </span>
                  {hasDailyChange && (
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${dailyChangeTone.badge}`}
                    >
                      {dailyChangeIcon}
                      {formatSignedCurrency(totalDailyChangeUsd, 'USD')}
                      <span className="text-xs font-medium text-slate-600/80">{t.dashboard.dailyChange}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/70 p-5 shadow-inner backdrop-blur-sm">
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t.dashboard.quickActions}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{t.common.refresh}</span>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    className="gap-2 bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]"
                  >
                    <Link href="/analysis">
                      <BarChart3 className="h-4 w-4" />
                      <span>{t.analysis.title}</span>
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" size="sm" className="gap-2">
                    <Link href="/positions">
                      <Plus className="h-4 w-4" />
                      <span>{t.positions.add}</span>
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm" className="gap-2 text-slate-600 hover:text-slate-900">
                    <Link href="/settings">
                      <Settings className="h-4 w-4" />
                      <span className="hidden sm:inline">{t.settings.title}</span>
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <nav
            aria-label={t.dashboard.quickActions}
            className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {pageSections.map((section) => {
              const href = section.href ?? `#${section.id}`;

              return (
                <Button
                  key={section.id}
                  asChild
                  variant="secondary"
                  size="lg"
                  className="group flex items-center justify-between rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-left text-slate-700 shadow-inner transition hover:-translate-y-0.5 hover:border-blue-100 hover:bg-white/90"
                >
                  <Link href={href}>
                    <span className="text-sm font-semibold">{section.label}</span>
                    <ArrowUpRight className="h-4 w-4 text-blue-500 transition group-hover:translate-x-1" />
                  </Link>
                </Button>
              );
            })}
          </nav>

          <main className="mt-8">
            <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-4 py-8 shadow-xl backdrop-blur-sm sm:px-8">
              <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-blue-100/50 blur-3xl" />
              <div className="relative z-10">
                {loading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
                    <p>{t.common.loading}</p>
                  </div>
                ) : positions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                    <div className="rounded-full bg-blue-100 p-3 text-blue-600 shadow-inner">
                      <Plus className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-slate-800">{t.dashboard.noPositions}</p>
                      <p className="text-sm text-slate-500">{t.positions.title}</p>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      className="gap-2 bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]"
                    >
                      <Link href="/positions">
                        <Plus className="h-4 w-4" />
                        <span>{t.positions.add}</span>
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-12">
                    {summary && summaryCards.length > 0 && (
                      <div
                        id="portfolio-overview"
                        className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
                      >
                        <section aria-labelledby="portfolio-summary-heading" className="space-y-5">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h2
                              id="portfolio-summary-heading"
                              className="text-xl font-semibold text-slate-900"
                            >
                              {t.dashboard.summaryTitle}
                            </h2>
                            {hasDailyChange && (
                              <span
                                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${dailyChangeTone.badge}`}
                              >
                                {dailyChangeIcon}
                                {formatSignedCurrency(totalDailyChangeUsd, 'USD')}
                                <span className="text-xs font-medium text-slate-600/80">{t.dashboard.dailyChange}</span>
                              </span>
                            )}
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                            {summaryCards.map((card) => (
                              <div
                                key={card.key}
                                className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-5 shadow-inner"
                              >
                                <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-blue-100/40 blur-3xl" />
                                <div className="relative z-10 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-slate-500">{card.label}</p>
                                    {card.badge && (
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${card.badge.tone.badge}`}
                                      >
                                        {card.badge.icon}
                                        {card.badge.value}
                                      </span>
                                    )}
                                  </div>
                                  <p className={card.valueClass}>{card.value}</p>
                                  {card.secondary && (
                                    <p className="text-sm text-slate-500">
                                      {card.secondary.label}:{' '}
                                      <span className="font-medium text-slate-700">{card.secondary.value}</span>
                                    </p>
                                  )}
                                  {card.helper?.map((helper) => (
                                    <p key={`${card.key}-${helper.label}`} className="text-xs text-slate-500">
                                      {helper.label}:{' '}
                                      <span className="font-medium text-slate-700">{helper.value}</span>
                                    </p>
                                  ))}
                                  {card.footnote && (
                                    <p className="text-xs font-medium text-slate-500">{card.footnote}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                        {portfolioTimeline.length > 0 && summary && (
                          <section
                            aria-labelledby="portfolio-chart-heading"
                            className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-inner"
                          >
                            <div className="flex items-center justify-between pb-4">
                              <h2 id="portfolio-chart-heading" className="text-xl font-semibold text-slate-900">
                                {t.dashboard.performance}
                              </h2>
                              <span className="text-xs font-medium text-slate-500">
                                {t.app.updated} {formatTime(lastUpdate)}
                              </span>
                            </div>
                            <PortfolioOverviewChart data={portfolioTimeline} summary={summary} />
                          </section>
                        )}
                      </div>
                    )}

                    <section id="positions" aria-labelledby="positions-heading" className="space-y-4">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <h2 id="positions-heading" className="text-xl font-semibold text-slate-900">
                          {t.dashboard.positionsTitle}
                        </h2>
                        <Button asChild size="sm" variant="outline" className="self-start lg:self-auto">
                          <Link href="/positions">{t.positions.title}</Link>
                        </Button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {metrics.map((m) => (
                          <PositionCard
                            key={m.position.id || m.position.symbol}
                            metrics={m}
                            sparklineData={sparklineData[m.position.symbol] || []}
                          />
                        ))}
                      </div>
                    </section>

                    {summary && (
                      <section
                        id="visualizations"
                        aria-labelledby="visualizations-heading"
                        className="space-y-4 border-t border-slate-100 pt-6"
                      >
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <h3 id="visualizations-heading" className="text-lg font-semibold text-slate-900">
                            {t.dashboard.visualizationsTitle}
                          </h3>
                          <Button asChild variant="ghost" size="sm" className="self-start text-slate-600 lg:self-auto">
                            <Link href="/analysis">{t.analysis.title}</Link>
                          </Button>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-inner">
                          <PortfolioVisualizations metrics={metrics} summary={summary} />
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
