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
import { formatCurrency, formatNumber, formatPercent, formatDate } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { PortfolioOverviewChart } from '@/components/portfolio-overview-chart';
import { Button } from '@/components/ui/button';
import { computeRealizedSales } from '@/lib/positions';

const DAYS_IN_YEAR = 365.25;

export default function PortfolioPage() {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const { loading, positions, metrics, summary, portfolioTimeline, usdToIls, lastUpdate, reload } =
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

  const activeMetrics = useMemo(
    () => metrics.filter((metric) => metric.position.quantity > 0),
    [metrics]
  );

  const hasDailyChange = activeMetrics.some((metric) => typeof metric.dailyChange === 'number');
  const totalDailyChangeUsd = activeMetrics.reduce(
    (acc, metric) => acc + (metric.dailyChange ?? 0) * metric.position.quantity,
    0
  );
  const dailyChangeTone = getTrendTone(totalDailyChangeUsd);
  const dailyChangeIcon = getTrendIcon(totalDailyChangeUsd);

  const currentRate = summary?.usdToIlsRate ?? usdToIls;
  const totalValueIls = summary ? summary.totalValue * summary.usdToIlsRate : 0;
  const totalReturnUsd = summary ? summary.totalValue - summary.totalCost : 0;
  const totalReturnPercent = summary && summary.totalCost !== 0 ? (totalReturnUsd / summary.totalCost) * 100 : 0;

  const averageReturnPercent = activeMetrics.length
    ? activeMetrics.reduce((acc, metric) => acc + metric.roiPercent, 0) / activeMetrics.length
    : 0;

  const bestMetric = activeMetrics.reduce((best, metric) => {
    if (!best || metric.positionPnLUsd > best.positionPnLUsd) {
      return metric;
    }
    return best;
  }, undefined as typeof activeMetrics[number] | undefined);

  const worstMetric = activeMetrics.reduce((worst, metric) => {
    if (!worst || metric.positionPnLUsd < worst.positionPnLUsd) {
      return metric;
    }
    return worst;
  }, undefined as typeof activeMetrics[number] | undefined);

  const closedSummaries = useMemo(() => {
    const rate = summary?.usdToIlsRate ?? usdToIls;

    return positions
      .filter((position) => {
        const hasSellLots = position.lots?.some((lot) => lot.type === 'SELL') ?? false;
        return (position.quantity ?? 0) <= 0 && hasSellLots;
      })
      .map((position) => {
        const sales = computeRealizedSales(position);
        if (!sales.length) {
          return null;
        }

        const totals = sales.reduce(
          (acc, sale) => {
            acc.quantity += sale.quantity;
            acc.proceedsUsd += sale.proceedsUsd;
            acc.costUsd += sale.costBasisUsd;
            acc.profitUsd += sale.profitUsd;
            acc.expectedProfitUsd += (() => {
              const yearsHeld = sale.holdingPeriodDays / DAYS_IN_YEAR;
              const expectedExitPrice = sale.averageEntryPrice * Math.pow(1 + settings.annualGrowthRate, yearsHeld);
              const expectedProfit = (expectedExitPrice - sale.averageEntryPrice) * sale.quantity;
              return expectedProfit;
            })();
            acc.lastSale = !acc.lastSale || new Date(sale.sellDate) > acc.lastSale ? new Date(sale.sellDate) : acc.lastSale;
            return acc;
          },
          {
            quantity: 0,
            proceedsUsd: 0,
            costUsd: 0,
            profitUsd: 0,
            expectedProfitUsd: 0,
            lastSale: null as Date | null,
          }
        );

        if (totals.quantity <= 0) {
          return null;
        }

        const averageEntry = totals.costUsd / totals.quantity;
        const averageExit = totals.proceedsUsd / totals.quantity;
        const expectedProfitIls = totals.expectedProfitUsd * rate;
        const profitIls = totals.profitUsd * rate;
        const proceedsIls = totals.proceedsUsd * rate;
        const deltaUsd = totals.profitUsd - totals.expectedProfitUsd;

        return {
          symbol: position.symbol,
          display: position.display || position.symbol,
          totalQuantitySold: totals.quantity,
          totalProceedsUsd: totals.proceedsUsd,
          totalProceedsIls: proceedsIls,
          totalProfitUsd: totals.profitUsd,
          totalProfitIls: profitIls,
          expectedProfitUsd: totals.expectedProfitUsd,
          expectedProfitIls,
          averageEntryPrice: averageEntry,
          averageExitPrice: averageExit,
          deltaUsd,
          deltaIls: deltaUsd * rate,
          lastSale: totals.lastSale,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        const aTime = a.lastSale ? a.lastSale.getTime() : 0;
        const bTime = b.lastSale ? b.lastSale.getTime() : 0;
        return bTime - aTime;
      });
  }, [positions, settings.annualGrowthRate, summary?.usdToIlsRate, usdToIls]);

  const totalClosedPositions = closedSummaries.length;
  const totalRealizedProfitUsd = closedSummaries.reduce((sum, item) => sum + item.totalProfitUsd, 0);
  const totalExpectedProfitUsd = closedSummaries.reduce((sum, item) => sum + item.expectedProfitUsd, 0);
  const totalRealizedDeltaUsd = totalRealizedProfitUsd - totalExpectedProfitUsd;

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
          key: 'positions',
          label: t.portfolio.totalPositions,
          value: activeMetrics.length.toString(),
        },
        {
          key: 'closedPositions',
          label: t.portfolio.totalClosedPositions,
          value: totalClosedPositions.toString(),
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
        ...(totalClosedPositions
          ? [
              {
                key: 'realizedProfit',
                label: t.portfolio.totalRealizedProfit,
                value: formatSignedCurrency(totalRealizedProfitUsd, 'USD'),
                helper: formatCurrency(totalRealizedProfitUsd * currentRate, 'ILS', locale),
                toneClass: getTrendTone(totalRealizedProfitUsd).text,
              },
              {
                key: 'expectedProfit',
                label: t.portfolio.totalExpectedProfit,
                value: formatSignedCurrency(totalExpectedProfitUsd, 'USD'),
                helper: formatCurrency(totalExpectedProfitUsd * currentRate, 'ILS', locale),
                toneClass: getTrendTone(totalExpectedProfitUsd).text,
              },
              {
                key: 'realizedDelta',
                label: t.portfolio.totalRealizedDelta,
                value: formatSignedCurrency(totalRealizedDeltaUsd, 'USD'),
                helper: formatCurrency(totalRealizedDeltaUsd * currentRate, 'ILS', locale),
                toneClass: getTrendTone(totalRealizedDeltaUsd).text,
              },
            ]
          : []),
      ]
    : [];

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
                ) : positions.length === 0 || (!summary && activeMetrics.length === 0 && closedSummaries.length === 0) ? (
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

                    {closedSummaries.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.closedSectionTitle}</h2>
                            <p className="text-sm text-slate-500">{t.portfolio.closedSectionDescription}</p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${getTrendTone(totalRealizedDeltaUsd).badge}`}
                          >
                            {getTrendIcon(totalRealizedDeltaUsd)}
                            {formatSignedCurrency(totalRealizedDeltaUsd, 'USD')}
                            <span className="text-xs font-medium text-slate-600/80">{t.portfolio.closedSectionDelta}</span>
                          </span>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                          {closedSummaries.map((item) => (
                            <div
                              key={item.symbol}
                              className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-5 shadow-inner"
                            >
                              <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-blue-100/40 blur-3xl" />
                              <div className="relative z-10 space-y-4">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="text-xs font-semibold uppercase text-slate-500">
                                      {t.portfolio.closedBadge}
                                    </p>
                                    <p className="text-lg font-semibold text-slate-900">
                                      {item.display} <span className="text-sm text-slate-500">({item.symbol})</span>
                                    </p>
                                    {item.lastSale && (
                                      <p className="text-xs text-slate-500">
                                        {t.portfolio.closedSummaryLastSale}{' '}
                                        <span className="font-medium text-slate-700">
                                          {formatDate(item.lastSale, locale)}
                                        </span>
                                      </p>
                                    )}
                                  </div>
                                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                    {t.portfolio.closedSummaryQuantity}: {formatNumber(item.totalQuantitySold, locale)}
                                  </span>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="rounded-2xl border border-white/60 bg-white/80 p-4">
                                    <p className="text-xs font-medium text-slate-500">{t.portfolio.closedSummaryActual}</p>
                                    <p className={`mt-2 text-lg font-semibold ${getTrendTone(item.totalProfitUsd).text}`}>
                                      {formatSignedCurrency(item.totalProfitUsd, 'USD')}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {formatSignedCurrency(item.totalProfitIls, 'ILS')}
                                    </p>
                                    <p className="mt-2 text-xs text-slate-500">
                                      {t.portfolio.closedSummaryExpected}{' '}
                                      <span className="font-medium text-slate-700">
                                        {formatSignedCurrency(item.expectedProfitUsd, 'USD')}
                                      </span>
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-white/60 bg-white/80 p-4">
                                    <p className="text-xs font-medium text-slate-500">{t.portfolio.closedSummaryDelta}</p>
                                    <p className={`mt-2 text-lg font-semibold ${getTrendTone(item.deltaUsd).text}`}>
                                      {formatSignedCurrency(item.deltaUsd, 'USD')}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      {formatSignedCurrency(item.deltaIls, 'ILS')}
                                    </p>
                                    <p className="mt-2 text-xs text-slate-500">
                                      {t.portfolio.closedSummaryProceeds}{' '}
                                      <span className="font-medium text-slate-700">
                                        {formatCurrency(item.totalProceedsUsd, 'USD', locale)}
                                      </span>
                                    </p>
                                  </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4">
                                    <p className="text-xs font-medium text-slate-500">{t.portfolio.closedSummaryAverageEntry}</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">
                                      {formatCurrency(item.averageEntryPrice, 'USD', locale)}
                                    </p>
                                  </div>
                                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4">
                                    <p className="text-xs font-medium text-slate-500">{t.portfolio.closedSummaryAverageExit}</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">
                                      {formatCurrency(item.averageExitPrice, 'USD', locale)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeMetrics.length > 0 && (
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
