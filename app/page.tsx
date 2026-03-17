'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PositionMetrics } from '@/types';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { DashboardPageShell } from '@/components/dashboard/page-shell';
import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { DashboardEmptyState } from '@/components/dashboard/empty-state';
import { DailyChangeBadge } from '@/components/dashboard/daily-change-badge';
import {
  SummaryCard,
} from '@/components/dashboard/summary/summary-card-grid';
import { PositionsOverview } from '@/components/dashboard/positions/positions-overview';
import { PortfolioVisualizations } from '@/components/portfolio/portfolio-visualizations';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import {
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  LayoutDashboard,
  Layers,
  LineChart,
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
  type SectionKey = 'summary' | 'positions' | 'visualizations';

  const [activeSection, setActiveSection] = useState<SectionKey>('positions');
  const { locale } = useApp();
  const isRtl = locale === 'he';
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

  const pulseCopy = locale === 'he'
    ? {
        title: 'דופק שוק',
        subtitle: 'תצוגה קלה שמציגה את מה שחשוב עכשיו בלי עומס ויזואלי.',
        tracked: 'פעילות',
        gainers: 'עולות',
        laggards: 'יורדות',
        neutral: 'ללא שינוי',
        strongestMove: 'התנועה החזקה',
        sectionNav: 'ניווט סקשנים',
        sectionNavHint: 'קפוץ לחלק הרלוונטי כרגע.',
        available: 'זמין',
        locked: 'לא זמין',
      }
    : {
        title: 'Market pulse',
        subtitle: 'A light snapshot of what matters right now, without visual clutter.',
        tracked: 'Tracked',
        gainers: 'Gainers',
        laggards: 'Decliners',
        neutral: 'Flat',
        strongestMove: 'Strongest move',
        sectionNav: 'Section navigation',
        sectionNavHint: 'Jump straight to the section you need.',
        available: 'Ready',
        locked: 'Locked',
      };

  const movementSnapshot = useMemo(() => {
    const signalMetrics = openMetrics.filter(
      (metric) => typeof metric.dailyChange === 'number' && Number.isFinite(metric.dailyChange)
    );

    const gainers = signalMetrics.filter((metric) => (metric.dailyChange ?? 0) > 0);
    const laggards = signalMetrics.filter((metric) => (metric.dailyChange ?? 0) < 0);
    const neutralCount = Math.max(openMetrics.length - signalMetrics.length, 0);

    const topMover = signalMetrics.slice().sort((a, b) => {
      const aMove = Math.abs((a.dailyChange ?? 0) * a.position.quantity);
      const bMove = Math.abs((b.dailyChange ?? 0) * b.position.quantity);
      return bMove - aMove;
    })[0];

    const topMoveUsd = topMover ? (topMover.dailyChange ?? 0) * topMover.position.quantity : 0;

    return {
      gainers: gainers.length,
      laggards: laggards.length,
      neutralCount,
      topMover,
      topMoveUsd,
      topMoveTone: getTrendTone(topMoveUsd),
      topMoveIcon: topMoveUsd >= 0 ? ArrowUpRight : ArrowDownRight,
    };
  }, [openMetrics]);

  const TopMoveIcon = movementSnapshot.topMoveIcon;
  const cardSurfaceClass =
    'rounded-[24px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)] shadow-sm';
  const sectionSurfaceClass =
    'rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)] shadow-sm';

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
          valueClass: `text-3xl font-semibold ${getTrendTone(summary.totalCurrentPnLUsd).text}`,
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
          valueClass: `text-3xl font-semibold ${getTrendTone(summary.totalProjectedPnLUsd).text}`,
          secondary: {
            label: 'ILS',
            value: formatSignedCurrency(summary.totalProjectedPnLIls, 'ILS', locale),
          },
        },
        {
          key: 'combined',
          label: t.dashboard.combinedPnL,
          value: formatSignedCurrency(summary.totalCombinedUsd, 'USD', locale),
          valueClass: `text-3xl font-semibold ${getTrendTone(summary.totalCombinedUsd).text}`,
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
  const availableSectionTabs = sectionTabs.filter((tab) => tab.available);
  const shouldShowMobileSectionNav = availableSectionTabs.length > 1;

  useEffect(() => {
    if (sectionTabs.some((tab) => tab.key === activeSection && tab.available)) {
      return;
    }

    const firstAvailableSection = availableSectionTabs[0]?.key;
    if (firstAvailableSection) {
      setActiveSection(firstAvailableSection);
    }
  }, [activeSection, availableSectionTabs, sectionTabs]);

  const renderSectionPlaceholder = (message: string) => (
    <div className={`${sectionSurfaceClass} border-dashed px-6 py-10 text-center text-sm leading-6 text-slate-500`}>
      {message}
    </div>
  );

  const renderSummaryCards = () => (
    <div className="mt-6 grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
      {summaryCards.map((card) => {
        const valueClass = card.valueClass ?? 'text-3xl font-semibold text-slate-900';
        const hasDetails = Boolean(card.secondary || card.helper?.length || card.footnote);

        return (
          <article
            key={card.key}
            className="home-summary-card group relative overflow-hidden rounded-3xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
          >
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent" />
            <div className="relative z-10 space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-sm font-semibold tracking-wide text-slate-600 break-words">
                  {card.label}
                </p>
                {card.badge && (
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${card.badge.className}`}>
                    {card.badge.icon}
                    <span className="min-w-0 break-words text-center">{card.badge.value}</span>
                  </span>
                )}
              </div>
              <p className={`${valueClass} leading-none tracking-tight break-words`}>{card.value}</p>

              {hasDetails && (
                <div className="space-y-2 rounded-2xl border border-sky-100/80 bg-white/75 px-4 py-3">
                  {card.secondary && (
                    <div className="flex flex-col gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium text-slate-500">{card.secondary.label}:</span>
                      <span className="min-w-0 break-words font-semibold text-slate-700">
                        {card.secondary.value}
                      </span>
                    </div>
                  )}
                  {card.helper?.map((helper) => (
                    <div
                      key={`${card.key}-${helper.label}`}
                      className="flex flex-col gap-1.5 rounded-xl bg-white/60 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0 break-words text-slate-500">{helper.label}:</span>
                      <span className="min-w-0 break-words font-semibold text-slate-700">
                        {helper.value}
                      </span>
                    </div>
                  ))}
                  {card.footnote && (
                    <p className="border-t border-sky-100/70 pt-2 text-xs font-medium leading-5 text-slate-500 break-words">
                      {card.footnote}
                    </p>
                  )}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );

  const renderSummarySection = () =>
    summary && summaryCards.length > 0 ? (
      <section className={`${sectionSurfaceClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="section-kicker">
              {t.dashboard.sectionSummaryLabel}
            </p>
            <h2 className="page-title text-2xl font-semibold sm:text-[1.65rem]">
              {t.dashboard.summaryTitle}
            </h2>
            <p className="page-subtitle max-w-2xl text-sm">
              {locale === 'he'
                ? 'תמונת מצב מרוכזת של ערך התיק, רווחיות, והפער מול התחזית.'
                : 'A compact read on portfolio value, profitability, and forecast gap.'}
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
        {renderSummaryCards()}
      </section>
    ) : (
      renderSectionPlaceholder(t.dashboard.sectionSummaryEmpty)
    );

  const renderPositionsSection = () =>
    hasAnyPositions ? (
      <section className={`${sectionSurfaceClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="section-kicker">
              {t.dashboard.sectionPositionsLabel}
            </p>
            <h2 className="page-title text-2xl font-semibold sm:text-[1.65rem]">
              {t.dashboard.positionsTitle}
            </h2>
            <p className="page-subtitle max-w-2xl text-sm">
              {t.dashboard.positionsSortedByForecast}
            </p>
          </div>
        </div>
        <div className="mt-5">
          <PositionsOverview
            openTitle={t.dashboard.positionsTitle}
            closedTitle={t.dashboard.closedPositionsTitle}
            openMetrics={openMetrics}
            closedMetrics={closedMetrics}
            sparklineData={sparklineData}
          />
        </div>
      </section>
    ) : (
      renderSectionPlaceholder(t.dashboard.sectionPositionsEmpty)
    );

  const renderVisualizationsSection = () =>
    summary && openMetrics.length > 0 ? (
      <section className={`${sectionSurfaceClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="section-kicker">
              {t.dashboard.sectionVisualizationsLabel}
            </p>
            <h3 className="page-title text-2xl font-semibold sm:text-[1.65rem]">
              {t.dashboard.visualizationsTitle}
            </h3>
            <p className="page-subtitle max-w-2xl text-sm">
              {locale === 'he'
                ? 'גרפים שמבהירים הרכב, תשואה, והפרדה בין כיוון לבין רעש.'
                : 'Charts that clarify allocation, return, and direction versus noise.'}
            </p>
          </div>
        </div>
        <div className="mt-5 rounded-[24px] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/70 p-4 sm:p-5">
          <PortfolioVisualizations metrics={openMetrics} summary={summary} />
        </div>
      </section>
    ) : (
      renderSectionPlaceholder(t.dashboard.sectionVisualizationsEmpty)
    );

  return (
    <DashboardPageShell direction={isRtl ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
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

        <main className="mt-8">
          <section className="space-y-6">
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
                  <section className={`${sectionSurfaceClass} p-5 sm:p-6`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <p className="section-kicker">{pulseCopy.title}</p>
                        <h2 className="page-title text-2xl font-semibold sm:text-[1.65rem]">
                          {t.dashboard.summaryTitle}
                        </h2>
                        <p className="page-subtitle max-w-2xl text-sm">
                          {pulseCopy.subtitle}
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

                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className={cardSurfaceClass + ' p-4'}>
                        <p className="section-kicker">{pulseCopy.tracked}</p>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-2xl font-semibold tracking-tight text-slate-900">
                              {openMetrics.length}
                            </p>
                            <p className="text-xs leading-5 text-slate-500">
                              {pulseCopy.neutral}{movementSnapshot.neutralCount > 0 ? ` (${movementSnapshot.neutralCount})` : ''}
                            </p>
                          </div>
                          <LayoutDashboard className="h-5 w-5 text-blue-500" />
                        </div>
                      </div>

                      <div className={cardSurfaceClass + ' p-4'}>
                        <p className="section-kicker">{pulseCopy.gainers}</p>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-2xl font-semibold tracking-tight text-emerald-600">
                              {movementSnapshot.gainers}
                            </p>
                            <p className="text-xs leading-5 text-slate-500">
                              {locale === 'he' ? 'תנועות יומיות חיוביות' : 'Positive daily signals'}
                            </p>
                          </div>
                          <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                        </div>
                      </div>

                      <div className={cardSurfaceClass + ' p-4'}>
                        <p className="section-kicker">{pulseCopy.laggards}</p>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-2xl font-semibold tracking-tight text-rose-600">
                              {movementSnapshot.laggards}
                            </p>
                            <p className="text-xs leading-5 text-slate-500">
                              {locale === 'he' ? 'תנועות יומיות שליליות' : 'Negative daily signals'}
                            </p>
                          </div>
                          <ArrowDownRight className="h-5 w-5 text-rose-500" />
                        </div>
                      </div>

                      <div className={cardSurfaceClass + ' p-4'}>
                        <p className="section-kicker">{pulseCopy.strongestMove}</p>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <p className="truncate text-lg font-semibold tracking-tight text-slate-900">
                              {movementSnapshot.topMover?.position.display || movementSnapshot.topMover?.position.symbol || '—'}
                            </p>
                            <p className="text-xs leading-5 text-slate-500">
                              {formatSignedCurrency(movementSnapshot.topMoveUsd, 'USD', locale)}
                            </p>
                          </div>
                          <TopMoveIcon className={`h-5 w-5 ${movementSnapshot.topMoveTone.text}`} />
                        </div>
                      </div>
                    </div>

                    {shouldShowMobileSectionNav && (
                    <div className="mt-5 flex flex-col gap-3 border-t border-[color:var(--color-slate-200)]/70 pt-5 sm:hidden">
                      <div>
                        <p className="section-kicker">{pulseCopy.sectionNav}</p>
                        <p className="page-subtitle text-sm">{pulseCopy.sectionNavHint}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sectionTabs.map(({ key, label, available }) => {
                          const isActive = activeSection === key;

                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => available && setActiveSection(key)}
                              disabled={!available}
                              className={`app-chip max-w-full items-start text-left text-sm font-medium transition-colors ${
                                isActive ? 'app-chip-active text-slate-900' : 'app-chip-muted text-slate-600 hover:border-[color:var(--color-blue-200)] hover:text-slate-900'
                              } ${available ? '' : 'cursor-not-allowed opacity-60'}`}
                            >
                              <span className="min-w-0 break-words leading-5">{label}</span>
                              <span className="rounded-full border border-current/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]">
                                {available ? pulseCopy.available : pulseCopy.locked}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    )}
                  </section>

                  <div className="space-y-6 sm:hidden">
                    {activeSection === 'summary' && renderSummarySection()}
                    {activeSection === 'positions' && renderPositionsSection()}
                    {activeSection === 'visualizations' && renderVisualizationsSection()}
                  </div>

                  <div className="hidden space-y-6 sm:block">
                    {renderSummarySection()}
                    {renderPositionsSection()}
                    {renderVisualizationsSection()}
                  </div>
                </div>
              )}
          </section>
        </main>
      </div>
    </DashboardPageShell>
  );
}
