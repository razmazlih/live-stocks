'use client';

import { DashboardSurface } from '@/components/dashboard/page-primitives';
import { translations } from '@/lib/translations';
import { Skeleton } from '@/components/ui/skeleton';

type PerformanceView = 'history' | 'targets' | 'realized';

export function PerformanceSkeleton({ view, locale = 'he' }: { view: PerformanceView; locale?: 'he' | 'en' }) {
  const t = translations[locale];
  if (view === 'targets') return <div data-page-loading role="status" aria-label={locale === 'he' ? 'טוען נתוני ביצועים' : 'Loading performance data'}>
    <DashboardSurface>
      <div className="space-y-4">
        <Skeleton className="h-7 w-52 max-w-full" />
        <Skeleton className="h-5 w-3/4" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map(card => <div key={card} className="rounded-xl border p-4">
            <Skeleton className="h-5 w-24" /><Skeleton className="mt-2 h-9 w-12" />
          </div>)}
        </div>
      </div>
      <div className="mt-8 space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-7 w-36" />
          <div className="flex h-14 flex-col justify-around sm:h-5"><Skeleton className="h-3 w-11/12" /><Skeleton className="h-3 w-3/4 sm:hidden" /></div>
          <Skeleton className="h-5 w-8" />
        </div>
        <div className="rounded-xl border p-4"><Skeleton className="h-5 w-24" />
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map(metric => <div key={metric}><Skeleton className="h-3 w-20" /><Skeleton className="mt-1 h-5 w-16" /></div>)}
          </div>
        </div>
      </div>
    </DashboardSurface>
  </div>;

  const grid = {
    history: 'grid-cols-2 sm:grid-cols-3',
    realized: 'grid-cols-2 xl:grid-cols-4',
  }[view];

  return (
    <div data-page-loading role="status" aria-label={locale === 'he' ? 'טוען נתוני ביצועים' : 'Loading performance data'} className="space-y-6">
      <DashboardSurface>
        {view !== 'history' && <Skeleton className="mb-5 h-7 w-48 max-w-full" />}
        <div className={`grid gap-5 ${grid}`} aria-hidden="true">
          {Array.from({ length: view === 'realized' ? 4 : 3 }, (_, index) => (
            <div key={index}>
              <Skeleton className="h-5 w-28 max-w-full" />
              <Skeleton className="mt-2 h-7 w-20 max-w-full" />
              {view === 'realized' && <Skeleton className="mt-1 h-4 w-16" />}
            </div>
          ))}
        </div>
        {view === 'history' ? <div className="mt-4 flex h-8 flex-col justify-around sm:h-4">
          <Skeleton className="h-2.5 w-11/12" /><Skeleton className="h-2.5 w-2/3 sm:hidden" />
        </div> : <RealizedTaxNote locale={locale} />}
      </DashboardSurface>
      <DashboardSurface>
        {view === 'history' ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div><Skeleton className="h-7 w-32" /><Skeleton className="mt-1 h-[1lh] w-24 text-xs leading-relaxed" /></div>
              <Skeleton className="h-10 w-20 rounded-xl" />
            </div>
            <div className="my-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Skeleton className="h-[52px] w-full rounded-xl sm:w-64" /><Skeleton className="h-[1lh] w-28 text-[11px]" />
            </div>
            <div className="mb-4 flex justify-between border-t pt-4 text-[10px] sm:text-[11px]"><Skeleton className="h-[1lh] w-36" /><Skeleton className="h-[1lh] w-16" /></div>
            <Skeleton className="h-[280px] w-full rounded-xl sm:h-[360px]" />
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

export function RealizedTaxNote({ locale }: { locale: 'he' | 'en' }) {
  return <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">{locale === 'he' ? 'המס המוצג הוא אומדן לפי מודל החישוב של האפליקציה, ולא אישור מס ששולם.' : 'Tax is an estimate calculated by the app, not confirmation of tax paid.'}</p>;
}
