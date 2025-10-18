'use client';

import { useMemo } from 'react';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { PositionCard } from '@/components/position-card';
import { PortfolioVisualizations } from '@/components/portfolio-visualizations';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  RefreshCw,
  Settings,
  Plus,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  LineChart,
  CircleDollarSign,
} from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';

export default function HomePage() {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const {
    loading,
    positions,
    metrics,
    openSummary,
    sparklineData,
    usdToIls,
    lastUpdate,
    reload,
  } =
    usePortfolioData();

  const lastUpdatedDisplay = useMemo(() => {
    if (!lastUpdate) {
      return null;
    }

    return lastUpdate.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [lastUpdate, locale]);

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

  const openMetrics = useMemo(
    () => metrics.filter((metric) => metric.position.quantity > 0),
    [metrics]
  );
  const closedMetrics = useMemo(
    () => metrics.filter((metric) => metric.position.quantity <= 0),
    [metrics]
  );
  const hasAnyPositions = openMetrics.length > 0 || closedMetrics.length > 0;

  const hasDailyChange = openMetrics.some((metric) => typeof metric.dailyChange === 'number');
  const totalDailyChangeUsd = openMetrics.reduce(
    (acc, metric) => acc + (metric.dailyChange ?? 0) * metric.position.quantity,
    0
  );
  const dailyChangeTone = getTrendTone(totalDailyChangeUsd);
  const dailyChangeIcon = getTrendIcon(totalDailyChangeUsd);

  const dashboardSummary = openSummary ?? null;
  const currentRate = dashboardSummary?.usdToIlsRate ?? usdToIls;
  const totalValueIls = dashboardSummary ? dashboardSummary.totalValue * dashboardSummary.usdToIlsRate : 0;
  const totalReturnUsd = dashboardSummary ? dashboardSummary.totalValue - dashboardSummary.totalCost : 0;
  const totalReturnPercent = dashboardSummary && dashboardSummary.totalCost !== 0
    ? (totalReturnUsd / dashboardSummary.totalCost) * 100
    : 0;

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

  const summaryCards: SummaryCard[] = dashboardSummary
    ? [
        {
          key: 'value',
          label: t.dashboard.totalValue,
          value: formatCurrency(dashboardSummary.totalValue, 'USD', locale),
          valueClass: 'text-3xl font-semibold text-slate-900',
          secondary: {
            label: 'ILS',
            value: formatCurrency(totalValueIls, 'ILS', locale),
          },
          helper: [
            {
              label: t.dashboard.totalCost,
              value: formatCurrency(dashboardSummary.totalCost, 'USD', locale),
            },
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
          value: formatSignedCurrency(dashboardSummary.totalCurrentPnLUsd, 'USD'),
          valueClass: `text-3xl font-semibold ${getTrendTone(dashboardSummary.totalCurrentPnLUsd).text}`,
          secondary: {
            label: 'ILS',
            value: formatSignedCurrency(dashboardSummary.totalCurrentPnLIls, 'ILS'),
          },
        },
        {
          key: 'projected',
          label: t.dashboard.projectedPnL,
          value: formatSignedCurrency(dashboardSummary.totalProjectedPnLUsd, 'USD'),
          valueClass: `text-3xl font-semibold ${getTrendTone(dashboardSummary.totalProjectedPnLUsd).text}`,
          secondary: {
            label: 'ILS',
            value: formatSignedCurrency(dashboardSummary.totalProjectedPnLIls, 'ILS'),
          },
        },
        {
          key: 'combined',
          label: t.dashboard.combinedPnL,
          value: formatSignedCurrency(dashboardSummary.totalCombinedUsd, 'USD'),
          valueClass: `text-3xl font-semibold ${getTrendTone(dashboardSummary.totalCombinedUsd).text}`,
          secondary: {
            label: 'ILS',
            value: formatSignedCurrency(dashboardSummary.totalCombinedIls, 'ILS'),
          },
        },
      ]
    : [];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#EEF5FF]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#E4F1FF] via-[#F8FBFF] to-[#E3EEFF]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_60%)]" />
      <div className="relative">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-6 py-8 shadow-xl backdrop-blur-sm">
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
                    {t.app.updated} {lastUpdatedDisplay ?? '—'}
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
                  <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{t.common.refresh}</span>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    className="gap-2 bg-[#1E3A8A] text-white shadow-sm hover:bg-[#1E40AF]"
                  >
                    <Link href="/portfolio">
                      <LineChart className="h-4 w-4" />
                      <span>{t.portfolio.quickAction}</span>
                    </Link>
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
                  <Button
                    asChild
                    size="sm"
                    className="gap-2 bg-[#0EA5E9] text-white shadow-sm hover:bg-[#0284C7]"
                  >
                    <Link href="/realized">
                      <CircleDollarSign className="h-4 w-4" />
                      <span>{t.realized.quickAction}</span>
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

          <main className="mt-10">
            <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-4 py-8 shadow-xl backdrop-blur-sm sm:px-8">
              <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-blue-100/50 blur-3xl" />
              <div className="relative z-10">
                {loading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
                    <p>{t.common.loading}</p>
                  </div>
                ) : !hasAnyPositions ? (
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
                  <div className="space-y-10">
                    {dashboardSummary && summaryCards.length > 0 && (
                      <div className="space-y-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <h2 className="text-xl font-semibold text-slate-900">{t.dashboard.summaryTitle}</h2>
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
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                      </div>
                    )}

                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold text-slate-900">{t.dashboard.positionsTitle}</h2>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {openMetrics.map((m) => (
                          <PositionCard
                            key={m.position.id || m.position.symbol}
                            metrics={m}
                            sparklineData={sparklineData[m.position.symbol] || []}
                          />
                        ))}
                      </div>
                      {closedMetrics.length > 0 && (
                        <div className="space-y-4">
                          <h2 className="text-xl font-semibold text-slate-900">
                            {t.dashboard.closedPositionsTitle}
                          </h2>
                          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {closedMetrics.map((m) => (
                              <PositionCard
                                key={`closed-${m.position.id || m.position.symbol}`}
                                metrics={m}
                                sparklineData={sparklineData[m.position.symbol] || []}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {openSummary && (
                      <div className="space-y-4 border-t border-slate-100 pt-6">
                        <h3 className="text-lg font-semibold text-slate-900">{t.dashboard.visualizationsTitle}</h3>
                        <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-inner">
                          <PortfolioVisualizations metrics={openMetrics} summary={openSummary} />
                        </div>
                      </div>
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
