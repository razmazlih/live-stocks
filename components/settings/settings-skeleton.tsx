import { DashboardSurface } from '@/components/dashboard/page-primitives';
import { LinkingStatusSkeleton, SignInMethodsSkeleton } from './account-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

function FieldSkeleton({ hintLines = 0 }: { hintLines?: number }) {
  return <div className="space-y-2">
    <div className="flex h-6 items-center"><Skeleton className="h-4 w-24" /></div>
    <Skeleton className="h-11 w-full rounded-2xl" />
    {Array.from({ length: hintLines }, (_, line) => <div className="flex h-4 items-center" key={line}><Skeleton className="h-3 w-3/4" /></div>)}
  </div>;
}

export function SettingsFormSkeleton({ locale, demo }: { locale: 'he' | 'en'; demo?: boolean }) {
  return <div data-page-loading role="status" aria-label={locale === 'he' ? 'טוען הגדרות' : 'Loading settings'} className="space-y-8">
    {demo && <Skeleton className="h-[104px] w-full rounded-xl md:h-16" />}
    <div className="grid gap-6 md:grid-cols-2"><FieldSkeleton hintLines={1} /><FieldSkeleton /></div>
    <FieldSkeleton hintLines={2} />
    <FieldSkeleton />
    <div className="flex gap-3"><Skeleton className="h-11 w-20" /><Skeleton className="h-11 w-20" /></div>
  </div>;
}

function AccountEntrySkeleton() {
  return <div className="space-y-6">
    <DashboardSurface>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1"><Skeleton className="h-7 w-32" /><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-24" /></div>
        <Skeleton className="h-11 w-20" />
      </div>
      <div className="mt-4 space-y-1"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-48" /></div>
      <div className="mt-5 space-y-4 border-t pt-5"><Skeleton className="h-6 w-44" /><LinkingStatusSkeleton /></div>
      <div className="mt-5 space-y-4 border-t pt-5"><Skeleton className="h-6 w-24" /><SignInMethodsSkeleton /></div>
    </DashboardSurface>
    <DashboardSurface>
      <div className="space-y-4"><Skeleton className="h-7 w-36" /><Skeleton className="h-5 w-44" />
        <FieldSkeleton /><Skeleton className="h-8 w-full" /><Skeleton className="h-11 w-28" /></div>
    </DashboardSurface>
    <DashboardSurface>
      <div className="space-y-4"><Skeleton className="h-7 w-36" /><Skeleton className="h-5 w-2/3" /><Skeleton className="h-11 w-40" /></div>
    </DashboardSurface>
    <DashboardSurface>
      <div className="space-y-4"><Skeleton className="h-7 w-36" /><Skeleton className="h-10 w-4/5" />
        <FieldSkeleton /><Skeleton className="h-11 w-28" /><Skeleton className="h-4 w-1/2" /></div>
    </DashboardSurface>
  </div>;
}

export function SettingsEntryContent({ locale, demo = false }: { locale: 'he' | 'en'; demo?: boolean }) {
  return <>
    {demo ? <DashboardSurface>
      <Skeleton className="h-7 w-32" />
      <div className="mt-2 flex h-24 flex-col justify-around sm:h-12">
        <Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-full sm:hidden" /><Skeleton className="h-3 w-2/3 sm:hidden" />
      </div>
      <Skeleton className="mt-4 h-11 w-24" />
    </DashboardSurface> : <AccountEntrySkeleton />}
    <DashboardSurface>
      <Skeleton className="h-7 w-24" />
      <Skeleton className="mt-1 h-5 w-2/3" />
      <Skeleton className="mb-2 mt-5 h-5 w-32" />
      <div className="grid max-w-lg grid-cols-3 gap-2">
        {[0, 1, 2].map(item => <Skeleton key={item} className="h-20 rounded-2xl" />)}
      </div>
      <div className="mt-5 flex items-center justify-between gap-5 border-t pt-5">
        <div className="space-y-2"><Skeleton className="h-5 w-28" /><Skeleton className="h-5 w-40" /></div>
        <Skeleton className="h-5 w-10 rounded-full" />
      </div>
    </DashboardSurface>
    <section aria-hidden className="space-y-4 rounded-2xl border p-5">
      <div><Skeleton className="h-6 w-32" /><div className="mt-1 flex h-12 flex-col justify-around sm:h-6">
        <Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3 sm:hidden" />
      </div></div>
      <div className="flex flex-wrap gap-2 rounded-xl border p-3">
        <Skeleton className="h-11 min-w-40 flex-1" /><Skeleton className="h-11 w-24" /><Skeleton className="h-11 w-20" />
      </div>
      <div className="flex gap-2"><Skeleton className="h-11 flex-1" /><Skeleton className="h-11 w-24" /></div>
    </section>
    <DashboardSurface><SettingsFormSkeleton locale={locale} demo={demo} /></DashboardSurface>
  </>;
}
