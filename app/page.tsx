'use client';

import { useCallback, useMemo } from 'react';
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
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { LayoutDashboard, LineChart } from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { useReturnContext } from '@/hooks/use-return-context';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatLastUpdatedTime,
  formatSignedCurrency,
  formatSignedPercent,
  getTrendIcon,
  getTrendTone,
} from '@/lib/utils/portfolio-display';

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
    usdToIls,
    lastUpdate,
    reload,
  } = usePortfolioData();

  useReturnContext(!loading);

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
          ],
          badge: {
            value: formatSignedPercent(totalReturnPercent, locale),
            className: getTrendTone(totalReturnUsd).badge,
            icon: getTrendIcon(totalReturnUsd),
          },
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
        },
      ]
    : [];

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
              className="self-start tabular-nums"
            />
          )}
        </div>
        <SummaryCardGrid cards={summaryCards} locale={locale} />
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

  return (
    <DashboardRouteShell activeKey="dashboard" locale={locale}>
      <DashboardContainer width="full" className="space-y-5">
        <PageHeader
          title={t.app.title}
          subtitle={locale === 'he' ? 'ההחזקות שלך, השווי והשינוי היומי.' : 'Your holdings, their value and today’s change.'}
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
              label: `1 USD ≈ ${formatCurrency(currentRate, 'ILS', locale)}`,
            },
          ]}
        />

        {loading ? (
          <section aria-busy="true" aria-label={t.common.loading} className="space-y-5">
            <Skeleton className="h-48 rounded-2xl" />
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-48 rounded-2xl" />)}
            </div>
          </section>
        ) : !hasAnyPositions ? (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <DashboardEmptyState
              title={t.dashboard.noPositions}
              description={t.positions.title}
            />
          </section>
        ) : (
          <div className="space-y-5">
            <section aria-label={t.dashboard.summaryTitle}>
              {renderSummarySection()}
            </section>
            <div className="flex justify-end">
              <Link
                href="/portfolio"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                <LineChart aria-hidden="true" className="h-4 w-4" />
                {locale === 'he' ? 'ביצועים וגרפים' : 'Performance and charts'}
              </Link>
            </div>
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              {renderPositionsSection()}
            </section>
          </div>
        )}
      </DashboardContainer>
    </DashboardRouteShell>
  );
}
