'use client';

import { DashboardSurface } from '@/components/dashboard/page-primitives';
import { Skeleton } from '@/components/ui/skeleton';

type PerformanceView = 'history' | 'targets' | 'realized';

export function PerformanceSkeleton({ view, locale = 'he' }: { view: PerformanceView; locale?: 'he' | 'en' }) {
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
    <div data-page-loading role="status" className="space-y-6">
      <span className="sr-only">{locale === 'he' ? 'טוען נתוני ביצועים' : 'Loading performance data'}</span>
      <DashboardSurface>
        {view !== 'history' && <Skeleton className="mb-5 h-7 w-48 max-w-full" />}
        <div className={`grid gap-5 ${grid}`} aria-hidden="true">
          {Array.from({ length: view === 'realized' ? 4 : 3 }, (_, index) => (
            <div key={index}>
              <Skeleton className={view === 'history' ? 'h-5 w-28 max-w-full' : 'h-4 w-28 max-w-full'} />
              <Skeleton className="mt-2 h-7 w-20 max-w-full" />
              {view === 'realized' && <Skeleton className="mt-1 h-3 w-16" />}
            </div>
          ))}
        </div>
        {view === 'history' ? <div className="mt-4 flex h-8 flex-col justify-around sm:h-4">
          <Skeleton className="h-2.5 w-11/12" /><Skeleton className="h-2.5 w-2/3 sm:hidden" />
        </div> : <Skeleton className="mt-4 h-3 w-3/4" />}
      </DashboardSurface>
      <DashboardSurface>
        {view === 'history' ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div><Skeleton className="h-7 w-32" /><Skeleton className="mt-1 h-4 w-24" /></div>
              <Skeleton className="h-10 w-20 rounded-xl" />
            </div>
            <div className="my-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Skeleton className="h-[52px] w-full rounded-xl sm:w-64" /><Skeleton className="h-4 w-28" />
            </div>
            <div className="mb-4 flex justify-between border-t pt-4"><Skeleton className="h-4 w-36" /><Skeleton className="h-4 w-16" /></div>
            <Skeleton className="h-[280px] w-full rounded-xl sm:h-[360px]" />
            <div className="mt-4 flex h-11 items-center"><Skeleton className="h-3 w-40" /></div>
          </>
        ) : (
          <div className="divide-y">
            <Skeleton className="mb-5 h-7 w-44 max-w-full" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4 py-5">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        )}
      </DashboardSurface>
    </div>
  );
}
