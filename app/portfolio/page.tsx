'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { RefreshCw, LineChart, ArrowUpRight } from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { formatCurrency } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { PortfolioOverviewChart } from '@/components/charts/portfolio-overview-chart';
import { Button } from '@/components/ui/button';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';
import {
  formatLastUpdatedTime,
  formatSignedCurrency,
  formatSignedPercent,
  getTrendIcon,
  getTrendTone,
} from '@/lib/utils/portfolio-display';

export default function PortfolioPage() {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const {
    loading,
    refreshing,
    positions,
    metrics,
    summary,
    portfolioTimeline,
    usdToIls,
    historicalIlsNetPnL,
    historicalIlsRealizedPnL,
    realizedSales: realizedSalesWithFx,
    lastUpdate,
    reload,
  } = usePortfolioData();

  const lastUpdatedDisplay = formatLastUpdatedTime(lastUpdate, locale);

  const openMetrics = useMemo(() => metrics.filter((metric) => metric.position.quantity > 0), [metrics]);
  const rateForSummary = summary?.usdToIlsRate ?? usdToIls;

  const realizedSales = useMemo(
    () => realizedSalesWithFx,
    [realizedSalesWithFx],
  );

  const closedSummary = useMemo(() => {
    if (realizedSales.length === 0) {
      return null;
    }

    const totals = realizedSales.reduce(
      (acc, sale) => {
        acc.totalProceedsUsd += sale.proceedsUsd;
        acc.totalProceedsIls += sale.proceedsIls ?? sale.proceedsUsd * rateForSummary;
        acc.totalCostUsd += sale.costBasisUsd;
        acc.totalCostIls += sale.costBasisIls ?? sale.costBasisUsd * rateForSummary;
        acc.totalProfitUsd += sale.profitUsd;
        acc.totalProfitIls += sale.profitIls ?? sale.profitUsd * rateForSummary;
        acc.totalQuantity += sale.quantity;
        acc.weightedHoldingDays += sale.holdingPeriodDays * sale.quantity;
        return acc;
      },
      {
        totalProceedsUsd: 0,
        totalProceedsIls: 0,
        totalCostUsd: 0,
        totalCostIls: 0,
        totalProfitUsd: 0,
        totalProfitIls: 0,
        totalQuantity: 0,
        weightedHoldingDays: 0,
      }
    );

    const averageHoldingDays = totals.totalQuantity > 0 ? totals.weightedHoldingDays / totals.totalQuantity : 0;
    const expectedProfitUsd = realizedSales.reduce((acc, sale) => {
      const yearsHeld = sale.holdingPeriodDays / 365.25;
      const expectedReturnFactor = Math.pow(1 + settings.annualGrowthRate, yearsHeld);
      const expectedProfit = sale.costBasisUsd * (expectedReturnFactor - 1);
      return acc + expectedProfit;
    }, 0);

    const expectedProfitIls = expectedProfitUsd * rateForSummary;
    const performanceDeltaUsd = totals.totalProfitUsd - expectedProfitUsd;
    const performanceDeltaIls = totals.totalProfitIls - expectedProfitIls;
    const performanceDeltaPercent = expectedProfitUsd !== 0
      ? (performanceDeltaUsd / Math.abs(expectedProfitUsd)) * 100
      : 0;

    const uniqueSymbols = new Set(realizedSales.map((sale) => sale.symbol));

    return {
      totalProceedsUsd: totals.totalProceedsUsd,
      totalProceedsIls: totals.totalProceedsIls,
      totalCostUsd: totals.totalCostUsd,
      totalCostIls: totals.totalCostIls,
      totalProfitUsd: totals.totalProfitUsd,
      totalProfitIls: totals.totalProfitIls,
      expectedProfitUsd,
      expectedProfitIls,
      performanceDeltaUsd,
      performanceDeltaIls,
      performanceDeltaPercent,
      averageHoldingDays,
      uniqueSymbols: uniqueSymbols.size,
    };
  }, [realizedSales, rateForSummary, settings.annualGrowthRate]);

  const hasDailyChange = metrics.some((metric) => typeof metric.dailyChange === 'number');
  const totalDailyChangeUsd = metrics.reduce(
    (acc, metric) => acc + (metric.dailyChange ?? 0) * metric.position.quantity,
    0
  );
  const dailyChangeTone = getTrendTone(totalDailyChangeUsd);
  const dailyChangeIcon = getTrendIcon(totalDailyChangeUsd);

  const currentRate = rateForSummary;
  const totalValueIls = summary ? summary.totalValue * summary.usdToIlsRate : 0;
  const totalReturnUsd = summary ? summary.totalValue - summary.totalCost : 0;
  const totalReturnPercent = summary && summary.totalCost !== 0 ? (totalReturnUsd / summary.totalCost) * 100 : 0;

  const averageReturnPercent = metrics.length
    ? metrics.reduce((acc, metric) => acc + metric.roiPercent, 0) / metrics.length
    : 0;

  const openPositionsCount = openMetrics.length;

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
          key: 'openPositions',
          label: t.portfolio.openPositions,
          value: openPositionsCount.toString(),
        },
        {
          key: 'averageReturn',
          label: t.portfolio.averageReturn,
          value: formatSignedPercent(averageReturnPercent, locale),
          toneClass: getTrendTone(averageReturnPercent).text,
        },
      ]
    : [];

  type SummaryCardHelper = {
    label: string;
    value: string;
    secondary?: string;
    tone?: ReturnType<typeof getTrendTone>;
    icon?: JSX.Element;
  };

  type SummaryCard = {
    key: string;
    label: string;
    value: string;
    valueClass?: string;
    secondary?: { label: string; value: string };
    helper?: SummaryCardHelper[];
    badge?: { value: string; tone: { text: string; badge: string }; icon: JSX.Element };
    footnote?: string;
  };

  const summaryCards: SummaryCard[] = [];

  if (summary) {
    const taxesUsdDisplay = summary.totalTaxesPaidUsd * -1;
    const taxesIlsDisplay = summary.totalTaxesPaidIls * -1;
    const netForecastGapUsd = summary.totalNetPnLUsd - summary.totalProjectedPnLUsd;
    const netForecastGapIls = summary.totalNetPnLIls - summary.totalProjectedPnLIls;
    const netForecastGapTone = getTrendTone(netForecastGapUsd);

    summaryCards.push(
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
          { label: t.dashboard.totalReturn, value: formatSignedCurrency(totalReturnUsd, 'USD', locale) },
        ],
        badge: {
          value: formatSignedPercent(totalReturnPercent, locale),
          tone: getTrendTone(totalReturnUsd),
          icon: getTrendIcon(totalReturnUsd),
        },
      },
      {
        key: 'net',
        label: t.dashboard.netPnL,
        value: formatSignedCurrency(summary.totalNetPnLUsd, 'USD', locale),
        valueClass: `text-3xl font-semibold ${getTrendTone(summary.totalNetPnLUsd).text}`,
        secondary: {
          label: 'ILS',
          value: formatSignedCurrency(summary.totalNetPnLIls, 'ILS', locale),
        },
        helper: [
          {
            label: t.portfolio.ilsCurrentLabel,
            value: formatSignedCurrency(summary.totalNetPnLIls, 'ILS', locale),
          },
          {
            label: t.portfolio.ilsHistoricalAdjustedLabel,
            value: formatSignedCurrency(historicalIlsNetPnL, 'ILS', locale),
          },
          {
            label: t.dashboard.forecastGap,
            value: formatSignedCurrency(netForecastGapUsd, 'USD', locale),
            secondary: t.dashboard.forecastGapSecondary(
              formatSignedCurrency(netForecastGapIls, 'ILS', locale)
            ),
            tone: netForecastGapTone,
            icon: getTrendIcon(netForecastGapUsd),
          },
        ],
      },
      {
        key: 'current',
        label: t.dashboard.currentPnL,
        value: formatSignedCurrency(summary.totalCurrentPnLUsd, 'USD', locale),
        valueClass: `text-3xl font-semibold ${getTrendTone(summary.totalCurrentPnLUsd).text}`,
        secondary: {
          label: 'ILS',
          value: formatSignedCurrency(summary.totalCurrentPnLIls, 'ILS', locale),
        },
      },
      {
        key: 'projected',
        label: t.dashboard.projectedPnL,
        value: formatSignedCurrency(summary.totalProjectedPnLUsd, 'USD', locale),
        valueClass: `text-3xl font-semibold ${getTrendTone(summary.totalProjectedPnLUsd).text}`,
        secondary: {
          label: 'ILS',
          value: formatSignedCurrency(summary.totalProjectedPnLIls, 'ILS', locale),
        },
      },
      {
        key: 'taxes',
        label: t.dashboard.taxesPaid,
        value: formatSignedCurrency(taxesUsdDisplay, 'USD', locale),
        valueClass: `text-3xl font-semibold ${getTrendTone(taxesUsdDisplay).text}`,
        secondary: {
          label: 'ILS',
          value: formatSignedCurrency(taxesIlsDisplay, 'ILS', locale),
        },
      }
    );
  }

  if (closedSummary) {
    summaryCards.push({
      key: 'realized',
      label: t.portfolio.realizedPnLCard,
      value: formatSignedCurrency(closedSummary.totalProfitUsd, 'USD', locale),
      valueClass: `text-3xl font-semibold ${getTrendTone(closedSummary.totalProfitUsd).text}`,
      secondary: {
        label: 'ILS',
        value: formatSignedCurrency(closedSummary.totalProfitIls, 'ILS', locale),
      },
      helper: [
        {
          label: t.portfolio.ilsCurrentLabel,
          value: formatSignedCurrency(closedSummary.totalProfitIls, 'ILS', locale),
        },
        {
          label: t.portfolio.ilsHistoricalAdjustedLabel,
          value: formatSignedCurrency(historicalIlsRealizedPnL, 'ILS', locale),
        },
        {
          label: t.portfolio.expectedProfitLabel,
          value: formatSignedCurrency(closedSummary.expectedProfitUsd, 'USD', locale),
        },
        {
          label: t.portfolio.performanceVsExpectedShort,
          value: formatSignedCurrency(closedSummary.performanceDeltaUsd, 'USD', locale),
        },
      ],
      badge: {
        value: formatSignedPercent(closedSummary.performanceDeltaPercent, locale),
        tone: getTrendTone(closedSummary.performanceDeltaUsd),
        icon: getTrendIcon(closedSummary.performanceDeltaUsd),
      },
      footnote: t.portfolio.closedPositionsFootnote(closedSummary.uniqueSymbols),
    });
  }

  const closedStats: GeneralStat[] = closedSummary
    ? [
        {
          key: 'closedProceeds',
          label: t.portfolio.closedTotalProceeds,
          value: formatCurrency(closedSummary.totalProceedsUsd, 'USD', locale),
          helper: formatCurrency(closedSummary.totalProceedsIls, 'ILS', locale),
        },
        {
          key: 'closedCost',
          label: t.realized.totalCost,
          value: formatCurrency(closedSummary.totalCostUsd, 'USD', locale),
          helper: formatCurrency(closedSummary.totalCostIls, 'ILS', locale),
        },
      ]
    : [];

  const quickActions = useMemo(
    () =>
      createCommonQuickActions(t, {
        exclude: ['portfolio'],
        overrides: {
          reload: {
            onClick: reload,
            disabled: loading || refreshing,
            iconClassName: loading || refreshing ? 'animate-spin' : undefined,
          },
        },
      }),
    [t, reload, loading, refreshing]
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-primary-050)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--color-primary-025)] via-[var(--color-primary-010)] to-[var(--color-primary-005)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(var(--color-primary-400-rgb),0.18),_transparent_60%)]" />
      <div className="relative">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
          <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-neutral-white)]/60 bg-overlay-neutral-white px-5 py-5 shadow-xl glass-blur-sm sm:px-6 sm:py-6">
            <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-[color:var(--color-blue-200)]/60 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-blue-100 p-2.5 text-blue-600 shadow-inner">
                    <LineChart className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-[var(--color-primary-900)] sm:text-3xl">{t.portfolio.title}</h1>
                    <p className="mt-1 max-w-xl text-sm text-slate-600 sm:text-base">{t.portfolio.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
                  <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-600 shadow-sm">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                    {t.app.updated} {lastUpdatedDisplay ?? '—'}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--color-neutral-white)]/70 px-3 py-1 text-slate-600 shadow-sm">
                    <LineChart className="h-4 w-4 text-blue-500" />
                    1 USD ≈ {formatCurrency(currentRate, 'ILS', locale)}
                  </span>
                  {hasDailyChange && (
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${dailyChangeTone.badge}`}
                    >
                      {dailyChangeIcon}
                      {formatSignedCurrency(totalDailyChangeUsd, 'USD', locale)}
                      <span className="text-xs font-medium text-overlay-slate-600">{t.dashboard.dailyChange}</span>
                    </span>
                  )}
                </div>
              </div>
              <QuickActionsSection title={t.portfolio.actions} actions={quickActions} />
            </div>
          </header>

          <main className="mt-6">
            <section className="relative overflow-hidden rounded-3xl border border-[color:var(--color-neutral-white)]/60 bg-overlay-neutral-white px-4 py-6 shadow-xl glass-blur-sm sm:px-6">
              <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-[color:var(--color-blue-100)]/50 blur-3xl" />
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
                    <Button asChild size="sm" className="gap-2 bg-[var(--color-primary-500)] text-white shadow-sm hover:bg-[var(--color-primary-700)]">
                      <Link href="/positions">
                        <ArrowUpRight className="h-4 w-4" />
                        <span>{t.positions.add}</span>
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid items-start gap-5">
                      <div className="space-y-4 rounded-3xl border border-[color:var(--color-card-border)] bg-[color:var(--color-neutral-white)]/55 p-4 shadow-sm sm:p-5">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.timelineTitle}</h2>
                          <p className="text-sm text-slate-500">{t.portfolio.overviewDescription}</p>
                        </div>
                        {portfolioTimeline.length > 0 ? (
                          <PortfolioOverviewChart data={portfolioTimeline} summary={summary} />
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-overlay-neutral-white py-14 text-center text-slate-500">
                            <LineChart className="h-6 w-6 text-slate-400" />
                            <p>{t.portfolio.timelineEmpty}</p>
                          </div>
                        )}
                      </div>

                      <aside className="space-y-4">
                        {generalStats.length > 0 && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {generalStats.map((stat) => (
                              <div
                                key={stat.key}
                                className="rounded-2xl border card-surface px-4 py-3.5 transition-shadow duration-300"
                              >
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{stat.label}</p>
                                <p className={`mt-1.5 text-2xl font-semibold ${stat.toneClass ?? 'text-slate-900'}`}>
                                  {stat.value}
                                </p>
                                {stat.helper && <p className="text-xs font-medium text-slate-500">{stat.helper}</p>}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-3 rounded-3xl border border-[color:var(--color-card-border)] bg-[color:var(--color-neutral-white)]/55 p-4 shadow-sm sm:p-5">
                          <h2 className="text-lg font-semibold text-slate-900">{t.portfolio.moversTitle}</h2>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-emerald-100 bg-[color:var(--color-emerald-50)]/70 px-4 py-3.5 shadow-inner">
                              <p className="text-sm font-medium text-emerald-600">{t.portfolio.bestPerformer}</p>
                              {bestMetric ? (
                                <div className="mt-2.5 space-y-1 text-sm text-slate-600">
                                  <p className="text-lg font-semibold text-slate-900">
                                    {bestMetric.position.display || bestMetric.position.symbol}
                                  </p>
                                  <p>
                                    {formatSignedCurrency(bestMetric.positionPnLUsd, 'USD', locale)}{' '}
                                    <span className="text-xs text-slate-500">
                                      ({formatSignedPercent(bestMetric.roiPercent, locale)})
                                    </span>
                                  </p>
                                </div>
                              ) : (
                                <p className="mt-2.5 text-sm text-slate-500">{t.portfolio.moversEmpty}</p>
                              )}
                            </div>
                            <div className="rounded-2xl border border-rose-100 bg-[color:var(--color-rose-50)]/70 px-4 py-3.5 shadow-inner">
                              <p className="text-sm font-medium text-rose-600">{t.portfolio.worstPerformer}</p>
                              {worstMetric ? (
                                <div className="mt-2.5 space-y-1 text-sm text-slate-600">
                                  <p className="text-lg font-semibold text-slate-900">
                                    {worstMetric.position.display || worstMetric.position.symbol}
                                  </p>
                                  <p>
                                    {formatSignedCurrency(worstMetric.positionPnLUsd, 'USD', locale)}{' '}
                                    <span className="text-xs text-slate-500">
                                      ({formatSignedPercent(worstMetric.roiPercent, locale)})
                                    </span>
                                  </p>
                                </div>
                              ) : (
                                <p className="mt-2.5 text-sm text-slate-500">{t.portfolio.moversEmpty}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {closedSummary && closedStats.length > 0 && (
                          <div className="space-y-3 rounded-3xl border border-[color:var(--color-card-border)] bg-[color:var(--color-neutral-white)]/55 p-4 shadow-sm sm:p-5">
                            <div>
                              <h2 className="text-lg font-semibold text-slate-900">{t.portfolio.closedOverviewTitle}</h2>
                              <p className="text-sm text-slate-500">{t.portfolio.closedOverviewDescription}</p>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              {closedStats.map((stat) => (
                                <div
                                  key={stat.key}
                                  className="rounded-2xl border card-surface px-4 py-3.5 transition-shadow duration-300"
                                >
                                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{stat.label}</p>
                                  <p className={`mt-1.5 text-2xl font-semibold ${stat.toneClass ?? 'text-slate-900'}`}>
                                    {stat.value}
                                  </p>
                                  {stat.helper && <p className="text-xs font-medium text-slate-500">{stat.helper}</p>}
                                </div>
                              ))}
                            </div>
                            <p className="text-xs font-medium text-slate-500">
                              {t.portfolio.closedHoldingFootnote(Math.round(closedSummary.averageHoldingDays))}
                            </p>
                          </div>
                        )}
                      </aside>
                    </div>

                    {summaryCards.length > 0 && (
                      <div className="space-y-3">
                        <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.overviewTitle}</h2>
                        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                          {summaryCards.map((card) => (
                            <div
                              key={card.key}
                              className="relative overflow-hidden rounded-3xl border card-surface p-4 transition-shadow duration-300"
                            >
                              <div className="pointer-events-none absolute -right-12 top-0 h-36 w-36 rounded-full card-glow blur-3xl" />
                              <div className="relative z-10 space-y-2.5">
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
                                  <div
                                    key={`${card.key}-${helper.label}`}
                                    className="mt-2.5 rounded-2xl border border-[color:var(--color-card-border)] bg-[color:var(--color-primary-025)] px-3 py-2 text-xs text-slate-500"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-2">
                                        {helper.icon && (
                                          <span
                                            className={`flex h-6 w-6 items-center justify-center rounded-full ${
                                              helper.tone?.badge ?? 'bg-slate-100 text-slate-500'
                                            }`}
                                          >
                                            {helper.icon}
                                          </span>
                                        )}
                                        <span className="font-medium">{helper.label}</span>
                                      </div>
                                      <span
                                        className={`font-semibold ${
                                          helper.tone?.text ?? 'text-slate-700'
                                        }`}
                                      >
                                        {helper.value}
                                      </span>
                                    </div>
                                    {helper.secondary && (
                                      <span className="mt-1 block text-[11px] font-medium text-slate-400">
                                        {helper.secondary}
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {card.footnote && <p className="text-xs font-medium text-slate-500">{card.footnote}</p>}
                              </div>
                            </div>
                          ))}
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
