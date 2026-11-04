'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { ChevronDown, LineChart } from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { getPerformanceTotals, parsePerformanceOptions } from '@/lib/performance-display';
import { formatCurrency } from '@/lib/calculations';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { useReturnContext } from '@/hooks/use-return-context';
import { useUrlState } from '@/hooks/use-url-state';
import { PerformanceChart } from '@/components/charts/performance-chart';
import { ResearchExportButton } from '@/components/portfolio/research-export-button';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { PageHeader } from '@/components/dashboard/page-header';
import { DashboardContainer, DashboardMain, DashboardSurface } from '@/components/dashboard/page-primitives';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatLastUpdatedTime, formatSignedCurrency, getTrendTone } from '@/lib/utils/portfolio-display';

const TargetsPanel = dynamic(() => import('@/components/portfolio/targets-panel').then((module) => module.TargetsPanel));
const RealizedPanel = dynamic(() => import('@/components/portfolio/realized-panel').then((module) => module.RealizedPanel));
const PortfolioVisualizations = dynamic(() => import('@/components/portfolio/portfolio-visualizations').then((module) => module.PortfolioVisualizations));
const VIEWS = ['history', 'targets', 'realized'] as const;
function parsePerformanceView(params: URLSearchParams) {
  const view = params.get('view');
  return VIEWS.includes(view as typeof VIEWS[number]) ? view as typeof VIEWS[number] : 'history';
}

export default function PortfolioPage() {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const { loading, refreshing, positions, metrics, summary, openSummary, portfolioTimeline, historicalIlsNetPnL, historicalIlsRealizedPnL, lastUpdate, reload } = usePortfolioData();
  const [view, patchUrl] = useUrlState(parsePerformanceView);
  useReturnContext(!loading);
  const isHebrew = locale === 'he';
  const openMetrics = useMemo(() => metrics.filter((metric) => metric.position.quantity > 0), [metrics]);
  const quickActions = useMemo(() => createCommonQuickActions(t, { overrides: { reload: { onClick: reload, disabled: loading || refreshing, iconClassName: loading || refreshing ? 'animate-spin' : undefined } } }), [t, reload, loading, refreshing]);
  const currency = settings.currency;
  const [performanceOptions] = useUrlState(parsePerformanceOptions);
  const totals = summary ? getPerformanceTotals(summary, currency, performanceOptions) : null;
  const actual = totals?.actual;
  const target = totals?.target;
  const gap = actual !== undefined && target !== undefined ? actual - target : undefined;
  const money = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? formatSignedCurrency(value, currency, locale) : '—';

  return <DashboardRouteShell activeKey="portfolio" locale={locale}>
    <DashboardContainer>
      <PageHeader title={isHebrew ? 'ביצועים' : 'Performance'} subtitle={isHebrew ? 'התפתחות התיק, היעד האישי והרווחים שמומשו.' : 'Portfolio history, your personal target and realized returns.'} icon={LineChart} quickActionsTitle={t.dashboard.quickActions} quickActions={quickActions} actions={<ResearchExportButton />} metaBadges={[{ key: 'updated', label: `${t.app.updated} ${formatLastUpdatedTime(lastUpdate, locale) ?? '—'}` }]} />
      <DashboardMain>
        <Tabs value={view} onValueChange={(value) => patchUrl({ view: value })} dir={isHebrew ? 'rtl' : 'ltr'}>
          <TabsList aria-label={isHebrew ? 'תצוגת ביצועים' : 'Performance view'} className="mb-5 grid h-auto w-full grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 sm:inline-flex sm:w-auto">
            <TabsTrigger value="history" className="min-h-11 px-3 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 sm:px-6">{isHebrew ? 'לאורך זמן' : 'History'}</TabsTrigger>
            <TabsTrigger value="targets" className="min-h-11 px-3 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 sm:px-6">{isHebrew ? 'מול היעד' : 'Personal target'}</TabsTrigger>
            <TabsTrigger value="realized" className="min-h-11 px-3 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 sm:px-6">{isHebrew ? 'רווח ממומש' : 'Realized returns'}</TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="mt-0 space-y-6">
            {loading ? <DashboardSurface><p className="py-16 text-center text-slate-500">{t.common.loading}</p></DashboardSurface> : !summary || positions.length === 0 ? <DashboardSurface><div className="space-y-2 py-14 text-center"><h2 className="text-lg font-semibold">{t.portfolio.emptyTitle}</h2><p className="text-sm text-slate-500">{t.portfolio.emptyDescription}</p></div></DashboardSurface> : <>
              <DashboardSurface>
                <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                  {[
                    { label: isHebrew ? 'רווח והפסד בתצוגה' : 'Displayed profit / loss', value: actual },
                    { label: isHebrew ? 'יעד אישי להיום' : 'Personal target to date', value: target },
                    { label: isHebrew ? 'פער מהיעד' : 'Gap to target', value: gap },
                  ].map((item) => <div key={item.label}><dt className="text-sm text-slate-500">{item.label}</dt><dd className={`mt-2 text-xl font-semibold tabular-nums sm:text-2xl ${getTrendTone(item.value ?? 0).text}`}><bdi>{money(item.value)}</bdi></dd></div>)}
                </dl>
                <p className="mt-4 text-xs text-slate-500">{isHebrew ? 'הרווח כולל ממומש ולא ממומש, לפי בחירת הניכויים בגרף. היעד אישי ואינו תחזית שוק.' : 'P/L includes realized and unrealized results, using the deduction controls below. The personal target is not a market forecast.'}</p>
              </DashboardSurface>
              <DashboardSurface><PerformanceChart data={portfolioTimeline} summary={summary} /></DashboardSurface>
              <details className="summary-details rounded-xl border border-slate-200 bg-white">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold"><span>{isHebrew ? 'פירוט מטבעות ואומדן מס' : 'Currency and estimated tax details'}</span><ChevronDown aria-hidden="true" className="summary-chevron h-4 w-4 text-slate-400" /></summary>
                <dl className="grid grid-cols-2 gap-5 border-t border-slate-100 p-5 sm:grid-cols-3">
                  {[
                    { label: isHebrew ? 'אומדן מס' : 'Estimated tax', value: formatCurrency(currency === 'ILS' ? summary.totalTaxesPaidIls : summary.totalTaxesPaidUsd, currency, locale) },
                    { label: isHebrew ? 'רווח לאחר אומדן מס' : 'Profit after estimated tax', value: money(currency === 'ILS' ? summary.totalNetPnLIls : summary.totalNetPnLUsd) },
                    { label: isHebrew ? 'שער דולר נוכחי' : 'Current USD rate', value: `1 USD ≈ ${formatCurrency(summary.usdToIlsRate, 'ILS', locale)}` },
                    { label: t.portfolio.ilsHistoricalAdjustedLabel, value: formatSignedCurrency(historicalIlsNetPnL, 'ILS', locale) },
                    { label: isHebrew ? 'רווח ממומש בשערים היסטוריים' : 'Realized profit at historical FX', value: formatSignedCurrency(historicalIlsRealizedPnL, 'ILS', locale) },
                  ].map((item) => <div key={item.label}><dt className="text-xs text-slate-500">{item.label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums"><bdi>{item.value}</bdi></dd></div>)}
                </dl>
              </details>
              {openMetrics.length ? <details className="summary-details rounded-xl border border-slate-200 bg-white"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold"><span>{isHebrew ? 'הרכב התיק והשוואת ההחזקות' : 'Allocation and holdings comparison'}</span><ChevronDown aria-hidden="true" className="summary-chevron h-4 w-4 text-slate-400" /></summary><div className="border-t border-slate-100 p-4 sm:p-5"><PortfolioVisualizations metrics={openMetrics} summary={openSummary ?? summary} /></div></details> : null}
            </>}
          </TabsContent>
          <TabsContent value="targets" className="mt-0"><TargetsPanel /></TabsContent>
          <TabsContent value="realized" className="mt-0"><RealizedPanel /></TabsContent>
        </Tabs>
      </DashboardMain>
    </DashboardContainer>
  </DashboardRouteShell>;
}
