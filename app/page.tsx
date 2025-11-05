'use client';

import { useCallback, useMemo, useState } from 'react';
import type { PositionMetrics } from '@/types';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { DashboardEmptyState } from '@/components/dashboard/empty-state';
import { DailyChangeBadge } from '@/components/dashboard/daily-change-badge';
import {
  SummaryCard,
  SummaryCardGrid,
} from '@/components/dashboard/summary/summary-card-grid';
import { PositionsOverview } from '@/components/dashboard/positions/positions-overview';
import { PortfolioVisualizations } from '@/components/portfolio/portfolio-visualizations';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import {
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  LayoutDashboard,
  Layers,
  LineChart,
} from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';

export default function HomePage() {
  const [activeSection, setActiveSection] = useState<'summary' | 'positions' | 'visualizations'>(
    'positions'
  );
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const {
    loading,
    refreshing,
    positions,
    metrics,
    summary: portfolioSummary,
    openSummary,
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
        value: formatSignedCurrency(totalDailyChangeUsd, 'USD'),
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
            className: getTrendTone(totalReturnUsd).badge,
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

  const activeSectionConfig = sectionTabs.find((tab) => tab.key === activeSection);
  const renderSectionPlaceholder = (message: string) => (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-[color:var(--color-neutral-white)]/70 px-6 py-10 text-center text-sm text-slate-500">
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
        <h3 className="text-lg font-semibold text-slate-900">{t.dashboard.visualizationsTitle}</h3>
        <div className="rounded-2xl border border-slate-100 bg-[color:var(--color-neutral-white)]/70 p-4 shadow-inner">
          <PortfolioVisualizations metrics={openMetrics} summary={summary} timeline={portfolioTimeline} />
        </div>
      </div>
    ) : (
      renderSectionPlaceholder(t.dashboard.sectionVisualizationsEmpty)
    );

  return (
    <div className="relative min-h-screen pb-16">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <DashboardHero
            title={t.app.title}
            subtitle={t.app.subtitle}
            updatedLabel={t.app.updated}
            lastUpdatedDisplay={lastUpdatedDisplay}
            exchangeRateLabel="1 USD ≈"
            exchangeRateValue={formatCurrency(currentRate, 'ILS', locale)}
            quickActionsTitle={t.dashboard.quickActions}
            quickActions={quickActions}
            dailyChange={dailyChangeData}
          />

          <main className="mt-10">
            <section className="glass-panel glass-panel--content px-4 py-8 sm:px-8">
              <div className="glass-glow glass-glow--content" />
              <div className="relative z-10">
                {loading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
                    <p>{t.common.loading}</p>
                  </div>
                ) : !hasAnyPositions ? (
                  <DashboardEmptyState
                    title={t.dashboard.noPositions}
                    description={t.positions.title}
                    actionLabel={t.positions.add}
                    actionHref="/positions"
                  />
                ) : (
                  <div className="space-y-6">
                    <div className="glass-subpanel flex flex-col gap-4 p-4 sm:hidden">
                      <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-slate-900">
                          {t.dashboard.sectionSelectorTitle}
                        </h2>
                        {activeSectionConfig?.description && (
                          <p className="text-sm text-slate-500">
                            {activeSectionConfig.description}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sectionTabs.map(({ key, label, icon: Icon, available }) => {
                          const isActive = activeSection === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => available && setActiveSection(key)}
                              disabled={!available}
                              className={`group inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                                isActive
                                  ? 'border-blue-500 bg-[color:var(--color-blue-50)]/70 text-blue-600 shadow-sm'
                                  : 'border-overlay-neutral-white bg-[color:var(--color-neutral-white)]/70 text-slate-500 hover:border-blue-200 hover:bg-[color:var(--color-blue-50)]/60 hover:text-blue-600'
                              } ${available ? '' : 'cursor-not-allowed opacity-60 hover:border-overlay-neutral-white hover:bg-[color:var(--color-neutral-white)]/70 hover:text-slate-500'}`}
                            >
                              <Icon
                                className={`h-4 w-4 transition ${
                                  isActive ? 'text-blue-500' : 'text-slate-400 group-hover:text-blue-500'
                                }`}
                              />
                              <span>{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-10 sm:hidden">
                      {activeSection === 'summary' && renderSummarySection()}
                      {activeSection === 'positions' && renderPositionsSection()}
                      {activeSection === 'visualizations' && renderVisualizationsSection()}
                    </div>
                    <div className="hidden space-y-10 sm:block">
                      {renderSummarySection()}
                      {renderPositionsSection()}
                      {renderVisualizationsSection()}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
    </div>
  );
}
