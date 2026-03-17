'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { RefreshCw, LineChart, ArrowUpRight } from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { PortfolioOverviewChart } from '@/components/charts/portfolio-overview-chart';
import { Button } from '@/components/ui/button';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';
import { DashboardPageShell } from '@/components/dashboard/page-shell';
import { cn } from '@/lib/utils';
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

  const openPositionsCount = openMetrics.length;
  const openValueTotal = useMemo(
    () => openMetrics.reduce((sum, metric) => sum + metric.currentValue, 0),
    [openMetrics]
  );
  const winningPositionsCount = useMemo(
    () => openMetrics.filter((metric) => metric.positionPnLUsd >= 0).length,
    [openMetrics]
  );
  const losingPositionsCount = openPositionsCount - winningPositionsCount;
  const winRatePercent = openPositionsCount > 0 ? (winningPositionsCount / openPositionsCount) * 100 : 0;
  const topHoldings = useMemo(
    () =>
      openMetrics
        .slice()
        .sort((a, b) => b.currentValue - a.currentValue)
        .slice(0, 4),
    [openMetrics]
  );
  const topThreeSharePercent =
    openValueTotal > 0
      ? (topHoldings.slice(0, 3).reduce((sum, metric) => sum + metric.currentValue, 0) / openValueTotal) * 100
      : 0;
  const combinedEdgeUsd = summary ? summary.totalCombinedUsd - summary.totalProjectedPnLUsd : 0;
  const combinedEdgeIls = summary ? summary.totalCombinedIls - summary.totalProjectedPnLIls : 0;
  const combinedEdgeTone = getTrendTone(combinedEdgeUsd);

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
    featured?: boolean;
  };

  type GeneralStat = {
    key: string;
    label: string;
    value: string;
    helper?: string;
    toneClass?: string;
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
        valueClass: 'text-[clamp(2rem,3.4vw,3.35rem)] font-semibold tracking-tight text-slate-900',
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
        featured: true,
      },
      {
        key: 'net',
        label: t.dashboard.netPnL,
        value: formatSignedCurrency(summary.totalNetPnLUsd, 'USD', locale),
        valueClass: `text-[clamp(2rem,3.4vw,3.35rem)] font-semibold tracking-tight ${getTrendTone(summary.totalNetPnLUsd).text}`,
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
        featured: true,
      },
      {
        key: 'current',
        label: t.dashboard.currentPnL,
        value: formatSignedCurrency(summary.totalCurrentPnLUsd, 'USD', locale),
        valueClass: `text-2xl font-semibold tracking-tight ${getTrendTone(summary.totalCurrentPnLUsd).text}`,
        secondary: {
          label: 'ILS',
          value: formatSignedCurrency(summary.totalCurrentPnLIls, 'ILS', locale),
        },
      },
      {
        key: 'projected',
        label: t.dashboard.projectedPnL,
        value: formatSignedCurrency(summary.totalProjectedPnLUsd, 'USD', locale),
        valueClass: `text-2xl font-semibold tracking-tight ${getTrendTone(summary.totalProjectedPnLUsd).text}`,
        secondary: {
          label: 'ILS',
          value: formatSignedCurrency(summary.totalProjectedPnLIls, 'ILS', locale),
        },
      },
      {
        key: 'taxes',
        label: t.dashboard.taxesPaid,
        value: formatSignedCurrency(taxesUsdDisplay, 'USD', locale),
        valueClass: `text-2xl font-semibold tracking-tight ${getTrendTone(taxesUsdDisplay).text}`,
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
      valueClass: `text-2xl font-semibold tracking-tight ${getTrendTone(closedSummary.totalProfitUsd).text}`,
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
      featured: false,
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
        include: ['reload'],
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
    <DashboardPageShell direction={locale === 'he' ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-white/92 px-5 py-5 shadow-sm sm:px-6 sm:py-6">
          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-700)]">
                <LineChart className="h-3.5 w-3.5" />
                {t.portfolio.title}
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 text-blue-600">
                  <LineChart className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--color-primary-900)] sm:text-3xl">
                    {t.portfolio.title}
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                    {t.portfolio.subtitle}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-blue-700">
                  <span className="h-2 w-2 rounded-full bg-blue-400" />
                  {t.app.updated} {lastUpdatedDisplay ?? '—'}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
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

            <QuickActionsSection
              title={t.portfolio.actions}
              actions={quickActions}
              className="lg:sticky lg:top-6 lg:self-start"
            />
          </div>
        </header>

        <main className="mt-8 space-y-6">
          {summary && (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  key: 'open',
                  label: t.portfolio.openPositions,
                  value: openPositionsCount.toString(),
                  helper:
                    locale === 'he'
                      ? `${winningPositionsCount} ברווח, ${losingPositionsCount} בירידה`
                      : `${winningPositionsCount} winners, ${losingPositionsCount} lagging`,
                  tone: 'text-slate-900',
                },
                {
                  key: 'winRate',
                  label: locale === 'he' ? 'שיעור מנצחים' : 'Win rate',
                  value: formatPercent(winRatePercent, locale),
                  helper:
                    locale === 'he'
                      ? 'מבוסס על פוזיציות פתוחות בלבד'
                      : 'Based on open positions only',
                  tone: getTrendTone(winRatePercent).text,
                },
                {
                  key: 'concentration',
                  label: locale === 'he' ? 'ריכוז 3 הגדולים' : 'Top 3 concentration',
                  value: formatPercent(topThreeSharePercent, locale),
                  helper:
                    locale === 'he'
                      ? formatCurrency(openValueTotal, 'USD', locale)
                      : formatCurrency(openValueTotal, 'USD', locale),
                  tone: 'text-slate-900',
                },
                {
                  key: 'edge',
                  label: locale === 'he' ? 'יתרון משולב' : 'Combined edge',
                  value: formatSignedCurrency(combinedEdgeUsd, 'USD', locale),
                  helper: formatSignedCurrency(combinedEdgeIls, 'ILS', locale),
                  tone: combinedEdgeTone.text,
                },
              ].map((tile) => (
                <div
                  key={tile.key}
                  className="rounded-[24px] border border-[color:var(--color-slate-200)]/80 bg-white p-4 shadow-sm transition-shadow duration-300 hover:shadow-md"
                >
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tile.label}</p>
                    <p className={`text-2xl font-semibold tracking-tight ${tile.tone}`}>{tile.value}</p>
                    <p className="text-sm leading-5 text-slate-500">{tile.helper}</p>
                  </div>
                </div>
              ))}
            </section>
          )}

          {loading ? (
            <section className="rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-white/92 px-4 py-12 shadow-sm sm:px-6">
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
                <p>{t.common.loading}</p>
              </div>
            </section>
          ) : positions.length === 0 || !summary ? (
            <section className="rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-white/92 px-4 py-12 shadow-sm sm:px-6">
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <div className="rounded-full border border-slate-200 bg-slate-50 p-3 text-blue-600">
                  <LineChart className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-slate-800">{t.portfolio.emptyTitle}</p>
                  <p className="text-sm text-slate-500">{t.portfolio.emptyDescription}</p>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="gap-2 bg-[var(--color-primary-500)] text-white shadow-sm hover:bg-[var(--color-primary-700)]"
                >
                  <Link href="/positions">
                    <ArrowUpRight className="h-4 w-4" />
                    <span>{t.positions.add}</span>
                  </Link>
                </Button>
              </div>
            </section>
          ) : (
            <>
              <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)] xl:items-start">
                <div className="space-y-6">
                  <div className="rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-white/92 px-5 py-5 shadow-sm sm:px-6 sm:py-6">
                    <div className="space-y-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-2">
                          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-slate-500)]">
                            {locale === 'he' ? 'תצוגת תנועה' : 'Performance view'}
                          </div>
                          <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                            {t.portfolio.timelineTitle}
                          </h2>
                          <p className="max-w-2xl text-sm leading-6 text-slate-500">
                            {t.portfolio.overviewDescription}
                          </p>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-white px-4 py-3 shadow-sm">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              {t.dashboard.currentPnL}
                            </p>
                            <p className={`mt-1 text-lg font-semibold ${getTrendTone(summary.totalCurrentPnLUsd).text}`}>
                              {formatSignedCurrency(summary.totalCurrentPnLUsd, 'USD', locale)}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-white px-4 py-3 shadow-sm">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              {t.dashboard.projectedPnL}
                            </p>
                            <p className={`mt-1 text-lg font-semibold ${getTrendTone(summary.totalProjectedPnLUsd).text}`}>
                              {formatSignedCurrency(summary.totalProjectedPnLUsd, 'USD', locale)}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-white px-4 py-3 shadow-sm">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              {t.dashboard.combinedPnL}
                            </p>
                            <p className={`mt-1 text-lg font-semibold ${getTrendTone(summary.totalCombinedUsd).text}`}>
                              {formatSignedCurrency(summary.totalCombinedUsd, 'USD', locale)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {portfolioTimeline.length > 0 ? (
                        <PortfolioOverviewChart data={portfolioTimeline} summary={summary} />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-slate-50 py-14 text-center text-slate-500">
                          <LineChart className="h-6 w-6 text-slate-400" />
                          <p>{t.portfolio.timelineEmpty}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {summaryCards.length > 0 && (
                    <section className="space-y-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {locale === 'he' ? 'סיכום תיק' : 'Portfolio snapshot'}
                          </p>
                          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                            {t.portfolio.overviewTitle}
                          </h2>
                        </div>
                        <p className="max-w-xl text-sm leading-6 text-slate-500">
                          {locale === 'he'
                            ? 'הכרטיסים החשובים ביותר מובלטים, והפריסה שומרת על קריאות גם כשיש הרבה מדדים.'
                            : 'The most important cards are emphasized while keeping the grid readable under density.'}
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {summaryCards.map((card) => {
                          const toneBadge = card.badge?.tone.badge ?? 'bg-slate-100 text-slate-500';

                          return (
                            <div
                              key={card.key}
                            className={cn(
                                'rounded-[24px] border border-[color:var(--color-slate-200)]/80 bg-white p-4 shadow-sm transition-shadow duration-300 hover:shadow-md',
                                card.featured && 'sm:col-span-2 xl:col-span-2 p-5'
                              )}
                          >
                              <div className="space-y-2.5">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                                  {card.badge && (
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${toneBadge}`}>
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
                                    className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500"
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
                                      <span className={`font-semibold ${helper.tone?.text ?? 'text-slate-700'}`}>
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
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>

                <aside className="space-y-4 xl:sticky xl:top-6">
                  <section className="space-y-4 rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-white/92 p-5 shadow-sm">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {locale === 'he' ? 'ריכוז תיק' : 'Allocation snapshot'}
                      </p>
                      <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                        {locale === 'he' ? 'החזקות מובילות' : 'Leading holdings'}
                      </h2>
                      <p className="text-sm leading-6 text-slate-500">
                        {locale === 'he'
                          ? `שלושת הגדולים מחזיקים ${formatPercent(topThreeSharePercent, locale)} מהערך הפתוח.`
                          : `The top three positions hold ${formatPercent(topThreeSharePercent, locale)} of open value.`}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {topHoldings.length > 0 ? (
                        topHoldings.map((metric) => {
                          const tone = getTrendTone(metric.positionPnLUsd);
                          const percent = openValueTotal > 0 ? (metric.currentValue / openValueTotal) * 100 : 0;

                          return (
                            <div
                              key={metric.position.activationId ?? metric.position.id ?? metric.position.symbol}
                            className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-white p-4 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-slate-900">
                                    {metric.position.display || metric.position.symbol}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {formatCurrency(metric.currentValue, 'USD', locale)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-slate-900">{formatPercent(percent, locale)}</p>
                                  <p className={`text-xs font-medium ${tone.text}`}>
                                    {formatSignedCurrency(metric.positionPnLUsd, 'USD', locale)}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 h-2 rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${
                                    metric.positionPnLUsd >= 0 ? 'bg-emerald-400' : 'bg-rose-400'
                                  }`}
                                  style={{ width: `${Math.max(percent, 6)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="rounded-2xl border border-dashed border-slate-200 bg-[color:var(--color-neutral-white)]/82 px-4 py-8 text-center text-sm text-slate-500">
                          {t.portfolio.timelineEmpty}
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="space-y-4 rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-white/92 p-5 shadow-sm">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {t.portfolio.moversTitle}
                      </p>
                      <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                        {locale === 'he' ? 'מובילים מול מפגרים' : 'Leaders vs laggards'}
                      </h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/60 p-4">
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
                      <div className="rounded-[24px] border border-rose-100 bg-rose-50/60 p-4">
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
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
                      <span>
                        {locale === 'he' ? `רווחיות: ${winningPositionsCount}` : `Winning positions: ${winningPositionsCount}`}
                      </span>
                      <span>
                        {locale === 'he' ? `הפסד: ${losingPositionsCount}` : `Losing positions: ${losingPositionsCount}`}
                      </span>
                    </div>
                  </section>

                  {closedSummary && closedStats.length > 0 && (
                    <section className="space-y-4 rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-white/92 p-5 shadow-sm">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {locale === 'he' ? 'מימושים' : 'Realized cycle'}
                        </p>
                        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                          {t.portfolio.closedOverviewTitle}
                        </h2>
                        <p className="text-sm leading-6 text-slate-500">{t.portfolio.closedOverviewDescription}</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {closedStats.map((stat) => (
                          <div key={stat.key} className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-white px-4 py-3.5 shadow-sm">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{stat.label}</p>
                            <p className={`mt-1.5 text-2xl font-semibold ${stat.toneClass ?? 'text-slate-900'}`}>
                              {stat.value}
                            </p>
                            {stat.helper && <p className="text-xs font-medium text-slate-500">{stat.helper}</p>}
                          </div>
                        ))}
                      </div>
                      <div className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-slate-700">
                            {t.portfolio.performanceVsExpectedShort}
                          </span>
                          <span className={`font-semibold ${getTrendTone(closedSummary.performanceDeltaUsd).text}`}>
                            {formatSignedCurrency(closedSummary.performanceDeltaUsd, 'USD', locale)}{' '}
                            <span className="text-xs font-medium text-slate-500">
                              ({formatSignedPercent(closedSummary.performanceDeltaPercent, locale)})
                            </span>
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {t.portfolio.closedHoldingFootnote(Math.round(closedSummary.averageHoldingDays))}
                        </p>
                      </div>
                    </section>
                  )}
                </aside>
              </section>
            </>
          )}
        </main>
      </div>
    </DashboardPageShell>
  );
}
