'use client';

import { useMemo } from 'react';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import {
  DashboardHero,
  type DashboardHeroQuickAction,
} from '@/components/dashboard/dashboard-hero';
import {
  SummarySection,
  type SummaryCardItem,
  type SummarySectionBadge,
} from '@/components/dashboard/summary-section';
import { PositionsSection } from '@/components/dashboard/positions-section';
import { VisualizationsPanel } from '@/components/dashboard/visualizations-panel';
import { DashboardEmptyState, DashboardLoadingState } from '@/components/dashboard/states';
import {
  TrendingUp,
  RefreshCw,
  Settings,
  Plus,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  LineChart,
  CircleDollarSign,
} from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';

export default function HomePage() {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const {
    loading,
    metrics,
    summary: portfolioSummary,
    openSummary,
    sparklineData,
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

  const dailyChangeBadge: SummarySectionBadge | undefined = hasDailyChange
    ? {
        value: formatSignedCurrency(totalDailyChangeUsd, 'USD'),
        label: t.dashboard.dailyChange,
        toneClass: dailyChangeTone.badge,
        icon: dailyChangeIcon,
      }
    : undefined;

  const quickActions: DashboardHeroQuickAction[] = [
    {
      id: 'refresh',
      type: 'button',
      icon: <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />,
      label: t.common.refresh,
      variant: 'outline',
      size: 'sm',
      onClick: reload,
      disabled: loading,
      labelClassName: 'hidden sm:inline',
    },
    {
      id: 'portfolio',
      type: 'link',
      icon: <LineChart className="h-4 w-4" />,
      label: t.portfolio.quickAction,
      href: '/portfolio',
      size: 'sm',
      className: 'bg-[#1E3A8A] text-white shadow-sm hover:bg-[#1E40AF]',
    },
    {
      id: 'analysis',
      type: 'link',
      icon: <BarChart3 className="h-4 w-4" />,
      label: t.analysis.title,
      href: '/analysis',
      size: 'sm',
      className: 'bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]',
    },
    {
      id: 'realized',
      type: 'link',
      icon: <CircleDollarSign className="h-4 w-4" />,
      label: t.realized.quickAction,
      href: '/realized',
      size: 'sm',
      className: 'bg-[#0EA5E9] text-white shadow-sm hover:bg-[#0284C7]',
    },
    {
      id: 'positions',
      type: 'link',
      icon: <Plus className="h-4 w-4" />,
      label: t.positions.add,
      href: '/positions',
      size: 'sm',
      variant: 'secondary',
    },
    {
      id: 'settings',
      type: 'link',
      icon: <Settings className="h-4 w-4" />,
      label: t.settings.title,
      href: '/settings',
      size: 'sm',
      variant: 'ghost',
      className: 'text-slate-600 hover:text-slate-900',
      labelClassName: 'hidden sm:inline',
    },
  ];

  const summaryCards: SummaryCardItem[] = summary
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
            tone: getTrendTone(totalReturnUsd),
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#EEF5FF]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#E4F1FF] via-[#F8FBFF] to-[#E3EEFF]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_60%)]" />
      <div className="relative">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <DashboardHero
            leadingIcon={<TrendingUp className="h-6 w-6" />}
            title={t.app.title}
            subtitle={t.app.subtitle}
            updateLabel={t.app.updated}
            updateValue={lastUpdatedDisplay}
            rateIcon={<TrendingUp className="h-4 w-4 text-blue-500" />}
            rateLabel="1 USD ≈"
            rateValue={formatCurrency(currentRate, 'ILS', locale)}
            quickActionsTitle={t.dashboard.quickActions}
            quickActions={quickActions}
            dailyChangeBadge={dailyChangeBadge}
          />

          <main className="mt-10">
            <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-4 py-8 shadow-xl backdrop-blur-sm sm:px-8">
              <div className="pointer-events-none absolute -left-16 top-0 h-56 w-56 rounded-full bg-blue-100/50 blur-3xl" />
              <div className="relative z-10">
                {loading ? (
                  <DashboardLoadingState
                    icon={<RefreshCw className="h-5 w-5 animate-spin text-blue-400" />}
                    label={t.common.loading}
                  />
                ) : !hasAnyPositions ? (
                  <DashboardEmptyState
                    icon={<Plus className="h-6 w-6" />}
                    title={t.dashboard.noPositions}
                    description={t.positions.title}
                    action={{
                      href: '/positions',
                      label: t.positions.add,
                      icon: <Plus className="h-4 w-4" />,
                      className: 'bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]',
                    }}
                  />
                ) : (
                  <div className="space-y-10">
                    {summary && summaryCards.length > 0 && (
                      <SummarySection
                        title={t.dashboard.summaryTitle}
                        cards={summaryCards}
                        dailyChangeBadge={dailyChangeBadge}
                      />
                    )}

                    <PositionsSection
                      title={t.dashboard.positionsTitle}
                      closedTitle={t.dashboard.closedPositionsTitle}
                      openMetrics={openMetrics}
                      closedMetrics={closedMetrics}
                      sparklineData={sparklineData}
                    />

                    {summary && openMetrics.length > 0 && (
                      <VisualizationsPanel
                        title={t.dashboard.visualizationsTitle}
                        metrics={openMetrics}
                        summary={summary}
                      />
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
