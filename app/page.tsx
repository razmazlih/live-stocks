'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { RefreshCw, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';

export default function HomePage() {
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

  const openMetrics = useMemo(
    () => metrics.filter((metric) => metric.position.quantity > 0),
    [metrics]
  );
  const closedMetrics = useMemo(
    () => metrics.filter((metric) => metric.position.quantity <= 0),
    [metrics]
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

  type DashboardSectionKey = 'summary' | 'positions' | 'visualizations';

  const availableSections = useMemo(
    () => {
      const sections: { key: DashboardSectionKey; label: string }[] = [];

      if (summary && summaryCards.length > 0) {
        sections.push({ key: 'summary', label: t.dashboard.summaryTitle });
      }

      if (hasAnyPositions) {
        sections.push({ key: 'positions', label: t.dashboard.positionsTitle });
      }

      if (summary && openMetrics.length > 0) {
        sections.push({ key: 'visualizations', label: t.dashboard.visualizationsTitle });
      }

      return sections;
    },
    [summary, summaryCards.length, hasAnyPositions, openMetrics.length, t]
  );

  const [selectedSection, setSelectedSection] = useState<DashboardSectionKey | ''>('');

  useEffect(() => {
    if (availableSections.length === 0) {
      if (selectedSection !== '') {
        setSelectedSection('');
      }
      return;
    }

    const hasSelection = availableSections.some((section) => section.key === selectedSection);

    if (!hasSelection) {
      setSelectedSection(availableSections[0].key);
    }
  }, [availableSections, selectedSection]);

  const activeSection: DashboardSectionKey | '' = selectedSection || (availableSections[0]?.key ?? '');

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
                  <div className="space-y-8">
                    {availableSections.length > 1 && (
                      <nav aria-label="Dashboard sections">
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white/70 p-2 shadow-inner backdrop-blur">
                          {availableSections.map((section) => {
                            const isActive = section.key === activeSection;

                            return (
                              <button
                                key={section.key}
                                type="button"
                                onClick={() => setSelectedSection(section.key)}
                                className={`relative flex-1 min-w-[140px] overflow-hidden rounded-xl px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:flex-none sm:px-5 sm:py-2.5 ${
                                  isActive
                                    ? 'bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 text-white shadow-lg shadow-blue-200'
                                    : 'bg-white/60 text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                <span className="relative z-10 block whitespace-nowrap">{section.label}</span>
                                {isActive && (
                                  <span className="pointer-events-none absolute inset-0 rounded-xl border border-white/40" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </nav>
                    )}

                    {summary && summaryCards.length > 0 && activeSection === 'summary' && (
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
                    )}

                    {activeSection === 'positions' && (
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <h2 className="text-lg font-semibold text-slate-900">{t.positions.title}</h2>
                          <p className="text-sm text-slate-500 sm:max-w-xl">{t.positions.subtitle}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-inner">
                          <PositionsOverview
                            openTitle={t.dashboard.positionsTitle}
                            closedTitle={t.dashboard.closedPositionsTitle}
                            openMetrics={openMetrics}
                            closedMetrics={closedMetrics}
                            sparklineData={sparklineData}
                          />
                        </div>
                      </div>
                    )}

                    {summary && openMetrics.length > 0 && activeSection === 'visualizations' && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-900">{t.dashboard.visualizationsTitle}</h3>
                        <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-inner">
                          <PortfolioVisualizations
                            metrics={openMetrics}
                            summary={summary}
                            timeline={portfolioTimeline}
                          />
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
