'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  LineChart,
  RefreshCw,
  Target,
  Wallet,
} from 'lucide-react';

import { PortfolioOverviewChart } from '@/components/charts/portfolio-overview-chart';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { DashboardPageShell } from '@/components/dashboard/page-shell';
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';
import { Button } from '@/components/ui/button';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import {
  formatLastUpdatedTime,
  formatSignedCurrency,
  formatSignedPercent,
  getTrendIcon,
  getTrendTone,
} from '@/lib/utils/portfolio-display';

type MetricCardBadge = {
  value: string;
  className: string;
  icon: JSX.Element;
};

type MetricCard = {
  key: string;
  label: string;
  value: string;
  valueToneClass?: string;
  secondary?: string;
  helper?: string;
  badge?: MetricCardBadge;
  featured?: boolean;
};

function MetricCardTile({
  label,
  value,
  valueToneClass = 'text-slate-900',
  secondary,
  helper,
  badge,
  featured,
}: Omit<MetricCard, 'key'>) {
  return (
    <article
      className={`group relative overflow-hidden rounded-[26px] border border-[color:var(--color-slate-200)]/80 bg-white/95 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${
        featured ? 'md:col-span-2' : ''
      }`}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.18),transparent_70%)]"
        aria-hidden="true"
      />
      <div className="relative z-10 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
          {badge && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
              {badge.icon}
              {badge.value}
            </span>
          )}
        </div>
        <p className={`text-[clamp(1.5rem,4vw,2.3rem)] font-semibold tracking-tight ${valueToneClass}`}>{value}</p>
        {secondary && <p className="text-sm font-medium text-slate-600">{secondary}</p>}
        {helper && <p className="text-sm leading-6 text-slate-500">{helper}</p>}
      </div>
    </article>
  );
}

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
    realizedSales: realizedSalesWithFx,
    lastUpdate,
    reload,
  } = usePortfolioData();

  const lastUpdatedDisplay = formatLastUpdatedTime(lastUpdate, locale);
  const rateForSummary = summary?.usdToIlsRate ?? usdToIls;

  const openMetrics = useMemo(
    () => metrics.filter((metric) => metric.position.quantity > 0),
    [metrics],
  );

  const realizedSales = useMemo(() => realizedSalesWithFx, [realizedSalesWithFx]);

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
      },
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
  }, [rateForSummary, realizedSales, settings.annualGrowthRate]);

  const hasDailyChange = metrics.some((metric) => typeof metric.dailyChange === 'number');
  const totalDailyChangeUsd = metrics.reduce(
    (acc, metric) => acc + (metric.dailyChange ?? 0) * metric.position.quantity,
    0,
  );
  const dailyChangeTone = getTrendTone(totalDailyChangeUsd);
  const dailyChangeIcon = getTrendIcon(totalDailyChangeUsd);

  const totalValueIls = summary ? summary.totalValue * summary.usdToIlsRate : 0;
  const totalReturnUsd = summary ? summary.totalValue - summary.totalCost : 0;
  const totalReturnPercent = summary && summary.totalCost !== 0 ? (totalReturnUsd / summary.totalCost) * 100 : 0;
  const combinedEdgeUsd = summary ? summary.totalCombinedUsd - summary.totalProjectedPnLUsd : 0;
  const combinedEdgeIls = summary ? summary.totalCombinedIls - summary.totalProjectedPnLIls : 0;

  const topHoldings = useMemo(
    () =>
      openMetrics
        .slice()
        .sort((a, b) => b.currentValue - a.currentValue)
        .slice(0, 5),
    [openMetrics],
  );

  const openValueTotal = useMemo(
    () => openMetrics.reduce((sum, metric) => sum + metric.currentValue, 0),
    [openMetrics],
  );

  const openPositionsCount = openMetrics.length;
  const winningPositionsCount = useMemo(
    () => openMetrics.filter((metric) => metric.positionPnLUsd >= 0).length,
    [openMetrics],
  );
  const losingPositionsCount = openPositionsCount - winningPositionsCount;

  const winRatePercent = openPositionsCount > 0 ? (winningPositionsCount / openPositionsCount) * 100 : 0;

  const topThreeSharePercent =
    openValueTotal > 0
      ? (topHoldings.slice(0, 3).reduce((sum, metric) => sum + metric.currentValue, 0) / openValueTotal) * 100
      : 0;

  const bestMetric = openMetrics.reduce((best, metric) => {
    if (!best || metric.positionPnLUsd > best.positionPnLUsd) {
      return metric;
    }
    return best;
  }, undefined as (typeof openMetrics)[number] | undefined);

  const worstMetric = openMetrics.reduce((worst, metric) => {
    if (!worst || metric.positionPnLUsd < worst.positionPnLUsd) {
      return metric;
    }
    return worst;
  }, undefined as (typeof openMetrics)[number] | undefined);

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
    [loading, refreshing, reload, t],
  );

  const metricCards = useMemo((): MetricCard[] => {
    if (!summary) {
      return [];
    }

    const taxesUsdDisplay = summary.totalTaxesPaidUsd * -1;
    const netForecastGapUsd = summary.totalNetPnLUsd - summary.totalProjectedPnLUsd;

    const cards: MetricCard[] = [
      {
        key: 'value',
        label: t.dashboard.totalValue,
        value: formatCurrency(summary.totalValue, 'USD', locale),
        secondary: formatCurrency(totalValueIls, 'ILS', locale),
        helper: `${t.dashboard.totalCost}: ${formatCurrency(summary.totalCost, 'USD', locale)}`,
        badge: {
          value: formatSignedPercent(totalReturnPercent, locale),
          className: getTrendTone(totalReturnUsd).badge,
          icon: getTrendIcon(totalReturnUsd),
        },
        featured: true,
      },
      {
        key: 'net',
        label: t.dashboard.netPnL,
        value: formatSignedCurrency(summary.totalNetPnLUsd, 'USD', locale),
        valueToneClass: getTrendTone(summary.totalNetPnLUsd).text,
        secondary: formatSignedCurrency(summary.totalNetPnLIls, 'ILS', locale),
        helper: `${t.dashboard.forecastGap}: ${formatSignedCurrency(netForecastGapUsd, 'USD', locale)}`,
        featured: true,
      },
      {
        key: 'current',
        label: t.dashboard.currentPnL,
        value: formatSignedCurrency(summary.totalCurrentPnLUsd, 'USD', locale),
        valueToneClass: getTrendTone(summary.totalCurrentPnLUsd).text,
        secondary: formatSignedCurrency(summary.totalCurrentPnLIls, 'ILS', locale),
      },
      {
        key: 'projected',
        label: t.dashboard.projectedPnL,
        value: formatSignedCurrency(summary.totalProjectedPnLUsd, 'USD', locale),
        valueToneClass: getTrendTone(summary.totalProjectedPnLUsd).text,
        secondary: formatSignedCurrency(summary.totalProjectedPnLIls, 'ILS', locale),
      },
    ];

    if (closedSummary) {
      cards.push({
        key: 'realized',
        label: t.portfolio.realizedPnLCard,
        value: formatSignedCurrency(closedSummary.totalProfitUsd, 'USD', locale),
        valueToneClass: getTrendTone(closedSummary.totalProfitUsd).text,
        secondary: formatSignedCurrency(closedSummary.totalProfitIls, 'ILS', locale),
        helper: `${t.portfolio.performanceVsExpectedShort}: ${formatSignedCurrency(
          closedSummary.performanceDeltaUsd,
          'USD',
          locale,
        )}`,
        badge: {
          value: formatSignedPercent(closedSummary.performanceDeltaPercent, locale),
          className: getTrendTone(closedSummary.performanceDeltaUsd).badge,
          icon: getTrendIcon(closedSummary.performanceDeltaUsd),
        },
      });
    } else {
      cards.push({
        key: 'taxes',
        label: t.dashboard.taxesPaid,
        value: formatSignedCurrency(taxesUsdDisplay, 'USD', locale),
        valueToneClass: getTrendTone(taxesUsdDisplay).text,
        secondary: formatSignedCurrency(summary.totalTaxesPaidIls * -1, 'ILS', locale),
      });
    }

    return cards;
  }, [
    closedSummary,
    locale,
    summary,
    t.dashboard,
    t.portfolio,
    totalReturnPercent,
    totalReturnUsd,
    totalValueIls,
  ]);

  const copy = locale === 'he'
    ? {
        pulseTitle: 'דופק התיק',
        pulseSubtitle: 'ריכוז ההחזקות שמכתיב את התנועה הכוללת של התיק.',
        distributionLabel: 'ריכוז 3 הגדולות',
        sectionTrend: 'גרף מגמה',
        sectionTrendSubtitle: 'מעקב אחר הנטו מול התחזית והביצוע בפועל.',
        sectionLeaders: 'מובילים מול נגררים',
        sectionLeadersSubtitle: 'החזקה חזקה מול החזקה חלשה נכון לעכשיו.',
        edgeLabel: 'יתרון משולב',
        closedCycleTitle: 'מחזור מימושים',
        closedCycleSubtitle: 'השוואת ביצועי המכירות מול התשואה הצפויה.',
        topHoldingsLabel: 'החזקות מובילות',
      }
    : {
        pulseTitle: 'Portfolio pulse',
        pulseSubtitle: 'The concentration profile that drives your overall performance.',
        distributionLabel: 'Top-3 concentration',
        sectionTrend: 'Trend line',
        sectionTrendSubtitle: 'Track net results versus projection over time.',
        sectionLeaders: 'Leaders vs laggards',
        sectionLeadersSubtitle: 'Your strongest and weakest active holding right now.',
        edgeLabel: 'Combined edge',
        closedCycleTitle: 'Realized cycle',
        closedCycleSubtitle: 'How completed trades compare with expected growth.',
        topHoldingsLabel: 'Leading holdings',
      };

  return (
    <DashboardPageShell direction={locale === 'he' ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10 xl:px-10 2xl:px-12">
        <header className="relative isolate overflow-hidden rounded-[32px] border border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(120deg,rgba(239,246,255,0.96),rgba(248,250,252,0.94)_46%,rgba(236,253,245,0.92))] px-5 py-6 shadow-sm sm:px-6 sm:py-7">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_45%)]"
            aria-hidden="true"
          />

          <div className="relative z-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                <Wallet className="h-3.5 w-3.5" />
                {t.portfolio.title}
              </div>

              <div className="space-y-2">
                <h1 className="text-balance text-[clamp(1.9rem,4vw,2.8rem)] font-bold tracking-tight text-[var(--color-primary-900)]">
                  {t.portfolio.title}
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t.portfolio.subtitle}</p>
              </div>

              <div className="grid gap-2 text-xs font-medium text-slate-600 sm:grid-cols-2 xl:grid-cols-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/85 px-3 py-1.5 shadow-sm">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                  {t.app.updated} {lastUpdatedDisplay ?? '—'}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/85 px-3 py-1.5 shadow-sm">
                  <Target className="h-3.5 w-3.5 text-blue-500" />
                  1 USD ≈ {formatCurrency(rateForSummary, 'ILS', locale)}
                </span>
                {hasDailyChange && (
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 shadow-sm ${dailyChangeTone.badge}`}>
                    {dailyChangeIcon}
                    {formatSignedCurrency(totalDailyChangeUsd, 'USD', locale)}
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

        <main className="mt-8 space-y-6 sm:mt-10 sm:space-y-8">
          {loading ? (
            <section className="rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-white/94 px-4 py-12 shadow-sm sm:px-6">
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                <p>{t.common.loading}</p>
              </div>
            </section>
          ) : positions.length === 0 || !summary ? (
            <section className="rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-white/94 px-4 py-12 shadow-sm sm:px-6">
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <div className="rounded-full border border-slate-200 bg-slate-50 p-3 text-blue-600">
                  <LineChart className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-slate-800">{t.portfolio.emptyTitle}</p>
                  <p className="text-sm text-slate-500">{t.portfolio.emptyDescription}</p>
                </div>
                <Button asChild size="sm" className="gap-2 bg-[var(--color-primary-500)] text-white hover:bg-[var(--color-primary-700)]">
                  <Link href="/positions">
                    <ArrowUpRight className="h-4 w-4" />
                    <span>{t.positions.add}</span>
                  </Link>
                </Button>
              </div>
            </section>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {metricCards.map(({ key, ...card }) => (
                  <MetricCardTile key={key} {...card} />
                ))}
              </section>

              <section className="grid gap-6 xl:grid-cols-[minmax(0,1.24fr)_minmax(19rem,0.76fr)] xl:items-start">
                <article className="rounded-[28px] border border-[color:var(--color-slate-200)]/85 bg-white/95 px-5 py-5 shadow-sm sm:px-6 sm:py-6">
                  <div className="space-y-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          <Activity className="h-3.5 w-3.5" />
                          {copy.sectionTrend}
                        </div>
                        <h2 className="text-balance text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                          {t.portfolio.timelineTitle}
                        </h2>
                        <p className="max-w-2xl text-sm leading-6 text-slate-500">{copy.sectionTrendSubtitle}</p>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {t.portfolio.openPositions}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">{openPositionsCount}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {copy.distributionLabel}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {formatPercent(topThreeSharePercent, locale)}
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
                </article>

                <aside className="space-y-4 xl:sticky xl:top-8">
                  <section className="rounded-[28px] border border-[color:var(--color-slate-200)]/85 bg-white/95 p-5 shadow-sm">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {copy.pulseTitle}
                      </p>
                      <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                        {copy.topHoldingsLabel}
                      </h2>
                      <p className="text-sm leading-6 text-slate-500">{copy.pulseSubtitle}</p>
                    </div>

                    <div className="mt-4 space-y-3">
                      {topHoldings.length > 0 ? (
                        topHoldings.map((metric) => {
                          const sharePercent = openValueTotal > 0 ? (metric.currentValue / openValueTotal) * 100 : 0;
                          const tone = getTrendTone(metric.positionPnLUsd);
                          const barWidth = Math.min(100, Math.max(sharePercent, 5));

                          return (
                            <div
                              key={metric.position.activationId ?? metric.position.id ?? metric.position.symbol}
                              className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {metric.position.display || metric.position.symbol}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {formatCurrency(metric.currentValue, 'USD', locale)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-slate-900">{formatPercent(sharePercent, locale)}</p>
                                  <p className={`text-xs font-medium ${tone.text}`}>
                                    {formatSignedCurrency(metric.positionPnLUsd, 'USD', locale)}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2.5 h-2 rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${metric.positionPnLUsd >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                          {t.portfolio.timelineEmpty}
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-[color:var(--color-slate-200)]/85 bg-white/95 p-5 shadow-sm">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {copy.sectionLeaders}
                      </p>
                      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t.portfolio.moversTitle}</h2>
                      <p className="text-sm leading-6 text-slate-500">{copy.sectionLeadersSubtitle}</p>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                        <p className="text-sm font-medium text-emerald-700">{t.portfolio.bestPerformer}</p>
                        {bestMetric ? (
                          <div className="mt-2 space-y-1">
                            <p className="text-base font-semibold text-slate-900">
                              {bestMetric.position.display || bestMetric.position.symbol}
                            </p>
                            <p className="text-sm text-slate-600">
                              {formatSignedCurrency(bestMetric.positionPnLUsd, 'USD', locale)}{' '}
                              <span className="text-xs text-slate-500">
                                ({formatSignedPercent(bestMetric.roiPercent, locale)})
                              </span>
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">{t.portfolio.moversEmpty}</p>
                        )}
                      </div>

                      <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                        <p className="text-sm font-medium text-rose-700">{t.portfolio.worstPerformer}</p>
                        {worstMetric ? (
                          <div className="mt-2 space-y-1">
                            <p className="text-base font-semibold text-slate-900">
                              {worstMetric.position.display || worstMetric.position.symbol}
                            </p>
                            <p className="text-sm text-slate-600">
                              {formatSignedCurrency(worstMetric.positionPnLUsd, 'USD', locale)}{' '}
                              <span className="text-xs text-slate-500">
                                ({formatSignedPercent(worstMetric.roiPercent, locale)})
                              </span>
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">{t.portfolio.moversEmpty}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm">
                        <div>
                          <p className="text-xs font-medium text-slate-500">{locale === 'he' ? 'מנצחות' : 'Winners'}</p>
                          <p className="text-base font-semibold text-slate-900">{winningPositionsCount}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">{locale === 'he' ? 'מפסידות' : 'Losers'}</p>
                          <p className="text-base font-semibold text-slate-900">{losingPositionsCount}</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{copy.edgeLabel}</p>
                        <p className={`mt-1 text-xl font-semibold ${getTrendTone(combinedEdgeUsd).text}`}>
                          {formatSignedCurrency(combinedEdgeUsd, 'USD', locale)}
                        </p>
                        <p className="text-xs font-medium text-slate-500">
                          {formatSignedCurrency(combinedEdgeIls, 'ILS', locale)}
                        </p>
                      </div>
                    </div>
                  </section>

                  {closedSummary && (
                    <section className="rounded-[28px] border border-[color:var(--color-slate-200)]/85 bg-white/95 p-5 shadow-sm">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {copy.closedCycleTitle}
                        </p>
                        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                          {t.portfolio.closedOverviewTitle}
                        </h2>
                        <p className="text-sm leading-6 text-slate-500">{copy.closedCycleSubtitle}</p>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            {t.portfolio.closedTotalProceeds}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {formatCurrency(closedSummary.totalProceedsUsd, 'USD', locale)}
                          </p>
                          <p className="text-xs font-medium text-slate-500">
                            {formatCurrency(closedSummary.totalProceedsIls, 'ILS', locale)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            {t.portfolio.closedTotalProfit}
                          </p>
                          <p className={`mt-1 text-lg font-semibold ${getTrendTone(closedSummary.totalProfitUsd).text}`}>
                            {formatSignedCurrency(closedSummary.totalProfitUsd, 'USD', locale)}
                          </p>
                          <p className="text-xs font-medium text-slate-500">
                            {formatSignedCurrency(closedSummary.totalProfitIls, 'ILS', locale)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-slate-500">
                              {t.portfolio.performanceVsExpectedShort}
                            </span>
                            <span className={`text-sm font-semibold ${getTrendTone(closedSummary.performanceDeltaUsd).text}`}>
                              {formatSignedCurrency(closedSummary.performanceDeltaUsd, 'USD', locale)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {formatSignedCurrency(closedSummary.expectedProfitUsd, 'USD', locale)} · {' '}
                            {t.portfolio.closedHoldingFootnote(Math.round(closedSummary.averageHoldingDays))}
                          </p>
                        </div>

                        <p className="text-xs font-medium text-slate-500">
                          {t.portfolio.closedPositionsFootnote(closedSummary.uniqueSymbols)}
                        </p>
                      </div>
                    </section>
                  )}
                </aside>
              </section>

              <section className="rounded-[24px] border border-slate-200/80 bg-white/90 px-4 py-3.5 shadow-sm sm:px-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="inline-flex items-center gap-2 text-sm text-slate-600">
                    {combinedEdgeUsd >= 0 ? (
                      <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-rose-600" />
                    )}
                    <span>
                      {locale === 'he'
                        ? `שיעור הצלחה בפוזיציות פתוחות: ${formatPercent(winRatePercent, locale)}`
                        : `Open-position win rate: ${formatPercent(winRatePercent, locale)}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={reload}
                    disabled={loading || refreshing}
                    className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
                    {locale === 'he' ? 'רענון נתונים' : 'Refresh data'}
                  </button>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </DashboardPageShell>
  );
}
