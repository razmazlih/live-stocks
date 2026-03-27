'use client';

import { useCallback, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Layers,
  LayoutDashboard,
  LineChart,
  RefreshCw,
} from 'lucide-react';

import type { PositionMetrics } from '@/types';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { DashboardPageShell } from '@/components/dashboard/page-shell';
import { DashboardEmptyState } from '@/components/dashboard/empty-state';
import { DailyChangeBadge } from '@/components/dashboard/daily-change-badge';
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { PositionsOverview } from '@/components/dashboard/positions/positions-overview';
import { PortfolioVisualizations } from '@/components/portfolio/portfolio-visualizations';
import { formatCurrency } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import {
  formatLastUpdatedTime,
  formatSignedCurrency,
  formatSignedPercent,
  getTrendIcon,
  getTrendTone,
} from '@/lib/utils/portfolio-display';

type SectionKey = 'pulse' | 'positions' | 'visualizations';

interface SummaryTile {
  key: string;
  label: string;
  value: string;
  valueClassName: string;
  icon: LucideIcon;
  accentClassName: string;
  secondary?: {
    label: string;
    value: string;
  };
  helper?: {
    label: string;
    value: string;
  };
  badge?: {
    value: string;
    className: string;
    icon: React.ReactNode;
  };
  footnote?: string;
}

export default function HomePage() {
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

  const homeCopy = locale === 'he'
    ? {
        heroKicker: 'מרכז השליטה היומי',
        heroSubtitle:
          'תמונה נקייה של מצב התיק: מה זז עכשיו, איפה הפערים מול התחזית, ואילו פעולות כדאי לבצע מיד.',
        actionsDescription: 'פעולות ממוקדות למסך הזה בלבד, ללא כפילויות מהניווט הראשי.',
        pulseTitle: 'דופק שוק',
        pulseSubtitle:
          'קריאה מהירה של עומק התנועה היומית, מאזן עליות/ירידות והמניה שמובילה את המהלך.',
        pulseTrackedHint: 'פוזיציות פתוחות במעקב',
        pulseGainersHint: 'תנועות יומיות חיוביות',
        pulseDeclinersHint: 'תנועות יומיות שליליות',
        pulseTopHint: 'השפעה יומית ב-USD',
        pulseEmpty: 'אין מספיק נתונים פתוחים כדי להציג דופק שוק כרגע.',
        sectionNav: 'ניווט חכם',
        sectionNavHint: 'לחיצה מהירה לחלק הכי רלוונטי כרגע.',
        available: 'זמין',
        locked: 'סגור',
        summaryTitle: 'תמונת ביצועים',
        summarySubtitle: 'ערך, רווחיות נוכחית, תחזית ורווח משולב במקום אחד.',
        summaryEmpty: 'נתוני הסיכום יופיעו כאן לאחר טעינת התיק.',
        visualSubtitle: 'התפלגות, רווחיות והשוואת מגמות לפי הנתונים הפתוחים.',
      }
    : {
        heroKicker: 'Daily Command Center',
        heroSubtitle:
          'A clean portfolio read on what is moving now, where forecast gaps sit, and which actions to take next.',
        actionsDescription: 'Only screen-specific actions are shown here, without duplicating navbar links.',
        pulseTitle: 'Market pulse',
        pulseSubtitle:
          'A fast read on daily breadth, gainers-versus-decliners balance, and the position driving today’s move.',
        pulseTrackedHint: 'Open positions tracked',
        pulseGainersHint: 'Positive daily signals',
        pulseDeclinersHint: 'Negative daily signals',
        pulseTopHint: 'Daily impact in USD',
        pulseEmpty: 'Not enough open data to render a market pulse yet.',
        sectionNav: 'Smart navigation',
        sectionNavHint: 'Jump directly to the section that matters now.',
        available: 'Ready',
        locked: 'Locked',
        summaryTitle: 'Performance snapshot',
        summarySubtitle: 'Value, current profitability, projections, and combined PnL in one view.',
        summaryEmpty: 'Summary metrics will appear here after portfolio data loads.',
        visualSubtitle: 'Allocation, profitability, and trend comparisons from active positions.',
      };

  const lastUpdatedDisplay = formatLastUpdatedTime(lastUpdate, locale);

  const summary = openSummary ?? portfolioSummary;
  const currentRate = summary?.usdToIlsRate ?? usdToIls;
  const totalValueIls = summary ? summary.totalValue * summary.usdToIlsRate : 0;
  const totalReturnUsd = summary ? summary.totalValue - summary.totalCost : 0;
  const totalReturnPercent = summary && summary.totalCost !== 0 ? (totalReturnUsd / summary.totalCost) * 100 : 0;

  const hasDailyChange = metrics.some((metric) => typeof metric.dailyChange === 'number');
  const totalDailyChangeUsd = metrics.reduce(
    (acc, metric) => acc + (metric.dailyChange ?? 0) * metric.position.quantity,
    0
  );
  const dailyChangeTone = getTrendTone(totalDailyChangeUsd);
  const dailyChangeIcon = getTrendIcon(totalDailyChangeUsd);

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
        include: ['reload', 'portfolio', 'insights', 'watchlist', 'positions'],
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

  const movementSnapshot = useMemo(() => {
    const signalMetrics = openMetrics.filter(
      (metric) => typeof metric.dailyChange === 'number' && Number.isFinite(metric.dailyChange)
    );

    const gainers = signalMetrics.filter((metric) => (metric.dailyChange ?? 0) > 0);
    const decliners = signalMetrics.filter((metric) => (metric.dailyChange ?? 0) < 0);

    const topMover = signalMetrics.slice().sort((a, b) => {
      const aMove = Math.abs((a.dailyChange ?? 0) * a.position.quantity);
      const bMove = Math.abs((b.dailyChange ?? 0) * b.position.quantity);
      return bMove - aMove;
    })[0];

    const topMoveUsd = topMover ? (topMover.dailyChange ?? 0) * topMover.position.quantity : 0;

    return {
      tracked: openMetrics.length,
      gainers: gainers.length,
      decliners: decliners.length,
      topMover,
      topMoveUsd,
      topMoveTone: getTrendTone(topMoveUsd),
      topMoveIcon: topMoveUsd >= 0 ? ArrowUpRight : ArrowDownRight,
    };
  }, [openMetrics]);

  const summaryTiles: SummaryTile[] = summary
    ? [
        {
          key: 'value',
          label: t.dashboard.totalValue,
          value: formatCurrency(summary.totalValue, 'USD', locale),
          valueClassName: 'text-slate-900',
          icon: LayoutDashboard,
          accentClassName: 'from-sky-50 to-blue-50/60 border-blue-100',
          secondary: {
            label: 'ILS',
            value: formatCurrency(totalValueIls, 'ILS', locale),
          },
          helper: {
            label: t.dashboard.totalCost,
            value: formatCurrency(summary.totalCost, 'USD', locale),
          },
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
          valueClassName: getTrendTone(summary.totalCurrentPnLUsd).text,
          icon: ArrowUpRight,
          accentClassName: 'from-emerald-50 to-slate-50 border-emerald-100',
          secondary: {
            label: t.portfolio.ilsCurrentLabel,
            value: formatSignedCurrency(summary.totalCurrentPnLIls, 'ILS', locale),
          },
          helper: {
            label: t.portfolio.ilsHistoricalAdjustedLabel,
            value: formatSignedCurrency(historicalIlsNetPnL, 'ILS', locale),
          },
        },
        {
          key: 'projected',
          label: t.dashboard.projectedPnL,
          value: formatSignedCurrency(summary.totalProjectedPnLUsd, 'USD', locale),
          valueClassName: getTrendTone(summary.totalProjectedPnLUsd).text,
          icon: LineChart,
          accentClassName: 'from-indigo-50 to-blue-50/55 border-blue-100',
          secondary: {
            label: t.portfolio.ilsCurrentLabel,
            value: formatSignedCurrency(summary.totalProjectedPnLIls, 'ILS', locale),
          },
        },
        {
          key: 'combined',
          label: t.dashboard.combinedPnL,
          value: formatSignedCurrency(summary.totalCombinedUsd, 'USD', locale),
          valueClassName: getTrendTone(summary.totalCombinedUsd).text,
          icon: Layers,
          accentClassName: 'from-amber-50 to-rose-50/55 border-amber-200',
          secondary: {
            label: t.portfolio.ilsCurrentLabel,
            value: formatSignedCurrency(summary.totalCombinedIls, 'ILS', locale),
          },
          helper: {
            label: t.portfolio.ilsHistoricalAdjustedLabel,
            value: formatSignedCurrency(historicalIlsRealizedPnL, 'ILS', locale),
          },
        },
      ]
    : [];

  const sectionTabs = [
    {
      key: 'pulse' as const,
      label: homeCopy.pulseTitle,
      description: homeCopy.pulseSubtitle,
      icon: LayoutDashboard,
      available: openMetrics.length > 0,
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
  const resolvedActiveSection = sectionTabs.some((tab) => tab.key === activeSection && tab.available)
    ? activeSection
    : availableSectionTabs[0]?.key ?? 'positions';

  const shouldShowMobileSectionNav = availableSectionTabs.length > 1;

  const sectionAnchors: Record<SectionKey, string> = {
    pulse: 'dashboard-section-pulse',
    positions: 'dashboard-section-positions',
    visualizations: 'dashboard-section-visualizations',
  };

  const renderSectionPlaceholder = (message: string) => (
    <div className="page-surface rounded-[1.8rem] border-dashed px-5 py-10 text-center text-sm leading-6 text-slate-500 sm:px-6 sm:py-12">
      {message}
    </div>
  );

  const renderPulseSection = () => {
    if (!openMetrics.length) {
      return renderSectionPlaceholder(homeCopy.pulseEmpty);
    }

    const TopMoveIcon = movementSnapshot.topMoveIcon;

    return (
      <section
        id={sectionAnchors.pulse}
        className="page-surface relative overflow-hidden rounded-[2rem] p-5 sm:p-6 lg:p-7"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-sky-100/65 to-transparent" />
        <div className="relative z-10 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="section-kicker">{homeCopy.pulseTitle}</p>
              <h2 className="page-title text-2xl font-semibold sm:text-[1.65rem]">{homeCopy.pulseTitle}</h2>
              <p className="page-subtitle text-sm">{homeCopy.pulseSubtitle}</p>
            </div>
            {dailyChangeData ? (
              <div className="rounded-2xl border border-[color:var(--color-slate-200)]/80 bg-white/80 p-2 shadow-sm backdrop-blur-sm">
                <DailyChangeBadge
                  toneClass={dailyChangeData.toneClass}
                  icon={dailyChangeData.icon}
                  value={dailyChangeData.value}
                  label={dailyChangeData.label}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <article className="card-surface rounded-[1.4rem] border p-4 sm:p-5">
              <p className="section-kicker">{locale === 'he' ? 'במעקב' : 'Tracked'}</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[clamp(1.4rem,3vw,1.85rem)] font-semibold tracking-tight text-slate-900">
                    {movementSnapshot.tracked}
                  </p>
                  <p className="text-xs text-slate-500">{homeCopy.pulseTrackedHint}</p>
                </div>
                <LayoutDashboard className="h-5 w-5 text-blue-600" />
              </div>
            </article>

            <article className="card-surface rounded-[1.4rem] border p-4 sm:p-5">
              <p className="section-kicker">{locale === 'he' ? 'עולות' : 'Gainers'}</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[clamp(1.4rem,3vw,1.85rem)] font-semibold tracking-tight text-emerald-600">
                    {movementSnapshot.gainers}
                  </p>
                  <p className="text-xs text-slate-500">{homeCopy.pulseGainersHint}</p>
                </div>
                <ArrowUpRight className="h-5 w-5 text-emerald-500" />
              </div>
            </article>

            <article className="card-surface rounded-[1.4rem] border p-4 sm:p-5">
              <p className="section-kicker">{locale === 'he' ? 'יורדות' : 'Decliners'}</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[clamp(1.4rem,3vw,1.85rem)] font-semibold tracking-tight text-rose-600">
                    {movementSnapshot.decliners}
                  </p>
                  <p className="text-xs text-slate-500">{homeCopy.pulseDeclinersHint}</p>
                </div>
                <ArrowDownRight className="h-5 w-5 text-rose-500" />
              </div>
            </article>

            <article className="card-surface rounded-[1.4rem] border p-4 sm:p-5">
              <p className="section-kicker">{locale === 'he' ? 'תנועה חזקה' : 'Strongest move'}</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                    {movementSnapshot.topMover?.position.display || movementSnapshot.topMover?.position.symbol || '—'}
                  </p>
                  <p className="text-xs text-slate-500">{homeCopy.pulseTopHint}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-700">
                    {formatSignedCurrency(movementSnapshot.topMoveUsd, 'USD', locale)}
                  </p>
                </div>
                <TopMoveIcon className={`h-5 w-5 ${movementSnapshot.topMoveTone.text}`} />
              </div>
            </article>
          </div>
        </div>
      </section>
    );
  };

  const renderPositionsSection = () =>
    hasAnyPositions ? (
      <section
        id={sectionAnchors.positions}
        className="page-surface relative overflow-hidden rounded-[2rem] p-5 sm:p-6 lg:p-7"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="section-kicker">{t.dashboard.sectionPositionsLabel}</p>
            <h2 className="page-title text-2xl font-semibold sm:text-[1.65rem]">{t.dashboard.positionsTitle}</h2>
            <p className="page-subtitle text-sm">{t.dashboard.positionsSortedByForecast}</p>
          </div>
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
      <section
        id={sectionAnchors.visualizations}
        className="page-surface relative overflow-hidden rounded-[2rem] p-5 sm:p-6 lg:p-7"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="section-kicker">{t.dashboard.sectionVisualizationsLabel}</p>
            <h2 className="page-title text-2xl font-semibold sm:text-[1.65rem]">{t.dashboard.visualizationsTitle}</h2>
            <p className="page-subtitle text-sm">{homeCopy.visualSubtitle}</p>
          </div>
          <div className="rounded-[1.5rem] border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-slate-50)]/70 p-4 sm:p-5 lg:p-6">
            <PortfolioVisualizations metrics={openMetrics} summary={summary} />
          </div>
        </div>
      </section>
    ) : (
      renderSectionPlaceholder(t.dashboard.sectionVisualizationsEmpty)
    );

  const renderSectionNavigation = () =>
    shouldShowMobileSectionNav ? (
      <section className="nav-shell rounded-[1.8rem] p-4 sm:p-5 lg:p-6" aria-label={homeCopy.sectionNav}>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="section-kicker">{homeCopy.sectionNav}</p>
            <p className="page-subtitle max-w-2xl text-sm">{homeCopy.sectionNavHint}</p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {locale === 'he' ? 'בחירה לפי זמינות נתונים' : 'Section availability aware'}
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sectionTabs.map(({ key, label, description, icon: Icon, available }) => {
            const isActive = resolvedActiveSection === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => available && setActiveSection(key)}
                disabled={!available}
                aria-pressed={isActive}
                className={`group flex h-full min-h-36 min-w-0 flex-col rounded-[1.4rem] border p-4 text-left transition-all duration-200 sm:min-h-40 sm:p-5 ${
                  isActive
                    ? 'border-blue-300 bg-blue-50/80 shadow-md'
                    : 'border-[color:var(--color-slate-200)]/85 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm'
                } ${available ? '' : 'cursor-not-allowed opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${
                      isActive
                        ? 'border-blue-200 bg-blue-100 text-blue-700'
                        : 'border-[color:var(--color-slate-200)]/80 bg-slate-50 text-slate-500'
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                      available
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-100 text-slate-500'
                    }`}
                  >
                    {available ? homeCopy.available : homeCopy.locked}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5">
                  <p className="text-base font-semibold text-slate-900">{label}</p>
                  <p className="text-sm leading-6 text-slate-500">{description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    ) : null;

  return (
    <DashboardPageShell direction={isRtl ? 'rtl' : 'ltr'} className="home-dashboard">
      <div className="page-container">
        <div className="page-stack">
          <header className="page-header home-hero relative isolate overflow-hidden px-5 py-6 sm:px-7 sm:py-8 lg:px-8">
            <div className="floating-orb floating-orb-blue -left-8 top-0 h-40 w-40" aria-hidden="true" />
            <div className="floating-orb floating-orb-emerald -right-10 top-8 h-44 w-44" aria-hidden="true" />
            <div className="relative z-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,34rem)] xl:items-start">
              <div className="space-y-4 sm:space-y-5">
                <span className="status-chip w-fit">{homeCopy.heroKicker}</span>
                <div className="space-y-2.5">
                  <h1 className="page-title text-[clamp(2rem,5vw,3.2rem)] font-black leading-[1.02] tracking-tight">
                    {t.app.title}
                  </h1>
                  <p className="page-subtitle text-sm sm:text-base">{homeCopy.heroSubtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="stat-chip">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                    <span>
                      {t.app.updated} {lastUpdatedDisplay ?? '—'}
                    </span>
                  </span>
                  <span className="stat-chip">
                    <LineChart className="h-3.5 w-3.5 text-blue-600" />
                    <span>1 USD ≈ {formatCurrency(currentRate, 'ILS', locale)}</span>
                  </span>
                  {dailyChangeData ? (
                    <DailyChangeBadge
                      toneClass={dailyChangeData.toneClass}
                      icon={dailyChangeData.icon}
                      value={dailyChangeData.value}
                      label={dailyChangeData.label}
                    />
                  ) : null}
                </div>
              </div>

              <QuickActionsSection
                title={t.dashboard.quickActions}
                description={homeCopy.actionsDescription}
                actions={quickActions}
                className="w-full max-w-full xl:justify-self-end"
              />
            </div>
          </header>

          {loading ? (
            <section className="page-surface rounded-[1.8rem] px-5 py-14 sm:px-6 sm:py-16">
              <div className="flex flex-col items-center justify-center gap-3 text-slate-500">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
                <p>{t.common.loading}</p>
              </div>
            </section>
          ) : !hasAnyPositions ? (
            <section className="page-surface rounded-[1.8rem] px-5 py-8 sm:px-6 sm:py-10">
              <DashboardEmptyState
                title={t.dashboard.noPositions}
                description={t.positions.title}
                actionLabel={t.positions.add}
                actionHref="/positions"
              />
            </section>
          ) : (
            <>
              <section
                id="dashboard-section-summary"
                className="page-surface relative overflow-hidden rounded-[2rem] p-5 sm:p-6 lg:p-7 animate-soft-rise"
                style={{ animationDelay: '40ms' }}
              >
                <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-blue-200/40 to-transparent blur-3xl" />
                <div className="relative z-10 space-y-5">
                  <div className="space-y-2">
                    <p className="section-kicker">{t.dashboard.sectionSummaryLabel}</p>
                    <h2 className="page-title text-2xl font-semibold sm:text-[1.65rem]">{homeCopy.summaryTitle}</h2>
                    <p className="page-subtitle text-sm">{homeCopy.summarySubtitle}</p>
                  </div>

                  {summaryTiles.length ? (
                    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                      {summaryTiles.map((tile) => {
                        const Icon = tile.icon;

                        return (
                          <article
                            key={tile.key}
                            className={`relative overflow-hidden rounded-[1.5rem] border bg-gradient-to-br p-4 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${tile.accentClassName}`}
                          >
                            <div className="space-y-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <p className="text-sm font-semibold text-slate-600">{tile.label}</p>
                                  <p className={`text-[clamp(1.35rem,3vw,1.9rem)] font-semibold leading-none tracking-tight ${tile.valueClassName}`}>
                                    {tile.value}
                                  </p>
                                </div>
                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/90 bg-white/80 text-slate-700 shadow-sm">
                                  <Icon className="h-5 w-5" />
                                </span>
                              </div>

                              {tile.badge ? (
                                <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm ${tile.badge.className}`}>
                                  {tile.badge.icon}
                                  <span>{tile.badge.value}</span>
                                </span>
                              ) : null}

                              <div className="space-y-1.5 rounded-xl border border-white/80 bg-white/70 px-3 py-2.5 text-xs sm:text-sm">
                                {tile.secondary ? (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-500">{tile.secondary.label}</span>
                                    <span className="font-semibold text-slate-700">{tile.secondary.value}</span>
                                  </div>
                                ) : null}
                                {tile.helper ? (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-slate-500">{tile.helper.label}</span>
                                    <span className="font-semibold text-slate-700">{tile.helper.value}</span>
                                  </div>
                                ) : null}
                                {tile.footnote ? (
                                  <p className="border-t border-white/80 pt-1.5 text-xs text-slate-500">{tile.footnote}</p>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-white/70 px-5 py-8 text-sm text-slate-500">
                      {homeCopy.summaryEmpty}
                    </div>
                  )}
                </div>
              </section>

              {renderSectionNavigation()}

              <div className="space-y-6 sm:hidden">
                {resolvedActiveSection === 'pulse' && renderPulseSection()}
                {resolvedActiveSection === 'positions' && renderPositionsSection()}
                {resolvedActiveSection === 'visualizations' && renderVisualizationsSection()}
              </div>

              <div className="hidden space-y-6 sm:block">
                {renderPulseSection()}
                {renderPositionsSection()}
                {renderVisualizationsSection()}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardPageShell>
  );
}
