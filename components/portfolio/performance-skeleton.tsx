'use client';

import { DashboardSurface } from '@/components/dashboard/page-primitives';
import { TargetsSummary, TargetSectionHeading } from './targets-summary';
import { PerformanceChartHeading, PerformanceChartLegend } from '@/components/charts/performance-chart-labels';
import { PerformanceSummary, RealizedSummary } from './performance-summary';
import { translations } from '@/lib/translations';
import { Skeleton } from '@/components/ui/skeleton';

type PerformanceView = 'history' | 'targets' | 'realized';

export function PerformanceSkeleton({ view, locale = 'he' }: { view: PerformanceView; locale?: 'he' | 'en' }) {
  const t = translations[locale];
  if (view === 'targets') return <div data-page-loading role="status" aria-label={locale === 'he' ? 'טוען נתוני ביצועים' : 'Loading performance data'}>
    <DashboardSurface>
      <div className="space-y-8">
        <TargetsSummary locale={locale} />
        <section className="space-y-4">
          <TargetSectionHeading title={t.exceptions.openTitle} description={t.exceptions.openDescription} />
          <div className="grid gap-3 lg:hidden" aria-hidden="true">
            {[0, 1, 2].map(row => <div key={row} className="rounded-xl border p-4">
              <div className="flex h-10 items-start justify-between"><div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-12" /></div><Skeleton className="h-6 w-16 rounded-full" /></div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                {[t.exceptions.currentPrice, t.exceptions.requiredExitPrice, t.exceptions.weightedProjectedPrice, t.exceptions.openQuantity, t.exceptions.performanceVsTarget].map(label => <div key={label}><p className="text-xs font-medium text-slate-500">{label}</p><Skeleton className="mt-0.5 h-5 w-16 max-w-full" /></div>)}
              </div>
              <div className="mt-4 flex h-11 items-center"><Skeleton className="h-3 w-24" /></div>
            </div>)}
          </div>
          <div className="hidden overflow-hidden rounded-xl border lg:block" aria-hidden="true">
            <div className="grid min-w-[940px] grid-cols-8 gap-4 bg-slate-50 px-4 py-3">{Array.from({ length: 8 }, (_, col) => <Skeleton key={col} className="h-4 w-2/3" />)}</div>
            {[0, 1, 2].map(row => <div key={row} className="grid min-h-[77px] min-w-[940px] grid-cols-8 items-center gap-4 border-t px-4">
              {Array.from({ length: 8 }, (_, col) => <Skeleton key={col} className="h-4 w-3/4" />)}
            </div>)}
          </div>
        </section>
      </div>
    </DashboardSurface>
  </div>;

  return (
    <div data-page-loading role="status" aria-label={locale === 'he' ? 'טוען נתוני ביצועים' : 'Loading performance data'} className="space-y-6">
      {view === 'history' ? <PerformanceSummary locale={locale} /> : <RealizedSummary locale={locale} />}
      <DashboardSurface>
        {view === 'history' ? (
          <>
            <PerformanceChartHeading locale={locale} />
            <div className="my-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Skeleton className="h-[52px] w-full rounded-xl sm:w-64" /><Skeleton className="h-[1lh] w-28 text-[11px]" />
            </div>
            <PerformanceChartLegend locale={locale} />
            <Skeleton className="mt-4 h-[280px] w-full rounded-xl sm:h-[360px]" />
            <div className="mt-4 flex h-11 items-center"><Skeleton className="h-3 w-40" /></div>
          </>
        ) : (
          <div className="divide-y">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl font-semibold">{t.realized.bySymbolTitle}</h2><p className="text-sm text-slate-500">{t.realized.bySymbolSubtitle}</p></div>
            {[0, 1, 2].map((row) => (
              <div key={row} className="grid grid-cols-2 items-center gap-3 py-4 sm:grid-cols-4">
                <Skeleton className="h-5 w-20" />
                {[0, 1, 2].map(metric => <div key={metric} className="space-y-1"><Skeleton className="h-4 w-20" /><Skeleton className="h-5 w-16" /><Skeleton className="h-4 w-12" /></div>)}
              </div>
            ))}
          </div>
        )}
      </DashboardSurface>
    </div>
  );
}
