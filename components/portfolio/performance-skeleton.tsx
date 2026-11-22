'use client';

import { DashboardSurface } from '@/components/dashboard/page-primitives';
import { Skeleton } from '@/components/ui/skeleton';

type PerformanceView = 'history' | 'targets' | 'realized';

export function PerformanceSkeleton({ view, locale = 'he' }: { view: PerformanceView; locale?: 'he' | 'en' }) {
  const grid = {
    history: 'grid-cols-2 sm:grid-cols-3',
    targets: 'sm:grid-cols-3',
    realized: 'grid-cols-2 xl:grid-cols-4',
  }[view];

  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">{locale === 'he' ? 'טוען נתוני ביצועים' : 'Loading performance data'}</span>
      <DashboardSurface>
        {view !== 'history' && <Skeleton className="mb-5 h-7 w-48 max-w-full" />}
        <div className={`grid gap-5 ${grid}`} aria-hidden="true">
          {Array.from({ length: view === 'realized' ? 4 : 3 }, (_, index) => (
            <div key={index} className={view === 'targets' ? 'rounded-xl border p-4' : undefined}>
              <Skeleton className="h-4 w-28 max-w-full" />
              <Skeleton className="mt-2 h-7 w-20 max-w-full" />
              {view === 'realized' && <Skeleton className="mt-1 h-3 w-16" />}
            </div>
          ))}
        </div>
        <Skeleton className="mt-4 h-3 w-3/4" />
      </DashboardSurface>
      <DashboardSurface>
        <Skeleton className="mb-5 h-6 w-44 max-w-full" />
        {view === 'history' ? (
          <>
            <Skeleton className="mb-5 h-11 w-full max-w-sm" />
            <Skeleton className="h-[280px] w-full rounded-xl sm:h-[360px]" />
          </>
        ) : (
          <div className="divide-y">
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
