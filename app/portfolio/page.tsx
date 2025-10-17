'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  Home,
  LineChart,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CircleDollarSign,
} from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { PortfolioOverviewChart } from '@/components/portfolio-overview-chart';
import { Button } from '@/components/ui/button';
import { PositionCard } from '@/components/position-card';
import { computeRealizedSales } from '@/lib/positions';

export default function PortfolioPage() {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const {
    loading,
    positions,
    metrics,
    summary,
    sparklineData,
    portfolioTimeline,
    usdToIls,
    lastUpdate,
    reload,
  } = usePortfolioData();

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

  const openMetrics = useMemo(
    () => metrics.filter((metric) => metric.position.quantity > 0),
    [metrics]
  );

  const closedMetrics = useMemo(
    () => metrics.filter((metric) => metric.position.quantity <= 0),
    [metrics]
  );

  const averageReturnPercent = metrics.length
    ? metrics.reduce((acc, metric) => acc + metric.roiPercent, 0) / metrics.length
    : 0;

  const bestMetric = metrics.reduce((best, metric) => {
    if (!best || metric.positionPnLUsd > best.positionPnLUsd) {
      return metric;
    }
    return best;
  }, undefined as typeof metrics[number] | undefined);

  const worstMetric = metrics.reduce((worst, metric) => {
    if (!worst || metric.positionPnLUsd < worst.positionPnLUsd) {
      return metric;
    }
    return worst;
  }, undefined as typeof metrics[number] | undefined);

  type GeneralStat = {
    key: string;
    label: string;
    value: string;
    helper?: string;
    toneClass?: string;
  };

  const generalStats: GeneralStat[] = summary
    ? [
        {
          key: 'totalPositions',
          label: t.portfolio.totalPositions,
          value: metrics.length.toString(),
        },
        {
          key: 'activePositions',
          label: t.portfolio.activePositions,
          value: openMetrics.length.toString(),
        },
        {
          key: 'closedPositions',
          label: t.portfolio.closedPositions,
          value: closedMetrics.length.toString(),
        },
        {
          key: 'averageReturn',
          label: t.portfolio.averageReturn,
          value: formatSignedPercent(averageReturnPercent),
          toneClass: getTrendTone(averageReturnPercent).text,
        },
        {
          key: 'totalValueUsd',
          label: t.portfolio.totalValueUsd,
          value: formatCurrency(summary.totalValue, 'USD', locale),
          helper: formatCurrency(totalValueIls, 'ILS', locale),
        },
        {
          key: 'totalCostUsd',
          label: t.portfolio.totalCostUsd,
          value: formatCurrency(summary.totalCost, 'USD', locale),
        },
        {
          key: 'dailyChangeUsd',
          label: t.portfolio.dailyChangeUsd,
          value: formatSignedCurrency(totalDailyChangeUsd, 'USD'),
          toneClass: dailyChangeTone.text,
        },
        {
          key: 'usdToIls',
          label: t.portfolio.usdToIlsRate,
          value: formatCurrency(currentRate, 'ILS', locale),
        },
      ]
    : [];

  type PerformanceEntry = {
    key: string;
    name: string;
    status: 'active' | 'closed';
    actualUsd: number;
    expectedUsd: number;
    varianceUsd: number;
  };

  const performanceEntries: PerformanceEntry[] = useMemo(() => {
    return metrics.map((metric) => {
      const key = metric.position.id || metric.position.symbol;
      const name = metric.position.display || metric.position.symbol;

      if (metric.position.quantity > 0) {
        const actualUsd = metric.positionPnLUsd;
        const expectedUsd = metric.projectedPnLUsd;
        return {
          key,
          name,
          status: 'active',
          actualUsd,
          expectedUsd,
          varianceUsd: actualUsd - expectedUsd,
        };
      }

      const realized = computeRealizedSales(metric.position);

      if (!realized.length) {
        return {
          key,
          name,
          status: 'closed',
          actualUsd: 0,
          expectedUsd: 0,
          varianceUsd: 0,
        };
      }

      const totals = realized.reduce(
        (acc, sale) => {
          acc.totalQuantity += sale.quantity;
          acc.totalCostUsd += sale.costBasisUsd;
          acc.totalProfitUsd += sale.profitUsd;
          acc.weightedHoldingDays += sale.holdingPeriodDays * sale.quantity;
          return acc;
        },
        {
          totalQuantity: 0,
          totalCostUsd: 0,
          totalProfitUsd: 0,
          weightedHoldingDays: 0,
        }
      );

      const yearsHeld =
        totals.totalQuantity > 0 ? totals.weightedHoldingDays / totals.totalQuantity / 365.25 : 0;
      const expectedUsd =
        totals.totalCostUsd > 0
          ? totals.totalCostUsd * (Math.pow(1 + settings.annualGrowthRate, yearsHeld) - 1)
          : 0;
      const actualUsd = totals.totalProfitUsd;

      return {
        key,
        name,
        status: 'closed',
        actualUsd,
        expectedUsd,
        varianceUsd: actualUsd - expectedUsd,
      };
    });
  }, [metrics, settings.annualGrowthRate]);

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
                    <LineChart className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-[#0F172A] sm:text-4xl">{t.portfolio.title}</h1>
                    <p className="mt-2 max-w-xl text-base text-slate-600">{t.portfolio.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
                  <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-600 shadow-sm">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                    {t.app.updated} {lastUpdatedDisplay ?? '—'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-slate-600 shadow-sm">
                    <LineChart className="h-4 w-4 text-blue-500" />
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
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t.portfolio.actions}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{t.common.refresh}</span>
                  </Button>
                  <Button asChild variant="secondary" size="sm" className="gap-2">
                    <Link href="/">
                      <Home className="h-4 w-4" />
                      <span>{t.app.title}</span>
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
                ) : positions.length === 0 || !summary ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                    <div className="rounded-full bg-blue-100 p-3 text-blue-600 shadow-inner">
                      <LineChart className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-slate-800">{t.portfolio.emptyTitle}</p>
                      <p className="text-sm text-slate-500">{t.portfolio.emptyDescription}</p>
                    </div>
                    <Button asChild size="sm" className="gap-2 bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]">
                      <Link href="/positions">
                        <ArrowUpRight className="h-4 w-4" />
                        <span>{t.positions.add}</span>
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-10">
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.timelineTitle}</h2>
                          <p className="text-sm text-slate-500">{t.portfolio.overviewDescription}</p>
                        </div>
                      </div>
                      {portfolioTimeline.length > 0 ? (
                        <PortfolioOverviewChart data={portfolioTimeline} summary={summary} />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/80 py-14 text-center text-slate-500">
                          <LineChart className="h-6 w-6 text-slate-400" />
                          <p>{t.portfolio.timelineEmpty}</p>
                        </div>
                      )}
                    </div>

                    {summaryCards.length > 0 && (
                      <div className="space-y-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.overviewTitle}</h2>
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

                    {generalStats.length > 0 && (
                      <div className="space-y-4">
                        <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.generalStatsTitle}</h2>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {generalStats.map((stat) => (
                            <div
                              key={stat.key}
                              className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-inner"
                            >
                              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                              <p className={`mt-2 text-2xl font-semibold ${stat.toneClass ?? 'text-slate-900'}`}>
                                {stat.value}
                              </p>
                              {stat.helper && (
                                <p className="text-xs font-medium text-slate-500">{stat.helper}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {performanceEntries.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.performanceTitle}</h2>
                            <p className="text-sm text-slate-500">{t.portfolio.performanceDescription}</p>
                          </div>
                        </div>
                        <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-inner">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <tr>
                                  <th className="px-4 py-3 text-left">{t.portfolio.performanceColumns.symbol}</th>
                                  <th className="px-4 py-3 text-left">{t.portfolio.performanceColumns.status}</th>
                                  <th className="px-4 py-3 text-right">{t.portfolio.performanceColumns.actual}</th>
                                  <th className="px-4 py-3 text-right">{t.portfolio.performanceColumns.expected}</th>
                                  <th className="px-4 py-3 text-right">{t.portfolio.performanceColumns.variance}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white/90">
                                {performanceEntries.map((entry) => {
                                  const varianceTone = getTrendTone(entry.varianceUsd).text;
                                  const statusTone =
                                    entry.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-600'
                                      : 'bg-slate-100 text-slate-600';

                                  return (
                                    <tr key={entry.key} className="text-slate-700">
                                      <td className="px-4 py-3">
                                        <div className="font-medium text-slate-900">{entry.name}</div>
                                      </td>
                                      <td className="px-4 py-3">
                                        <span
                                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone}`}
                                        >
                                          {entry.status === 'active' ? t.portfolio.statusActive : t.portfolio.statusClosed}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                                        {formatSignedCurrency(entry.actualUsd, 'USD')}
                                      </td>
                                      <td className="px-4 py-3 text-right text-slate-600">
                                        {formatSignedCurrency(entry.expectedUsd, 'USD')}
                                      </td>
                                      <td className={`px-4 py-3 text-right font-semibold ${varianceTone}`}>
                                        {formatSignedCurrency(entry.varianceUsd, 'USD')}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {(openMetrics.length > 0 || closedMetrics.length > 0) && (
                      <div className="space-y-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.positionsBreakdownTitle}</h2>
                            <p className="text-sm text-slate-500">{t.portfolio.positionsBreakdownDescription}</p>
                          </div>
                        </div>
                        {openMetrics.length > 0 && (
                          <div className="space-y-3">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                              {t.portfolio.activePositionsTitle}
                            </h3>
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                              {openMetrics.map((metric) => (
                                <PositionCard
                                  key={metric.position.id || metric.position.symbol}
                                  metrics={metric}
                                  sparklineData={sparklineData[metric.position.symbol] || []}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        {closedMetrics.length > 0 && (
                          <div className="space-y-3">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                              {t.portfolio.closedPositionsTitle}
                            </h3>
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                              {closedMetrics.map((metric) => (
                                <PositionCard
                                  key={`closed-${metric.position.id || metric.position.symbol}`}
                                  metrics={metric}
                                  sparklineData={sparklineData[metric.position.symbol] || []}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.moversTitle}</h2>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-inner">
                          <p className="text-sm font-medium text-emerald-600">{t.portfolio.bestPerformer}</p>
                          {bestMetric ? (
                            <div className="mt-3 space-y-1 text-sm text-slate-600">
                              <p className="text-lg font-semibold text-slate-900">
                                {bestMetric.position.display || bestMetric.position.symbol}
                              </p>
                              <p>
                                {formatSignedCurrency(bestMetric.positionPnLUsd, 'USD')}{' '}
                                <span className="text-xs text-slate-500">
                                  ({formatSignedPercent(bestMetric.roiPercent)})
                                </span>
                              </p>
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-slate-500">{t.portfolio.moversEmpty}</p>
                          )}
                        </div>
                        <div className="rounded-3xl border border-rose-100 bg-rose-50/70 p-5 shadow-inner">
                          <p className="text-sm font-medium text-rose-600">{t.portfolio.worstPerformer}</p>
                          {worstMetric ? (
                            <div className="mt-3 space-y-1 text-sm text-slate-600">
                              <p className="text-lg font-semibold text-slate-900">
                                {worstMetric.position.display || worstMetric.position.symbol}
                              </p>
                              <p>
                                {formatSignedCurrency(worstMetric.positionPnLUsd, 'USD')}{' '}
                                <span className="text-xs text-slate-500">
                                  ({formatSignedPercent(worstMetric.roiPercent)})
                                </span>
                              </p>
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-slate-500">{t.portfolio.moversEmpty}</p>
                          )}
                        </div>
                      </div>
                    </div>
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
