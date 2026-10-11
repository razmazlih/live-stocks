'use client';

import { useMemo } from 'react';
import { ChevronDown, RefreshCw, LineChart } from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { calculateRealizedPortfolioTotals, formatCurrency } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { useReturnContext } from '@/hooks/use-return-context';
import { PortfolioVisualizations } from '@/components/portfolio/portfolio-visualizations';
import { PortfolioOverviewChart } from '@/components/charts/portfolio-overview-chart';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { PageHeader } from '@/components/dashboard/page-header';
import { DashboardContainer, DashboardMain, DashboardSurface } from '@/components/dashboard/page-primitives';
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
    openSummary,
    portfolioTimeline,
    usdToIls,
    historicalIlsNetPnL,
    historicalIlsRealizedPnL,
    realizedSales: realizedSalesWithFx,
    lastUpdate,
    reload,
  } = usePortfolioData();

  useReturnContext(!loading);

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

    const realizedTotals = calculateRealizedPortfolioTotals(
      realizedSales,
      settings.annualGrowthRate,
      rateForSummary,
    );
    const totals = realizedSales.reduce(
      (acc, sale) => {
        acc.totalQuantity += sale.quantity;
        acc.weightedHoldingDays += sale.holdingPeriodDays * sale.quantity;
        return acc;
      },
      {
        totalQuantity: 0,
        weightedHoldingDays: 0,
      }
    );

    const averageHoldingDays = totals.totalQuantity > 0 ? totals.weightedHoldingDays / totals.totalQuantity : 0;
    const performanceDeltaUsd = realizedTotals.profitUsd - realizedTotals.expectedProfitUsd;
    const performanceDeltaIls = realizedTotals.profitIls - realizedTotals.expectedProfitIls;
    const performanceDeltaPercent = realizedTotals.expectedProfitUsd !== 0
      ? (performanceDeltaUsd / Math.abs(realizedTotals.expectedProfitUsd)) * 100
      : 0;

    const uniqueSymbols = new Set(realizedSales.map((sale) => sale.symbol));

    return {
      totalProceedsUsd: realizedTotals.proceedsUsd,
      totalProceedsIls: realizedTotals.proceedsIls,
      totalCostUsd: realizedTotals.costUsd,
      totalCostIls: realizedTotals.costIls,
      totalProfitUsd: realizedTotals.profitUsd,
      totalProfitIls: realizedTotals.profitIls,
      expectedProfitUsd: realizedTotals.expectedProfitUsd,
      expectedProfitIls: realizedTotals.expectedProfitIls,
      performanceDeltaUsd,
      performanceDeltaIls,
      performanceDeltaPercent,
      averageHoldingDays,
      uniqueSymbols: uniqueSymbols.size,
    };
  }, [realizedSales, rateForSummary, settings.annualGrowthRate]);

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
    <DashboardRouteShell activeKey="portfolio" locale={locale}>
      <DashboardContainer>
        <PageHeader
          title={t.portfolio.title}
          subtitle={locale === 'he' ? 'ביצועי התיק לאורך זמן, כולל החזקות פעילות ומכירות.' : 'Portfolio performance over time, including active holdings and sales.'}
          icon={LineChart}
          quickActionsTitle={t.dashboard.quickActions}
          quickActions={quickActions}
          metaBadges={[
            {
              key: 'updated',
              label: `${t.app.updated} ${lastUpdatedDisplay ?? '—'}`,
              className: 'bg-blue-50 text-blue-700 border-blue-100',
            },
            {
              key: 'rate',
              icon: LineChart,
              label: `1 USD ≈ ${formatCurrency(rateForSummary, 'ILS', locale)}`,
            },
          ]}
        />

        <DashboardMain>
          <DashboardSurface>
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
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid items-start gap-5">
                      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-900">{t.portfolio.timelineTitle}</h2>
                          <p className="text-sm text-slate-500">{t.portfolio.overviewDescription}</p>
                        </div>
                        {portfolioTimeline.length > 0 ? (
                          <PortfolioOverviewChart data={portfolioTimeline} summary={summary} />
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white py-14 text-center text-slate-500">
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
                                className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"
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

                        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <h2 className="text-lg font-semibold text-slate-900">{t.portfolio.moversTitle}</h2>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3.5">
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
                            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3.5">
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
                          <details className="summary-details rounded-xl border border-slate-200 bg-white shadow-sm">
                            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:p-5">
                              <span>{t.portfolio.closedOverviewTitle}</span>
                              <ChevronDown aria-hidden="true" className="summary-chevron h-4 w-4 shrink-0" />
                            </summary>
                            <div className="space-y-3 border-t border-slate-100 p-4 sm:p-5">
                            <p className="text-sm text-slate-500">{t.portfolio.closedOverviewDescription}</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              {closedStats.map((stat) => (
                                <div
                                  key={stat.key}
                                  className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"
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
                          </details>
                        )}
                      </aside>
                    </div>

                    {summaryCards.length > 0 && (
                      <details className="summary-details rounded-xl border border-slate-200 bg-white shadow-sm">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:p-5">
                          <span>{locale === 'he' ? 'פירוט רווחים, תחזית ומסים' : 'Profit, projection and tax details'}</span>
                          <ChevronDown aria-hidden="true" className="summary-chevron h-4 w-4 shrink-0" />
                        </summary>
                        <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 sm:p-5 2xl:grid-cols-3">
                          {summaryCards.map((card) => (
                            <div
                              key={card.key}
                              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                            >
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
                      </details>
                    )}

                    {openMetrics.length > 0 && (
                      <details className="summary-details rounded-xl border border-slate-200 bg-white shadow-sm">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 sm:p-5">
                          <span>{locale === 'he' ? 'הרכב התיק והשוואת ההחזקות' : 'Allocation and holdings comparison'}</span>
                          <ChevronDown aria-hidden="true" className="summary-chevron h-4 w-4 shrink-0" />
                        </summary>
                        <div className="border-t border-slate-100 p-3 sm:p-5">
                          <PortfolioVisualizations metrics={openMetrics} summary={openSummary ?? summary} />
                        </div>
                      </details>
                    )}
                  </div>
                )}
          </DashboardSurface>
        </DashboardMain>
      </DashboardContainer>
    </DashboardRouteShell>
  );
}
