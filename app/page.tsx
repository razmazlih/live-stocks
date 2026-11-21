'use client';

import Link from 'next/link';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { DashboardContainer, DashboardMain, DashboardSurface } from '@/components/dashboard/page-primitives';
import { OverviewHeader } from '@/components/dashboard/overview-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { OverviewHoldings } from '@/components/portfolio/overview-holdings';
import { ClosePairProposals } from '@/components/portfolio/close-pair-proposals';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { useUrlState } from '@/hooks/use-url-state';
import { useReturnContext } from '@/hooks/use-return-context';
import { useApp } from '@/lib/context';
import { formatCurrency } from '@/lib/calculations';
import { reconciliationQuality } from '@/lib/reconciliation-quality';
import { getPerformanceTotals, parsePerformanceOptions } from '@/lib/performance-display';

export default function HomePage() {
  const { locale, settings } = useApp();
  const he = locale === 'he';
  const { loading, refreshing, summary, metrics, positions, sparklineData, contextSparklineData, lastUpdate, reload } = usePortfolioData();
  useReturnContext(!loading);
  const currency = settings.currency;
  const [performanceOptions] = useUrlState(parsePerformanceOptions);
  const totals = summary ? getPerformanceTotals(summary, currency, performanceOptions) : null;
  const money = (value: number | undefined) => value !== undefined && Number.isFinite(value) ? formatCurrency(value, currency, locale) : '—';
  const quality = reconciliationQuality(positions);
  const missingTrades = !quality.completeTransactionHistory;
  const missingFees = !quality.completeCommissionHistory;
  const actual = missingTrades || missingFees ? undefined : totals?.actual;
  const profitLabel = actual !== undefined && Number.isFinite(actual)
    ? actual < 0 ? (he ? 'הפסד מצטבר' : 'Cumulative loss') : (he ? 'רווח מצטבר' : 'Cumulative profit')
    : he ? 'רווח / הפסד מצטבר' : 'Cumulative profit / loss';
  const tone = actual && Number.isFinite(actual) ? actual > 0 ? 'text-emerald-700' : 'text-rose-600' : 'text-slate-950';
  const gap = totals && Number.isFinite(totals.gap) ? Number(totals.gap.toFixed(2)) : undefined;
  const target = totals?.target;
  const canCompare = Number.isFinite(actual) && Number.isFinite(target) && gap !== undefined;
  const params = new URLSearchParams();
  if (!performanceOptions.includeFees) params.set('includeFees', '0');
  if (!performanceOptions.includeTaxes) params.set('includeTaxes', '0');
  const performanceHref = params.size ? `/portfolio?${params}` : '/portfolio';
  params.set('view', 'targets');
  const targetHref = `/portfolio?${params}`;
  const missingDetails = missingTrades && missingFees
    ? (he ? 'חסרים פרטי עסקאות ועמלות לחישוב' : 'Transaction and fee details are missing')
    : missingTrades ? (he ? 'חסרות עסקאות לחישוב' : 'Transactions are missing')
    : missingFees ? (he ? 'חסרים סכומי עמלות לחישוב' : 'Fee amounts are missing')
    : (he ? 'הנתונים לחישוב עדיין אינם זמינים' : 'Figures are currently unavailable');
  const deductionBasis = performanceOptions.includeFees
    ? performanceOptions.includeTaxes ? (he ? 'לאחר עמלות ואומדן מס' : 'After fees & estimated tax') : (he ? 'לאחר עמלות · לפני מס' : 'After fees · before tax')
    : performanceOptions.includeTaxes ? (he ? 'לפני עמלות · לאחר אומדן מס' : 'Before fees · after estimated tax') : (he ? 'לפני עמלות ומס' : 'Before fees & tax');
  return <DashboardRouteShell activeKey="dashboard" locale={locale}>
    <DashboardContainer>
      <OverviewHeader locale={locale} lastUpdate={lastUpdate} loading={loading} refreshing={refreshing} onRefresh={reload} />
      <DashboardMain className="mt-5">
        {loading ? <div aria-busy="true" aria-label={he ? 'טוען את התיק' : 'Loading portfolio'} className="space-y-5"><Skeleton className="h-36 rounded-xl" /><Skeleton className="h-80 rounded-xl" /></div> : positions.length === 0 ? <DashboardSurface><div className="flex flex-col items-center gap-4 py-16 text-center"><h2 className="text-xl font-semibold">{he ? 'התיק שלך מתחיל כאן' : 'Your portfolio starts here'}</h2><p className="max-w-md text-sm text-slate-500">{he ? 'הוסף את העסקה הראשונה כדי לראות את ההחזקות והביצועים מול היעד האישי.' : 'Add your first transaction to see your holdings and performance against your personal target.'}</p><Button asChild><Link href="/positions?action=add"><Plus aria-hidden />{he ? 'הוספת עסקה' : 'Add transaction'}</Link></Button></div></DashboardSurface> : <>
          <section aria-label={he ? 'תמונת מצב התיק' : 'Portfolio summary'} className="portfolio-summary overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <h2 className="sr-only">{he ? 'התיק במספרים' : 'Your portfolio at a glance'}</h2>
            <dl className="portfolio-summary-grid">
              <div className="overview-stat overview-stat-primary">
                <dt className="text-sm font-medium text-slate-600">{he ? 'שווי ההחזקות' : 'Holdings value'}</dt>
                <dd className="mt-2 break-words text-[clamp(2.25rem,6vw,3.75rem)] font-semibold leading-tight tracking-tight text-slate-950 tabular-nums"><bdi>{money(totals?.value)}</bdi></dd>
              </div>
              <div className="overview-stat">
                <dt className="text-sm font-medium text-slate-600">{profitLabel}</dt>
                <dd className={`mt-1 break-words text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${tone}`}><bdi>{money(actual)}</bdi></dd>
                <dd className="mt-1 text-sm">
                  {canCompare ? <Link href={targetHref} className="overview-summary-link">
                    <span>{gap < 0 ? (he ? 'חסרים ' : '') : gap > 0 ? (he ? 'עברת ב־' : '') : (he ? 'הגעת ליעד המצטבר של ' : 'Reached the cumulative target of ')}
                      {gap !== 0 && <><bdi>{money(Math.abs(gap))}</bdi>{gap < 0 ? (he ? ' ליעד המצטבר של ' : ' below the cumulative target of ') : (he ? ' את היעד המצטבר של ' : ' above the cumulative target of ')}</>}
                      <bdi>{money(target)}</bdi>
                    </span><ChevronRight aria-hidden className="h-4 w-4 shrink-0 rtl:rotate-180" />
                  </Link> : <div className="flex flex-wrap items-center gap-x-2 text-slate-600">
                    <span>{missingDetails}</span>
                    <Link className="overview-summary-link" href={performanceHref}>{he ? 'לפירוט הביצועים' : 'Performance details'}<ChevronRight aria-hidden className="h-4 w-4 rtl:rotate-180" /></Link>
                  </div>}
                </dd>
              </div>
            </dl>
            <details className="group border-t border-slate-100 px-4 text-xs text-slate-500 sm:px-5">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="inline-flex items-center gap-1.5 text-[11px]">{deductionBasis}</span><span className="inline-flex shrink-0 items-center gap-1.5 font-medium">{he ? 'מה כלול?' : 'What’s included?'}<ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></span></summary>
                <div className="max-w-xl space-y-3 pb-3 pt-3 leading-relaxed">
                  <p>{he ? 'הנתונים מצטברים מתחילת ההשקעה ועד היום, במטבע התיק.' : 'Cumulative from your first investment to today, in your portfolio currency.'}</p>
                  <p>{he ? 'שווי ההחזקות הוא שווי השוק של המניות הפתוחות בתיק. הרווח המצטבר כולל רווחים והפסדים מהחזקות פתוחות ומעסקאות שמומשו. היעד המצטבר מחושב לפי יעד התשואה האישי ומועדי העסקאות.' : 'Holdings value is the market value of your open stocks. Cumulative profit includes gains and losses on open holdings and realized trades. Your cumulative target uses your personal return goal and trade dates.'}</p>
                  <p>{he ? 'הרווח מחושב לפי אפשרויות החישוב בדף הביצועים. המס הוא אומדן על מימושים, לא מס ששולם בפועל. היעד אישי ואינו תחזית שוק.' : 'Profit uses the calculation settings from the performance page. Tax is estimated on realized gains, not actual tax paid. The personal target is not a market forecast.'}</p>
                </div>
            </details>
          </section>
          <OverviewHoldings metrics={metrics} sparklineData={sparklineData} contextSparklineData={contextSparklineData} positions={positions} />
          <ClosePairProposals metrics={metrics} positions={positions} sparklineData={sparklineData} />
        </>}
      </DashboardMain>
    </DashboardContainer>
  </DashboardRouteShell>;
}
