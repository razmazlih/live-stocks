'use client';

import Link from 'next/link';
import { LayoutDashboard, Plus, RefreshCw, ArrowLeft, ArrowRight } from 'lucide-react';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { DashboardContainer, DashboardMain, DashboardSurface } from '@/components/dashboard/page-primitives';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PerformanceChart } from '@/components/charts/performance-chart';
import { OverviewHoldings } from '@/components/portfolio/overview-holdings';
import { ResearchExportButton } from '@/components/portfolio/research-export-button';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { useReturnContext } from '@/hooks/use-return-context';
import { useApp } from '@/lib/context';
import { formatCurrency } from '@/lib/calculations';
import { getPerformanceTotals } from '@/lib/performance-display';
import { formatLastUpdatedTime } from '@/lib/utils/portfolio-display';

export default function HomePage() {
  const { locale, settings } = useApp();
  const he = locale === 'he';
  const { loading, refreshing, summary, metrics, positions, portfolioTimeline, sparklineData, lastUpdate, reload } = usePortfolioData();
  useReturnContext(!loading);
  const currency = settings.currency;
  const totals = summary ? getPerformanceTotals(summary, currency) : null;
  const money = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? formatCurrency(value, currency, locale) : '—';
  const Arrow = he ? ArrowLeft : ArrowRight;
  const stats = [
    { label: he ? 'שווי התיק' : 'Portfolio value', value: totals?.value },
    { label: he ? 'רווח והפסד בפועל' : 'Actual profit / loss', value: totals?.actual, colored: true },
    { label: he ? 'יעד אישי להיום' : 'Personal target today', value: totals?.target },
    { label: he ? 'פער מהיעד' : 'Gap to target', value: totals?.gap, colored: true },
  ];
  return <DashboardRouteShell activeKey="dashboard" locale={locale}>
    <DashboardContainer>
      <PageHeader title={he ? 'סקירת התיק' : 'Portfolio overview'} icon={LayoutDashboard}
        metaBadges={[{ key: 'updated', label: `${he ? 'עודכן' : 'Updated'} ${formatLastUpdatedTime(lastUpdate, locale) ?? '—'}` }]}
        quickActionsTitle={he ? 'פעולות' : 'Actions'}
        quickActions={[{ key: 'reload', label: he ? 'רענן' : 'Refresh', icon: RefreshCw, onClick: reload, disabled: loading || refreshing, iconClassName: refreshing ? 'animate-spin' : undefined, labelClassName: 'sr-only' }]}
        actions={<div className="flex flex-wrap items-center gap-2"><Button asChild className="rounded-lg"><Link href="/positions?action=add"><Plus aria-hidden />{he ? 'הוספת עסקה' : 'Add transaction'}</Link></Button><ResearchExportButton /></div>} />
      <DashboardMain className="mt-5">
        {loading ? <div aria-busy="true" aria-label={he ? 'טוען את התיק' : 'Loading portfolio'} className="space-y-5"><Skeleton className="h-36 rounded-xl" /><Skeleton className="h-80 rounded-xl" /></div> : positions.length === 0 ? <DashboardSurface><div className="flex flex-col items-center gap-4 py-16 text-center"><h2 className="text-xl font-semibold">{he ? 'התיק שלך מתחיל כאן' : 'Your portfolio starts here'}</h2><p className="max-w-md text-sm text-slate-500">{he ? 'הוסף את העסקה הראשונה כדי לראות את ההחזקות והביצועים מול היעד האישי.' : 'Add your first transaction to see your holdings and performance against your personal target.'}</p><Button asChild><Link href="/positions?action=add"><Plus aria-hidden />{he ? 'הוספת עסקה' : 'Add transaction'}</Link></Button></div></DashboardSurface> : <>
          <section aria-label={he ? 'תמונת מצב התיק' : 'Portfolio summary'}>
            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-4">
              {stats.map((stat) => <div key={stat.label} className="overview-stat min-w-0 px-4 py-5 sm:px-5 sm:py-6"><p className="text-xs font-medium text-slate-600 sm:text-sm">{stat.label}</p><p className={`mt-2 truncate text-[22px] font-semibold tracking-tight tabular-nums xl:text-[30px] ${stat.colored && stat.value !== undefined && stat.value !== 0 ? stat.value > 0 ? 'text-emerald-700' : 'text-rose-600' : 'text-slate-950'}`}><bdi>{money(stat.value)}</bdi></p></div>)}
            </div>
            <p className="mt-2 px-1 text-xs leading-relaxed text-slate-500">{he ? 'יעד תשואה אישי, לא תחזית שוק. הרווח כולל ממומש ולא ממומש, לפני אומדן מס.' : 'A personal return target, not a market forecast. P/L includes realized and unrealized results, before estimated tax.'}</p>
          </section>
          {summary ? <DashboardSurface className="space-y-4 rounded-xl p-4 sm:p-5">
            <PerformanceChart data={portfolioTimeline} summary={summary} compact />
            <Link href="/portfolio" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-700">{he ? 'לכל הביצועים' : 'All performance'}<Arrow aria-hidden className="h-4 w-4" /></Link>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span className="font-semibold text-slate-900">{he ? 'פערים מול היעד' : 'Gaps to target'}</span><span className="text-slate-600">{he ? 'פער מצטבר:' : 'Cumulative gap:'} <bdi className="font-semibold tabular-nums">{money(totals?.gap)}</bdi></span></div><Link href="/portfolio?view=targets" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-700">{he ? 'לצפייה בפירוט' : 'View details'}<Arrow aria-hidden className="h-4 w-4" /></Link></div>
          </DashboardSurface> : <DashboardSurface><p className="py-10 text-center text-sm text-slate-500">{he ? 'סיכום התיק אינו זמין כרגע.' : 'The portfolio summary is currently unavailable.'}</p></DashboardSurface>}
          <OverviewHoldings metrics={metrics} sparklineData={sparklineData} />
        </>}
      </DashboardMain>
    </DashboardContainer>
  </DashboardRouteShell>;
}
