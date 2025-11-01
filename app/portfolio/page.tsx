'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { RefreshCw, LineChart, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { PortfolioOverviewChart } from '@/components/charts/portfolio-overview-chart';
import { Button } from '@/components/ui/button';
import { computeRealizedSales } from '@/lib/positions';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';

export default function PortfolioPage() {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const { loading, refreshing, positions, metrics, summary, portfolioTimeline, usdToIls, lastUpdate, reload } =
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

  const openMetrics = useMemo(() => metrics.filter((metric) => metric.position.quantity > 0), [metrics]);
  const rateForSummary = summary?.usdToIlsRate ?? usdToIls;

  const realizedSales = useMemo(
    () =>
      positions.flatMap((position) =>
        computeRealizedSales(position).map((sale) => ({
          ...sale,
          proceedsIls: sale.proceedsUsd * rateForSummary,
          costBasisIls: sale.costBasisUsd * rateForSummary,
          profitIls: sale.profitUsd * rateForSummary,
        }))
      ),
    [positions, rateForSummary]
  );

  const closedSummary = useMemo(() => {
    if (realizedSales.length === 0) {
      return null;
    }

    const totals = realizedSales.reduce(
      (acc, sale) => {
        acc.totalProceedsUsd += sale.proceedsUsd;
        acc.totalProceedsIls += sale.proceedsIls;
        acc.totalCostUsd += sale.costBasisUsd;
        acc.totalCostIls += sale.costBasisIls;
        acc.totalProfitUsd += sale.profitUsd;
        acc.totalProfitIls += sale.profitIls;
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
  const closedPositionsCount = closedSummary?.uniqueSymbols ?? 0;

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
        ...(closedSummary
          ? [
              {
                key: 'closedPositions',
                label: t.portfolio.closedPositions,
                value: closedPositionsCount.toString(),
                helper: t.portfolio.closedPositionsHelper(
                  formatCurrency(closedSummary.totalProceedsUsd, 'USD', locale)
                ),
              },
            ]
          : []),
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
        key: 'net',
        label: t.dashboard.netPnL,
        value: formatSignedCurrency(summary.totalNetPnLUsd, 'USD'),
        valueClass: `text-3xl font-semibold ${getTrendTone(summary.totalNetPnLUsd).text}`,
        secondary: {
          label: 'ILS',
          value: formatSignedCurrency(summary.totalNetPnLIls, 'ILS'),
        },
        helper: [
          {
            label: t.dashboard.forecastGap,
            value: formatSignedCurrency(netForecastGapUsd, 'USD'),
            secondary: t.dashboard.forecastGapSecondary(
              formatSignedCurrency(netForecastGapIls, 'ILS')
            ),
            tone: netForecastGapTone,
            icon: getTrendIcon(netForecastGapUsd),
          },
        ],
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
        key: 'taxes',
        label: t.dashboard.taxesPaid,
        value: formatSignedCurrency(taxesUsdDisplay, 'USD'),
        valueClass: `text-3xl font-semibold ${getTrendTone(taxesUsdDisplay).text}`,
        secondary: {
          label: 'ILS',
          value: formatSignedCurrency(taxesIlsDisplay, 'ILS'),
        },
      }
    );
  }

  if (closedSummary) {
    summaryCards.push({
      key: 'realized',
      label: t.portfolio.realizedPnLCard,
      value: formatSignedCurrency(closedSummary.totalProfitUsd, 'USD'),
      valueClass: `text-3xl font-semibold ${getTrendTone(closedSummary.totalProfitUsd).text}`,
      secondary: {
        label: 'ILS',
        value: formatSignedCurrency(closedSummary.totalProfitIls, 'ILS'),
      },
      helper: [
        {
          label: t.portfolio.expectedProfitLabel,
          value: formatSignedCurrency(closedSummary.expectedProfitUsd, 'USD'),
        },
        {
          label: t.portfolio.performanceVsExpectedShort,
          value: formatSignedCurrency(closedSummary.performanceDeltaUsd, 'USD'),
        },
      ],
      badge: {
        value: formatSignedPercent(closedSummary.performanceDeltaPercent),
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
          key: 'closedProfit',
          label: t.portfolio.closedTotalProfit,
          value: formatSignedCurrency(closedSummary.totalProfitUsd, 'USD'),
          helper: formatSignedCurrency(closedSummary.totalProfitIls, 'ILS'),
          toneClass: getTrendTone(closedSummary.totalProfitUsd).text,
        },
        {
          key: 'expectedProfit',
          label: t.portfolio.expectedProfitLabel,
          value: formatSignedCurrency(closedSummary.expectedProfitUsd, 'USD'),
          helper: formatSignedCurrency(closedSummary.expectedProfitIls, 'ILS'),
          toneClass: getTrendTone(closedSummary.expectedProfitUsd).text,
        },
        {
          key: 'performanceDelta',
          label: t.portfolio.performanceVsExpectedLabel,
          value: formatSignedCurrency(closedSummary.performanceDeltaUsd, 'USD'),
          helper: `${formatSignedCurrency(closedSummary.performanceDeltaIls, 'ILS')} · ${formatSignedPercent(
            closedSummary.performanceDeltaPercent
          )}`,
          toneClass: getTrendTone(closedSummary.performanceDeltaUsd).text,
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
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-neutral-white)]/60 bg-[color:var(--color-neutral-white)]/80 px-6 py-8 shadow-xl backdrop-blur-sm">
            <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-[color:var(--color-blue-200)]/60 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-blue-100 p-3 text-blue-600 shadow-inner">
                    <LineChart className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-[var(--color-primary-900)] sm:text-4xl">{t.portfolio.title}</h1>
                    <p className="mt-2 max-w-xl text-base text-slate-600">{t.portfolio.subtitle}</p>
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
                      {formatSignedCurrency(totalDailyChangeUsd, 'USD')}
                      <span className="text-xs font-medium text-[color:var(--color-slate-600)]/80">{t.dashboard.dailyChange}</span>
                    </span>
                  )}
                </div>
              </div>
              <QuickActionsSection title={t.portfolio.actions} actions={quickActions} />
            </div>
          </header>

          <main className="mt-10">
            <section className="relative overflow-hidden rounded-3xl border border-[color:var(--color-neutral-white)]/60 bg-[color:var(--color-neutral-white)]/80 px-4 py-8 shadow-xl backdrop-blur-sm sm:px-8">
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
                        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-[color:var(--color-neutral-white)]/80 py-14 text-center text-slate-500">
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
                              <span className="text-xs font-medium text-[color:var(--color-slate-600)]/80">{t.dashboard.dailyChange}</span>
                            </span>
                          )}
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          {summaryCards.map((card) => (
                            <div
                              key={card.key}
                              className="relative overflow-hidden rounded-3xl border border-[color:var(--color-neutral-white)]/70 bg-[color:var(--color-neutral-white)]/90 p-5 shadow-inner"
                            >
                              <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-[color:var(--color-blue-100)]/40 blur-3xl" />
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
                                  <div
                                    key={`${card.key}-${helper.label}`}
                                    className="mt-3 rounded-2xl border border-slate-100 bg-[color:var(--color-neutral-white)]/70 px-3 py-2 text-xs text-slate-500 shadow-inner"
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
                              className="rounded-3xl border border-[color:var(--color-neutral-white)]/70 bg-[color:var(--color-neutral-white)]/90 p-5 shadow-inner"
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

                    {closedSummary && closedStats.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.closedOverviewTitle}</h2>
                            <p className="text-sm text-slate-500">{t.portfolio.closedOverviewDescription}</p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${getTrendTone(closedSummary.performanceDeltaUsd).badge}`}
                          >
                            {getTrendIcon(closedSummary.performanceDeltaUsd)}
                            {formatSignedCurrency(closedSummary.performanceDeltaUsd, 'USD')}
                            <span className="text-xs font-medium text-[color:var(--color-slate-600)]/80">
                              {t.portfolio.performanceVsExpectedPill}
                            </span>
                          </span>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          {closedStats.map((stat) => (
                            <div
                              key={stat.key}
                              className="rounded-3xl border border-[color:var(--color-neutral-white)]/70 bg-[color:var(--color-neutral-white)]/90 p-5 shadow-inner"
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
                        <p className="text-xs font-medium text-slate-500">
                          {t.portfolio.closedHoldingFootnote(Math.round(closedSummary.averageHoldingDays))}
                        </p>
                      </div>
                    )}

                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.moversTitle}</h2>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-3xl border border-emerald-100 bg-[color:var(--color-emerald-50)]/70 p-5 shadow-inner">
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
                        <div className="rounded-3xl border border-rose-100 bg-[color:var(--color-rose-50)]/70 p-5 shadow-inner">
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
