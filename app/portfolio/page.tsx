'use client';

import { AnimatedNumber } from '@/components/ui/animated-number';

import { PerformanceSummary } from '@/components/portfolio/performance-summary';
import { PerformanceSkeleton } from '@/components/portfolio/performance-skeleton';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { reconciliationQuality } from '@/lib/reconciliation-quality';
import { ChevronDown } from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { getPerformanceTotals, parsePerformanceOptions, parsePerformanceView } from '@/lib/performance-display';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { useReturnContext } from '@/hooks/use-return-context';
import { useUrlState } from '@/hooks/use-url-state';
import { PerformanceChart } from '@/components/charts/performance-chart';
import { ResearchExportButton } from '@/components/portfolio/research-export-button';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { PerformanceHeader, PerformanceTabsList } from '@/components/portfolio/performance-navigation';
import { DashboardContainer, DashboardMain, DashboardSurface } from '@/components/dashboard/page-primitives';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { formatLastUpdatedTime } from '@/lib/utils/portfolio-display';

function PendingTargets() {
  const { locale } = useApp();
  return <PerformanceSkeleton view="targets" locale={locale} />;
}

function PendingRealized() {
  const { locale } = useApp();
  return <PerformanceSkeleton view="realized" locale={locale} />;
}

const TargetsPanel = dynamic(() => import('@/components/portfolio/targets-panel').then((module) => module.TargetsPanel), { loading: PendingTargets });
const RealizedPanel = dynamic(() => import('@/components/portfolio/realized-panel').then((module) => module.RealizedPanel), { loading: PendingRealized });
const PortfolioVisualizations = dynamic(() => import('@/components/portfolio/portfolio-visualizations').then((module) => module.PortfolioVisualizations));
export default function PortfolioPage() {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const { loading, refreshing, positions, metrics, summary, openSummary, portfolioTimeline, historyStatus, historicalIlsNetPnL, historicalIlsRealizedPnL, lastUpdate, reload } = usePortfolioData();
  const [view, patchUrl] = useUrlState(parsePerformanceView);
  useReturnContext(!loading);
  const isHebrew = locale === 'he';
  const historyIncomplete = !reconciliationQuality(positions).completeTransactionHistory;
  const openMetrics = useMemo(() => metrics.filter((metric) => metric.position.quantity > 0), [metrics]);
  const quickActions = useMemo(() => createCommonQuickActions(t, { overrides: { reload: { onClick: reload, disabled: loading || refreshing, iconClassName: loading || refreshing ? 'animate-spin' : undefined } } }), [t, reload, loading, refreshing]);
  const currency = settings.currency;
  const [performanceOptions] = useUrlState(parsePerformanceOptions);
  const totals = summary ? getPerformanceTotals(summary, currency, performanceOptions) : undefined;

  return <DashboardRouteShell activeKey="portfolio" locale={locale}>
    <DashboardContainer>
      <PerformanceHeader locale={locale} loading={loading} updated={formatLastUpdatedTime(lastUpdate, locale)} quickActions={quickActions} actions={<ResearchExportButton />} />
      <DashboardMain>
        {historyIncomplete && <DashboardSurface><p role="status" className="text-sm">{isHebrew
          ? 'יתרות ההחזקות עודכנו בהתאמה לברוקר. העסקאות והרווחים הממומשים המתועדים נשמרו, אך חסרים פרטי עסקאות להסבר ההפרש. לכן רווח מצטבר, אומדן מס מלא והשוואה ליעד אינם מוצגים כמלאים. הרווח הפתוח בדולרים מחושב מהעלות שאושרה.'
          : 'Holdings include a broker balance reconciliation. Recorded trades and realized results are preserved, but missing executions prevent complete lifetime profit, tax and target comparisons. Open USD profit uses the confirmed cost basis.'}</p></DashboardSurface>}
        <Tabs value={view} onValueChange={(value) => patchUrl({ view: value })} dir={isHebrew ? 'rtl' : 'ltr'}>
          <PerformanceTabsList locale={locale} />
          <TabsContent value="history" className="mt-0 space-y-6">
            {loading ? <PerformanceSkeleton view="history" locale={locale} /> : !summary || positions.length === 0 ? <DashboardSurface><div className="space-y-2 py-14 text-center"><h2 className="text-lg font-semibold">{t.portfolio.emptyTitle}</h2><p className="text-sm text-slate-500">{t.portfolio.emptyDescription}</p></div></DashboardSurface> : <>
              <PerformanceSummary locale={locale} currency={currency} totals={totals} />
              <DashboardSurface><PerformanceChart data={portfolioTimeline} summary={summary} historyStatus={historyStatus} /></DashboardSurface>
              <details className="summary-details rounded-xl border border-slate-200 bg-white">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold"><span>{isHebrew ? 'פירוט מטבעות ואומדן מס' : 'Currency and estimated tax details'}</span><ChevronDown aria-hidden="true" className="summary-chevron h-4 w-4 text-slate-400" /></summary>
                <dl className="grid grid-cols-2 gap-5 border-t border-slate-100 p-5 sm:grid-cols-3">
                  {[
                    { label: isHebrew ? 'אומדן מס מלא' : 'Complete tax estimate', value: <AnimatedNumber value={historyIncomplete ? null : currency === 'ILS' ? summary.totalTaxesPaidIls : summary.totalTaxesPaidUsd} locale={locale} currency={currency} /> },
                    { label: isHebrew ? 'רווח לאחר אומדן מס' : 'Profit after estimated tax', value: <AnimatedNumber value={currency === 'ILS' ? summary.totalNetPnLIls : summary.totalNetPnLUsd} locale={locale} currency={currency} signed /> },
                    { label: isHebrew ? 'שער דולר נוכחי' : 'Current USD rate', value: <>1 USD ≈ <AnimatedNumber value={summary.usdToIlsRate} locale={locale} currency="ILS" /></> },
                    { label: t.portfolio.ilsHistoricalAdjustedLabel, value: <AnimatedNumber value={historicalIlsNetPnL} locale={locale} currency="ILS" signed /> },
                    { label: isHebrew ? 'רווח ממומש מתועד בשערים היסטוריים' : 'Recorded realized profit at historical FX', value: <AnimatedNumber value={historicalIlsRealizedPnL} locale={locale} currency="ILS" signed /> },
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
