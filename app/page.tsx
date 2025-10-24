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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

  const summaryAvailable = summaryCards.length > 0;
  const hasActivePositions = openMetrics.length > 0;
  const visualizationsHasData = openMetrics.length > 0 || portfolioTimeline.length > 0;
  const visualizationsVisible = Boolean(summary || visualizationsHasData);

  const sections = useMemo(
    () =>
      [
        summaryAvailable
          ? {
              value: 'summary' as const,
              label: t.dashboard.summaryTitle,
              disabled: false,
            }
          : null,
        hasAnyPositions
          ? {
              value: 'positions' as const,
              label: t.dashboard.positionsTitle,
              disabled: !hasActivePositions && closedMetrics.length === 0,
            }
          : null,
        visualizationsVisible
          ? {
              value: 'visualizations' as const,
              label: t.dashboard.visualizationsTitle,
              disabled: !visualizationsHasData,
            }
          : null,
      ].filter((section): section is { value: 'summary' | 'positions' | 'visualizations'; label: string; disabled: boolean } =>
        Boolean(section)
      ),
    [
      closedMetrics.length,
      hasActivePositions,
      hasAnyPositions,
      summaryAvailable,
      t.dashboard.positionsTitle,
      t.dashboard.summaryTitle,
      t.dashboard.visualizationsTitle,
      visualizationsHasData,
      visualizationsVisible,
    ]
  );

  const firstEnabledSection = useMemo(
    () => sections.find((section) => !section.disabled)?.value ?? sections[0]?.value ?? 'positions',
    [sections]
  );

  const defaultSection = useMemo(() => {
    if (summaryAvailable) {
      return 'summary' as const;
    }

    if (hasActivePositions) {
      return 'positions' as const;
    }

    if (visualizationsVisible) {
      const visualizationsSection = sections.find((section) => section.value === 'visualizations');
      if (visualizationsSection && !visualizationsSection.disabled) {
        return 'visualizations' as const;
      }
    }

    return firstEnabledSection;
  }, [firstEnabledSection, hasActivePositions, sections, summaryAvailable, visualizationsVisible]);

  const [activeSection, setActiveSection] = useState(defaultSection);

  useEffect(() => {
    setActiveSection((current) => {
      if (current && sections.some((section) => section.value === current && !section.disabled)) {
        return current;
      }

      return defaultSection;
    });
  }, [defaultSection, sections]);

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
                  <Tabs
                    value={activeSection}
                    onValueChange={setActiveSection}
                    defaultValue={defaultSection}
                    className="flex flex-col gap-6"
                    dir={locale === 'he' ? 'rtl' : 'ltr'}
                  >
                    <TabsList className="!grid grid-cols-1 gap-2 rounded-2xl bg-white/60 p-1 sm:!grid-cols-3">
                      {sections.map((section) => (
                        <TabsTrigger
                          key={section.value}
                          value={section.value}
                          disabled={section.disabled}
                          className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                        >
                          {section.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {summaryAvailable && (
                      <TabsContent value="summary" className="mt-0 space-y-5 focus-visible:outline-none">
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
                      </TabsContent>
                    )}

                    {hasAnyPositions && (
                      <TabsContent value="positions" className="mt-0 space-y-6 focus-visible:outline-none">
                        <PositionsOverview
                          openTitle={t.dashboard.positionsTitle}
                          closedTitle={t.dashboard.closedPositionsTitle}
                          openMetrics={openMetrics}
                          closedMetrics={closedMetrics}
                          sparklineData={sparklineData}
                        />
                        {!hasActivePositions && closedMetrics.length === 0 && (
                          <p className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
                            {t.dashboard.noPositions}
                          </p>
                        )}
                      </TabsContent>
                    )}

                    {visualizationsVisible && (
                      <TabsContent
                        value="visualizations"
                        className="mt-0 space-y-4 border-t border-slate-100 pt-6 focus-visible:outline-none"
                      >
                        <h3 className="text-lg font-semibold text-slate-900">{t.dashboard.visualizationsTitle}</h3>
                        {visualizationsHasData ? (
                          <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-inner">
                            <PortfolioVisualizations
                              metrics={openMetrics}
                              summary={summary}
                              timeline={portfolioTimeline}
                            />
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-10 text-center text-sm text-slate-500">
                            {t.dashboard.emptyChart}
                          </div>
                        )}
                      </TabsContent>
                    )}
                  </Tabs>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
