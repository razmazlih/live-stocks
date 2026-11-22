import { Skeleton } from '@/components/ui/skeleton';
import styles from '@/components/portfolio/market-overview-surface.module.css';
import { DashboardSurface } from './page-primitives';

function ProposalSkeleton() {
  return <div aria-hidden="true" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between px-4 py-3 sm:px-5">
      <div className="flex h-6 items-center sm:h-7"><Skeleton className="h-5 w-40" /></div>
      <Skeleton className="h-3 w-3 rounded-full" />
    </div>
    <div className="border-y border-slate-100 bg-slate-50/60 p-3 sm:p-4">
      <div className="holding-card px-4 sm:px-5">
        <div className="flex items-center justify-between py-3">
          <div><div className="flex gap-2"><Skeleton className="h-7 w-14" /><Skeleton className="h-7 w-14" /></div><Skeleton className="mt-2 h-3 w-16" /></div>
          <div className="flex flex-col items-end gap-2"><Skeleton className="h-[13.5px] w-20" /><Skeleton className="h-7 w-16" /></div>
        </div>
        <Skeleton className="mb-1 h-9 rounded-lg" />
        <div className="flex h-8 items-center justify-between border-t border-slate-100"><Skeleton className="h-2.5 w-20" /><Skeleton className="h-3 w-16" /></div>
      </div>
    </div>

  </div>;
}

export function OverviewSkeleton({ locale }: { locale: 'he' | 'en' }) {
  return <div data-page-loading role="status" className="flex flex-col gap-6">
    <span className="sr-only">{locale === 'he' ? 'טוען את התיק' : 'Loading portfolio'}</span>
    <div aria-hidden="true" className={styles.surface}>
      <div className={styles.balance}><Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-24" /><Skeleton className="h-5 w-24" /></div>
      <div className={styles.workspace}>
        {[0, 1].map(index => <div key={index} className={styles.pane}>
          <Skeleton className="h-4 w-36" />
          <Skeleton className={index === 0 ? 'mt-4 h-12 w-52 max-w-full sm:h-16' : 'mt-4 h-9 w-40 max-w-full'} />
          <Skeleton className="mt-4 h-2 w-full" /><Skeleton className="mt-3 h-4 w-2/3" />
        </div>)}
      </div>
      <div className="flex h-11 items-center justify-between border-t px-4 sm:px-6"><Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-16" /></div>
    </div>
    <ProposalSkeleton />
    <DashboardSurface className="p-4 sm:p-5">
      <div aria-hidden="true" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><Skeleton className="h-7 w-32" /><Skeleton className="h-11 rounded-lg sm:w-56" /></div>
        <div className="flex h-11 items-center justify-between"><Skeleton className="h-7 w-20" /><Skeleton className="h-3 w-28" /></div>
        <div className="space-y-2 xl:hidden">
          {[0, 1].map(row => <div key={row} className="holding-card p-4 sm:px-5">
            <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-xl" /><div><Skeleton className="h-4 w-14" /><Skeleton className="mt-2 h-3 w-20" /></div></div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map(cell => <div key={cell} className="space-y-2 py-1"><Skeleton className="h-3 w-16" /><Skeleton className="h-5 w-20" /></div>)}
            </div>
            <Skeleton className="mt-3 h-20 rounded-lg" />
          </div>)}
        </div>
        <div className="hidden divide-y xl:block">
          {[0, 1, 2].map(row => <div key={row} className="grid h-[68px] grid-cols-7 items-center gap-3 px-3">
            {Array.from({ length: 7 }, (_, cell) => <Skeleton key={cell} className="h-4 w-16 max-w-full" />)}
          </div>)}
        </div>
      </div>
    </DashboardSurface>
  </div>;
}
