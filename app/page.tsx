'use client';

import { useCallback, useMemo } from 'react';
import type { PositionMetrics } from '@/types';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { DashboardEmptyState } from '@/components/dashboard/empty-state';
import { DailyChangeBadge } from '@/components/dashboard/daily-change-badge';
import { PositionCard } from '@/components/portfolio/position-card';
import { PortfolioVisualizations } from '@/components/portfolio/portfolio-visualizations';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { RefreshCw, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';

export default function HomePage() {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const {
    loading,
    refreshing,
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

  const renderSectionPlaceholder = (message: string) => (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#EEF5FF]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#E4F1FF] via-[#F8FBFF] to-[#E3EEFF]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_60%)]" />
      <div className="relative">
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
            <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-4 py-8 shadow-xl backdrop-blur-sm sm:px-8">
              <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-blue-100/50 blur-3xl" />
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
                  <div className="space-y-10">
                    <div className="space-y-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <h2 className="text-xl font-semibold text-slate-900">
                            {t.dashboard.positionsTitle}
                          </h2>
                          <p className="text-sm text-slate-500">
                            {t.dashboard.positionsSortedByForecast}
                          </p>
                        </div>
                        {dailyChangeData && (
                          <DailyChangeBadge
                            toneClass={dailyChangeData.toneClass}
                            icon={dailyChangeData.icon}
                            value={dailyChangeData.value}
                            label={dailyChangeData.label}
                          />
                        )}
                      </div>
                      {openMetrics.length > 0 ? (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {openMetrics.map((metrics) => (
                            <PositionCard
                              key={metrics.position.id || metrics.position.symbol}
                              metrics={metrics}
                              sparklineData={sparklineData[metrics.position.symbol] || []}
                            />
                          ))}
                        </div>
                      ) : (
                        renderSectionPlaceholder(t.dashboard.sectionPositionsEmpty)
                      )}
                    </div>

                    <div className="space-y-5">
                      <div className="space-y-1">
                        <h2 className="text-xl font-semibold text-slate-900">
                          {t.dashboard.closedPositionsTitle}
                        </h2>
                        <p className="text-sm text-slate-500">
                          {t.dashboard.positionsSortedByForecast}
                        </p>
                      </div>
                      {closedMetrics.length > 0 ? (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {closedMetrics.map((metrics) => (
                            <PositionCard
                              key={`closed-${metrics.position.id || metrics.position.symbol}`}
                              metrics={metrics}
                              sparklineData={sparklineData[metrics.position.symbol] || []}
                            />
                          ))}
                        </div>
                      ) : (
                        renderSectionPlaceholder(t.dashboard.sectionPositionsEmpty)
                      )}
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {t.dashboard.visualizationsTitle}
                      </h3>
                      {summary && openMetrics.length > 0 ? (
                        <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-inner">
                          <PortfolioVisualizations
                            metrics={openMetrics}
                            summary={summary}
                            timeline={portfolioTimeline}
                          />
                        </div>
                      ) : (
                        renderSectionPlaceholder(t.dashboard.sectionVisualizationsEmpty)
                      )}
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
