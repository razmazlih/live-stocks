import { Skeleton } from '@/components/ui/skeleton';

export function WatchlistSkeleton({ label }: { label: string }) {
  return <section aria-busy="true" aria-label={label} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="space-y-4 border-b border-slate-200 p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-48" /></div>
        <Skeleton className="h-11 w-full rounded-xl sm:max-w-[280px]" />
      </div>
      <Skeleton className="h-[52px] rounded-xl" />
    </div>
    <div className="grid xl:grid-cols-[1.12fr_1fr]">
      <div className="min-h-[430px] xl:min-h-[650px]">
        <div className="space-y-2 p-5"><Skeleton className="h-6 w-40" /><Skeleton className="h-3 w-52" /></div>
        {[0, 1, 2, 3].map(row => <div key={row} className="flex h-[84px] items-center gap-3 border-t border-slate-100 px-4 sm:h-[76px]">
          <Skeleton className="h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-14" /><Skeleton className="h-3 w-24" /></div>
          <Skeleton className="h-4 w-14" /><Skeleton className="hidden h-4 w-16 sm:block" />
        </div>)}
      </div>
      <div className="hidden space-y-5 border-s border-slate-200 p-6 xl:block"><Skeleton className="h-8 w-32" /><Skeleton className="h-36 rounded-2xl" /><Skeleton className="h-[200px] rounded-xl" /></div>
    </div>
  </section>;
}
