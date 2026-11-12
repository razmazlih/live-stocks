'use client';

import Link from 'next/link';
import { LayoutDashboard, Plus, RefreshCw, ArrowLeft, ArrowRight, Wallet, TrendingUp, Target, ArrowLeftRight, ChevronDown } from 'lucide-react';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { DashboardContainer, DashboardMain, DashboardSurface } from '@/components/dashboard/page-primitives';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PerformanceChart } from '@/components/charts/performance-chart';
import { OverviewHoldings } from '@/components/portfolio/overview-holdings';
import { ClosePairProposals } from '@/components/portfolio/close-pair-proposals';
import { ResearchExportButton } from '@/components/portfolio/research-export-button';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { useUrlState } from '@/hooks/use-url-state';
import { useReturnContext } from '@/hooks/use-return-context';
import { useApp } from '@/lib/context';
import { formatCurrency } from '@/lib/calculations';
import { getPerformanceTotals, parsePerformanceOptions } from '@/lib/performance-display';
import { formatLastUpdatedTime } from '@/lib/utils/portfolio-display';

export default function HomePage() {
  const { locale, settings } = useApp();
  const he = locale === 'he';
  const { loading, refreshing, summary, metrics, positions, portfolioTimeline, sparklineData, lastUpdate, reload } = usePortfolioData();
  useReturnContext(!loading);
  const currency = settings.currency;
  const [performanceOptions] = useUrlState(parsePerformanceOptions);
  const totals = summary ? getPerformanceTotals(summary, currency, performanceOptions) : null;
  const money = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? formatCurrency(value, currency, locale) : '—';
  const Arrow = he ? ArrowLeft : ArrowRight;
  const gap = totals?.gap;
  const hasGap = gap !== undefined && Number.isFinite(gap);
  const deductionBasis = performanceOptions.includeFees
    ? performanceOptions.includeTaxes ? (he ? 'לאחר עמלות ואומדן מס' : 'After fees & estimated tax') : (he ? 'לאחר עמלות · לפני מס' : 'After fees · before tax')
    : performanceOptions.includeTaxes ? (he ? 'לפני עמלות · לאחר אומדן מס' : 'Before fees · after estimated tax') : (he ? 'לפני עמלות ומס' : 'Before fees & tax');
  const stats = [
    { label: he ? 'שווי ההחזקות' : 'Holdings value', value: totals?.value, icon: Wallet, detail: he ? 'שווי השוק של המניות הפתוחות בתיק' : 'Market value of your open stock holdings', primary: true, colored: false },
    { label: totals && Number.isFinite(totals.actual) ? totals.actual < 0 ? (he ? 'הפסד מצטבר' : 'Cumulative loss') : (he ? 'רווח מצטבר' : 'Cumulative profit') : (he ? 'רווח / הפסד' : 'Profit / loss'), value: totals?.actual, icon: TrendingUp, detail: he ? 'רווח ממומש + רווח או הפסד בהחזקות הפתוחות' : 'Realized results + unrealized gains or losses', primary: false, colored: true },
    { label: he ? 'יעד רווח להיום' : 'Profit target to date', value: totals?.target, icon: Target, detail: he ? 'הרווח הרצוי לפי יעד התשואה האישי ומועדי העסקאות' : 'Expected profit based on your personal return goal and trade dates', primary: false, colored: false },
    { label: hasGap ? gap < 0 ? (he ? 'חסר ליעד' : 'Below target') : gap > 0 ? (he ? 'מעל היעד' : 'Above target') : (he ? 'היעד הושג' : 'On target') : (he ? 'מרחק מהיעד' : 'Distance to target'), value: hasGap ? Math.abs(gap) : undefined, icon: ArrowLeftRight, detail: he ? 'ההפרש בין הרווח המצטבר ליעד הרווח' : 'Difference between cumulative profit and your profit target', primary: false, colored: false },
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
          <section aria-label={he ? 'תמונת מצב התיק' : 'Portfolio summary'} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="sr-only">{he ? 'התיק במספרים' : 'Your portfolio at a glance'}</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-4">
              {stats.map((stat, index) => <div key={index} className={`overview-stat min-w-0 px-4 py-5 sm:px-5 ${stat.primary ? 'bg-blue-50/50' : ''}`}>
                <dt className="flex items-start gap-2 text-xs font-medium leading-5 text-slate-600 sm:text-sm"><stat.icon aria-hidden className={`mt-0.5 hidden h-4 w-4 shrink-0 lg:block ${stat.primary ? 'text-blue-600' : 'text-slate-400'}`} />{stat.label}</dt>
                <dd className={`mt-2 break-words text-xl font-semibold tracking-tight tabular-nums sm:text-[23px] xl:text-[28px] ${stat.colored && stat.value !== undefined && stat.value !== 0 ? stat.value > 0 ? 'text-emerald-700' : 'text-rose-600' : index === 3 && hasGap ? gap < 0 ? 'text-rose-600' : 'text-emerald-700' : 'text-slate-950'}`}><bdi>{money(stat.value)}</bdi></dd>
              </div>)}
            </dl>
            <details className="group border-t border-slate-100 px-4 text-xs text-slate-500 sm:px-5">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="inline-flex items-center gap-1.5 text-[11px]"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-blue-500" />{deductionBasis}</span><span className="inline-flex shrink-0 items-center gap-1.5 font-medium">{he ? 'מה כלול?' : 'What’s included?'}<ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></span></summary>
                <div className="max-w-xl space-y-3 pb-3 pt-3 leading-relaxed">
                  <p>{he ? 'הנתונים מצטברים מתחילת ההשקעה ועד היום, במטבע התיק.' : 'Cumulative from your first investment to today, in your portfolio currency.'}</p>
                  <dl className="space-y-2">{stats.map((stat, index) => <div key={index}><dt className="font-medium text-slate-700">{stat.label}</dt><dd>{stat.detail}</dd></div>)}</dl>
                  <p>{he ? 'הרווח מחושב לפי אפשרויות החישוב בגרף. המס הוא אומדן על מימושים, לא מס ששולם בפועל. היעד אישי ואינו תחזית שוק.' : 'Profit uses the chart’s calculation settings. Tax is estimated on realized gains, not actual tax paid. The personal target is not a market forecast.'}</p>
                </div>
            </details>
          </section>
          {summary ? <DashboardSurface className="overflow-hidden rounded-2xl p-0 sm:p-0">
            <div className="p-4 sm:p-5"><PerformanceChart data={portfolioTimeline} summary={summary} compact /></div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-2 sm:px-5">
              <Link href="/portfolio?view=targets" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-xs font-medium text-slate-600 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Target aria-hidden className="h-4 w-4" />{he ? 'פירוט יעדים' : 'Target details'}</Link>
              <Link href="/portfolio" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-xs font-semibold text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{he ? 'כל הביצועים' : 'All performance'}<Arrow aria-hidden className="h-4 w-4" /></Link>
            </div>
          </DashboardSurface> : <DashboardSurface><p className="py-10 text-center text-sm text-slate-500">{he ? 'סיכום התיק אינו זמין כרגע.' : 'The portfolio summary is currently unavailable.'}</p></DashboardSurface>}
          <OverviewHoldings metrics={metrics} sparklineData={sparklineData} positions={positions} />
          <ClosePairProposals metrics={metrics} positions={positions} sparklineData={sparklineData} />
        </>}
      </DashboardMain>
    </DashboardContainer>
  </DashboardRouteShell>;
}
