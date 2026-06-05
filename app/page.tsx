'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { PositionMetrics } from '@/types';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { DashboardEmptyState } from '@/components/dashboard/empty-state';
import { DailyChangeBadge } from '@/components/dashboard/daily-change-badge';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { PageHeader } from '@/components/dashboard/page-header';
import { DashboardContainer } from '@/components/dashboard/page-primitives';
import {
  SummaryCard,
  SummaryCardGrid,
} from '@/components/dashboard/summary/summary-card-grid';
import { PositionsOverview } from '@/components/dashboard/positions/positions-overview';
import { PortfolioVisualizations } from '@/components/portfolio/portfolio-visualizations';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import {
  Activity,
  RefreshCw,
  LayoutDashboard,
  Layers,
  LineChart,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import {
  formatLastUpdatedTime,
  formatSignedCurrency,
  formatSignedPercent,
  getTrendIcon,
  getTrendTone,
} from '@/lib/utils/portfolio-display';

export default function HomePage() {
  const [activeSection, setActiveSection] = useState<'summary' | 'positions' | 'visualizations'>(
    'positions'
  );
  const [isMobileViewport, setIsMobileViewport] = useState<boolean | null>(null);
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const {
    loading,
    refreshing,
    metrics,
    summary: portfolioSummary,
    openSummary,
    sparklineData,
    usdToIls,
    historicalIlsNetPnL,
    historicalIlsRealizedPnL,
    lastUpdate,
    reload,
  } = usePortfolioData();

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);

    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  const lastUpdatedDisplay = formatLastUpdatedTime(lastUpdate, locale);

  const hasDailyChange = metrics.some((metric) => typeof metric.dailyChange === 'number');
  const totalDailyChangeUsd = metrics.reduce(
    (acc, metric) => acc + (metric.dailyChange ?? 0) * metric.position.quantity,
    0
  );
  const dailyChangeTone = getTrendTone(totalDailyChangeUsd);
  const dailyChangeIcon = getTrendIcon(totalDailyChangeUsd);

  const summary = openSummary ?? portfolioSummary;
  const currentRate = summary?.usdToIlsRate ?? usdToIls;
  const totalValueIls = summary ? summary.totalValue * summary.usdToIlsRate : 0;
  const totalReturnUsd = summary ? summary.totalValue - summary.totalCost : 0;
  const totalReturnPercent = summary && summary.totalCost !== 0 ? (totalReturnUsd / summary.totalCost) * 100 : 0;

  const sortByForecastGap = useCallback(
    (items: PositionMetrics[]) => {
      const localeKey = locale === 'he' ? 'he' : 'en';

      return items
        .slice()
        .sort((a, b) => {
          const aGap = Number.isFinite(a.combined) ? a.combined : Number.NEGATIVE_INFINITY;
          const bGap = Number.isFinite(b.combined) ? b.combined : Number.NEGATIVE_INFINITY;

          const gapDelta = bGap - aGap;

          if (Math.abs(gapDelta) > 1e-8) {
            return gapDelta;
          }

          const aLabel = a.position.display || a.position.symbol;
          const bLabel = b.position.display || b.position.symbol;

          return aLabel.localeCompare(bLabel, localeKey, { sensitivity: 'base' });
        });
    },
    [locale]
  );

  const openMetrics = useMemo(
    () => sortByForecastGap(metrics.filter((metric) => metric.position.quantity > 0)),
    [metrics, sortByForecastGap]
  );
  const closedMetrics = useMemo(
    () => sortByForecastGap(metrics.filter((metric) => metric.position.quantity <= 0)),
    [metrics, sortByForecastGap]
  );
  const hasAnyPositions = openMetrics.length > 0 || closedMetrics.length > 0;

  const dailyChangeData = hasDailyChange
    ? {
        value: formatSignedCurrency(totalDailyChangeUsd, 'USD', locale),
        toneClass: dailyChangeTone.badge,
        icon: dailyChangeIcon,
        label: t.dashboard.dailyChange,
      }
    : null;

  const quickActions = useMemo(
    () =>
      createCommonQuickActions(t, {
        exclude: ['dashboard'],
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

  const summaryCards: SummaryCard[] = summary
    ? [
        {
          key: 'value',
          label: t.dashboard.totalValue,
          value: formatCurrency(summary.totalValue, 'USD', locale),
          valueClass: 'text-2xl font-semibold text-slate-950',
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
            className: getTrendTone(totalReturnUsd).badge,
            icon: getTrendIcon(totalReturnUsd),
          },
          footnote: `1 USD ≈ ${formatCurrency(currentRate, 'ILS', locale)}`,
        },
        {
          key: 'current',
          label: t.dashboard.currentPnL,
          value: formatSignedCurrency(summary.totalCurrentPnLUsd, 'USD', locale),
          valueClass: `text-2xl font-semibold ${getTrendTone(summary.totalCurrentPnLUsd).text}`,
          secondary: {
            label: 'ILS',
            value: formatSignedCurrency(summary.totalCurrentPnLIls, 'ILS', locale),
          },
          helper: [
            { label: t.portfolio.ilsCurrentLabel, value: formatSignedCurrency(summary.totalCurrentPnLIls, 'ILS', locale) },
            { label: t.portfolio.ilsHistoricalAdjustedLabel, value: formatSignedCurrency(historicalIlsNetPnL, 'ILS', locale) },
          ],
        },
        {
          key: 'projected',
          label: t.dashboard.projectedPnL,
          value: formatSignedCurrency(summary.totalProjectedPnLUsd, 'USD', locale),
          valueClass: `text-2xl font-semibold ${getTrendTone(summary.totalProjectedPnLUsd).text}`,
          secondary: {
            label: 'ILS',
            value: formatSignedCurrency(summary.totalProjectedPnLIls, 'ILS', locale),
          },
        },
        {
          key: 'combined',
          label: t.dashboard.combinedPnL,
          value: formatSignedCurrency(summary.totalCombinedUsd, 'USD', locale),
          valueClass: `text-2xl font-semibold ${getTrendTone(summary.totalCombinedUsd).text}`,
          secondary: {
            label: 'ILS',
            value: formatSignedCurrency(summary.totalCombinedIls, 'ILS', locale),
          },
          helper: [
            { label: t.portfolio.ilsCurrentLabel, value: formatSignedCurrency(summary.totalCombinedIls, 'ILS', locale) },
            {
              label: t.portfolio.ilsHistoricalAdjustedLabel,
              value: formatSignedCurrency(historicalIlsRealizedPnL, 'ILS', locale),
            },
          ],
        },
      ]
    : [];

  const sectionTabs = [
    {
      key: 'summary' as const,
      label: t.dashboard.sectionSummaryLabel,
      description: t.dashboard.sectionSummaryDescription,
      icon: LayoutDashboard,
      available: Boolean(summary && summaryCards.length > 0),
    },
    {
      key: 'positions' as const,
      label: t.dashboard.sectionPositionsLabel,
      description: t.dashboard.sectionPositionsDescription,
      icon: Layers,
      available: hasAnyPositions,
    },
    {
      key: 'visualizations' as const,
      label: t.dashboard.sectionVisualizationsLabel,
      description: t.dashboard.sectionVisualizationsDescription,
      icon: LineChart,
      available: Boolean(summary && openMetrics.length > 0),
    },
  ];

  const topExposure = useMemo(
    () =>
      openMetrics
        .slice()
        .sort((a, b) => b.currentValue - a.currentValue)
        .at(0),
    [openMetrics]
  );

  const strongestDailyMover = useMemo(
    () =>
      openMetrics
        .filter((metric) => typeof metric.dailyChange === 'number')
        .slice()
        .sort(
          (a, b) =>
            (b.dailyChange ?? 0) * b.position.quantity -
            (a.dailyChange ?? 0) * a.position.quantity
        )
        .at(0),
    [openMetrics]
  );

  const biggestForecastGap = useMemo(
    () =>
      openMetrics
        .slice()
        .sort((a, b) => a.combined - b.combined)
        .at(0),
    [openMetrics]
  );

  const sideInsights: DashboardInsight[] = [
    {
      key: 'exposure',
      label: locale === 'he' ? 'חשיפה מרכזית' : 'Largest exposure',
      title: topExposure?.position.display ?? t.dashboard.sectionPositionsEmpty,
      value: topExposure ? formatCurrency(topExposure.currentValue, 'USD', locale) : '—',
      helper: topExposure?.position.symbol ?? t.dashboard.emptyChart,
      icon: WalletCards,
      tone: 'neutral',
    },
    {
      key: 'momentum',
      label: t.dashboard.dailyChange,
      title: strongestDailyMover?.position.display ?? t.dashboard.topMoversNoData,
      value: strongestDailyMover
        ? formatSignedCurrency(
            (strongestDailyMover.dailyChange ?? 0) * strongestDailyMover.position.quantity,
            'USD',
            locale
          )
        : '—',
      helper: strongestDailyMover?.position.symbol ?? t.dashboard.emptyChart,
      icon: Activity,
      tone:
        strongestDailyMover && (strongestDailyMover.dailyChange ?? 0) * strongestDailyMover.position.quantity < 0
          ? 'negative'
          : 'positive',
    },
    {
      key: 'forecast',
      label: t.dashboard.forecastGap,
      title: biggestForecastGap?.position.display ?? t.dashboard.sectionVisualizationsEmpty,
      value: biggestForecastGap ? formatSignedCurrency(biggestForecastGap.combined, 'USD', locale) : '—',
      helper: biggestForecastGap?.position.symbol ?? t.dashboard.emptyChart,
      icon: LineChart,
      tone: biggestForecastGap && biggestForecastGap.combined < 0 ? 'negative' : 'positive',
    },
  ];

  const activeSectionConfig = sectionTabs.find((tab) => tab.key === activeSection);
  const renderSectionPlaceholder = (message: string) => (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );

  const renderSummarySection = () =>
    summary && summaryCards.length > 0 ? (
      <div className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-slate-900">{t.dashboard.summaryTitle}</h2>
          {dailyChangeData && (
            <DailyChangeBadge
              toneClass={dailyChangeData.toneClass}
              icon={dailyChangeData.icon}
              value={dailyChangeData.value}
              label={dailyChangeData.label}
            />
          )}
        </div>
        <SummaryCardGrid cards={summaryCards} />
      </div>
    ) : (
      renderSectionPlaceholder(t.dashboard.sectionSummaryEmpty)
    );

  const renderPositionsSection = () =>
    hasAnyPositions ? (
      <PositionsOverview
        openTitle={t.dashboard.positionsTitle}
        closedTitle={t.dashboard.closedPositionsTitle}
        openMetrics={openMetrics}
        closedMetrics={closedMetrics}
        sparklineData={sparklineData}
      />
    ) : (
      renderSectionPlaceholder(t.dashboard.sectionPositionsEmpty)
    );

  const renderVisualizationsSection = () =>
    summary && openMetrics.length > 0 ? (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{t.dashboard.visualizationsTitle}</h3>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
            {t.dashboard.portfolioOverviewFootnote}
          </span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <PortfolioVisualizations metrics={openMetrics} summary={summary} />
        </div>
      </div>
    ) : (
      renderSectionPlaceholder(t.dashboard.sectionVisualizationsEmpty)
    );

  return (
    <DashboardRouteShell activeKey="dashboard" locale={locale}>
      <DashboardContainer width="full" className="space-y-5">
              <PageHeader
                title={t.app.title}
                subtitle={t.app.subtitle}
                icon={LayoutDashboard}
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
                    label: `1 USD ≈ ${formatCurrency(currentRate, 'ILS', locale)}`,
                  },
                  ...(dailyChangeData
                    ? [
                        {
                          key: 'daily',
                          label: `${dailyChangeData.value} ${dailyChangeData.label}`,
                          className: dailyChangeData.toneClass,
                        },
                      ]
                    : []),
                ]}
              />

              {loading ? (
                <section className="rounded-xl border border-slate-200 bg-white px-6 py-20 text-center text-slate-500 shadow-sm">
                  <RefreshCw className="mx-auto h-5 w-5 animate-spin text-blue-500" />
                  <p className="mt-3 text-sm font-medium">{t.common.loading}</p>
                </section>
              ) : !hasAnyPositions ? (
                <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <DashboardEmptyState
                    title={t.dashboard.noPositions}
                    description={t.positions.title}
                    actionLabel={t.positions.add}
                    actionHref="/positions"
                  />
                </section>
              ) : (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="min-w-0 space-y-5">
                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                      {renderSummarySection()}
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                      <div className="mb-5 flex flex-col gap-4 sm:hidden">
                        <div className="space-y-1">
                          <h2 className="text-base font-semibold text-slate-950">
                            {t.dashboard.sectionSelectorTitle}
                          </h2>
                          {activeSectionConfig?.description && (
                            <p className="text-sm text-slate-500">
                              {activeSectionConfig.description}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {sectionTabs.filter((tab) => tab.key !== 'summary').map(({ key, label, icon: Icon, available }) => {
                            const isActive = activeSection === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => available && setActiveSection(key)}
                                disabled={!available}
                                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                                  isActive
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
                                } ${available ? '' : 'cursor-not-allowed opacity-45'}`}
                              >
                                <Icon className="h-4 w-4" />
                                <span>{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {isMobileViewport === null ? null : isMobileViewport ? (
                        <div className="space-y-5 sm:hidden">
                          {(activeSection === 'summary' || activeSection === 'positions') && renderPositionsSection()}
                          {activeSection === 'visualizations' && renderVisualizationsSection()}
                        </div>
                      ) : (
                        <div className="hidden space-y-5 sm:block">
                          {renderPositionsSection()}
                          {renderVisualizationsSection()}
                        </div>
                      )}
                    </section>
                  </div>

                  <DashboardInsightPanel
                    title={locale === 'he' ? 'תובנות' : 'Insights'}
                    marketTitle={locale === 'he' ? 'Market Pulse' : 'Market Pulse'}
                    insights={sideInsights}
                    locale={locale}
                  />
                </div>
              )}
      </DashboardContainer>
    </DashboardRouteShell>
  );
}

interface DashboardInsight {
  key: string;
  label: string;
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone: 'positive' | 'negative' | 'neutral';
}

function DashboardInsightPanel({
  title,
  marketTitle,
  insights,
  locale,
}: {
  title: string;
  marketTitle: string;
  insights: DashboardInsight[];
  locale: 'he' | 'en';
}) {
  const marketRows = [
    { label: 'S&P 500', value: '5,303.27', change: '+0.67%', tone: 'positive' },
    { label: 'NASDAQ 100', value: '18,734.11', change: '+0.89%', tone: 'positive' },
    { label: 'VIX', value: '12.48', change: '-1.81%', tone: 'negative' },
    { label: 'US 10Y', value: '4.28%', change: '-0.03', tone: 'negative' },
  ];

  return (
    <aside className="space-y-5 xl:sticky xl:top-[92px] xl:self-start">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <Link href="/insights" className="text-xs font-semibold text-blue-700 hover:text-blue-800">
            {locale === 'he' ? 'הצג הכל' : 'View all'}
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {insights.map((insight) => {
            const Icon = insight.icon;
            const toneClass =
              insight.tone === 'positive'
                ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                : insight.tone === 'negative'
                  ? 'text-rose-700 bg-rose-50 border-rose-100'
                  : 'text-slate-700 bg-slate-50 border-slate-200';

            return (
              <div key={insight.key} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${toneClass}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-500">{insight.label}</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-slate-950">{insight.title}</p>
                    <div className="mt-2 flex items-baseline justify-between gap-3">
                      <span className="text-base font-semibold tabular-nums text-slate-950">{insight.value}</span>
                      <span className="text-xs font-medium text-slate-500">{insight.helper}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-950">{marketTitle}</h2>
          <span className="text-xs font-medium text-slate-500">10:30 AM</span>
        </div>
        <div className="mt-3 divide-y divide-slate-100">
          {marketRows.map((row) => (
            <div key={row.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2.5 text-sm">
              <span className="font-semibold text-slate-700">{row.label}</span>
              <span className="font-medium tabular-nums text-slate-700">{row.value}</span>
              <span className={`font-semibold tabular-nums ${row.tone === 'positive' ? 'text-emerald-600' : 'text-rose-600'}`}>
                {row.change}
              </span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
