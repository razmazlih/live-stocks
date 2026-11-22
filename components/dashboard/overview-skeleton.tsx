import { Skeleton } from '@/components/ui/skeleton';
import { DashboardSurface } from './page-primitives';

export function OverviewSkeleton({ locale }: { locale: 'he' | 'en' }) {
  return <div role="status" className="space-y-6">
    <span className="sr-only">{locale === 'he' ? 'טוען את התיק' : 'Loading portfolio'}</span>
    <div aria-hidden="true" className="portfolio-summary overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="portfolio-summary-grid">
        <div><Skeleton className="h-4 w-24" /><Skeleton className="mt-3 h-10 w-48 max-w-full sm:h-14" /></div>
        <div><Skeleton className="h-4 w-28" /><Skeleton className="my-3 h-8 w-32" /><Skeleton className="h-3 w-40" /></div>
      </div>
      <div className="flex h-11 items-center justify-between border-t border-slate-100 px-5"><Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-16" /></div>
    </div>
    <div aria-hidden="true" className="flex min-h-[3.5rem] items-center rounded-3xl border border-slate-200 bg-white px-5 shadow-sm"><Skeleton className="h-5 w-40" /></div>
    <DashboardSurface className="p-4 sm:p-5">
      <div aria-hidden="true" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Skeleton className="h-6 w-32" /><Skeleton className="h-11 rounded-lg sm:w-56" /></div>
        <div className="flex h-11 items-center justify-between"><Skeleton className="h-7 w-20" /><Skeleton className="h-3 w-28" /></div>
        {[0, 1, 2].map(row => <div key={row} className="flex min-h-[5rem] items-center gap-3 rounded-2xl border border-slate-100 px-4 xl:rounded-none xl:border-x-0 xl:border-t-0">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="grow"><Skeleton className="h-4 w-14" /><Skeleton className="mt-2 h-3 w-20" /></div>
          <Skeleton className="h-4 w-16" /><Skeleton className="ms-5 hidden h-5 w-28 sm:block" />
        </div>)}
      </div>
    </DashboardSurface>
  </div>;
}
