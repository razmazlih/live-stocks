import { Eye } from 'lucide-react';
import type { ReactNode } from 'react';
import { DashboardContainer } from '@/components/dashboard/page-primitives';
import { PageHeader } from '@/components/dashboard/page-header';
import { translations } from '@/lib/translations';
import type { Locale } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';

export function WatchlistHeader({ locale, actions }: { locale: Locale; actions?: ReactNode }) {
  const he = locale === 'he';
  return <PageHeader className="[&_h1]:text-[32px] sm:[&_h1]:text-[40px]" title={he ? 'המעקב שלי' : 'My watchlist'} subtitle={he ? 'המניות שמעניינות אותך, במקום אחד.' : 'The stocks on your radar, in one place.'} icon={Eye}
    actions={actions ?? <><Skeleton className="h-11 w-32 rounded-xl" /><Skeleton className="h-11 w-11 rounded-xl" /></>} />;
}

export function WatchlistGroupSkeleton({ label }: { label: string }) {
  return <div aria-busy="true" aria-label={label} className="flex h-14 items-center gap-2 px-3"><Skeleton className="h-9 w-24 rounded-lg" /><Skeleton className="h-9 w-16 rounded-lg" /></div>;
}

export function WatchlistRouteSkeleton({ locale }: { locale: Locale }) {
  const label = translations[locale].watchlist.groups.loading;
  return <DashboardContainer>
    <WatchlistHeader locale={locale} />
    <main className="mt-5 space-y-5">
      <div className="flex items-center justify-between"><WatchlistGroupSkeleton label={label} /><Skeleton className="h-11 w-24 rounded-lg" /></div>
      <WatchlistSkeleton label={label} />
    </main>
  </DashboardContainer>;
}

export function WatchlistSkeleton({ label }: { label: string }) {
  return <section data-page-loading="true" aria-busy="true" aria-label={label} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="space-y-4 border-b border-slate-200 p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><div className="flex h-5 items-center"><Skeleton className="h-3.5 w-28" /></div><div className="mt-1 flex h-5 items-center"><Skeleton className="h-3 w-48" /></div></div>
        <Skeleton className="h-11 w-full rounded-xl sm:max-w-[280px]" />
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="grid h-[102px] flex-1 grid-cols-4 items-center gap-1 rounded-xl bg-slate-100/90 p-1 sm:h-[54px] sm:grid-cols-8">
          {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="mx-auto h-3 w-1/2" />)}
        </div>
        <Skeleton className="h-[52px] w-11 rounded-xl sm:w-24" />
      </div>
    </div>
    <div className="grid xl:grid-cols-[1.12fr_1fr]">
      <div className="min-h-[430px] xl:min-h-[650px]">
        <div className="px-4 pb-4 pt-5 sm:px-5"><div className="flex h-7 items-center"><Skeleton className="h-5 w-40" /></div><div className="mt-1 flex h-4 items-center"><Skeleton className="h-3 w-52" /></div></div>
        <div className="hidden h-7 items-start justify-between border-b border-slate-100 px-4 sm:flex">{[0, 1, 2, 3, 4].map(col => <Skeleton key={col} className="h-3 w-12" />)}</div>
        {[0, 1, 2, 3].map(row => <div key={row} className="flex h-[84px] items-center gap-3 border-t border-slate-100 px-4 sm:h-[76px]">
          <Skeleton className="h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-14" /><Skeleton className="h-3 w-24" /></div>
          <Skeleton className="h-4 w-14" /><Skeleton className="hidden h-4 w-16 sm:block" />
        </div>)}
      </div>
      <div className="hidden space-y-5 border-s border-slate-200 p-6 xl:block"><Skeleton className="h-8 w-32" /><Skeleton className="h-36 rounded-2xl" /><Skeleton className="h-[200px] rounded-xl" /></div>
    </div>
  </section>;
}
