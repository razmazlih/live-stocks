import { CalendarClock, Layers } from 'lucide-react';
import { DashboardContainer, DashboardMain } from '@/components/dashboard/page-primitives';
import { PageHeader } from '@/components/dashboard/page-header';
import type { DashboardQuickAction } from '@/components/dashboard/quick-actions';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { translations } from '@/lib/translations';
import type { Locale } from '@/types';

export function PositionsHeader({ locale, count, quantity, quickActions }: {
  locale: Locale;
  count?: string;
  quantity?: string;
  quickActions?: DashboardQuickAction[];
}) {
  const t = translations[locale];
  return <PageHeader
    title={locale === 'he' ? 'פעילות' : 'Activity'}
    subtitle={locale === 'he' ? 'ניהול העסקאות וההחזקות שלך במקום אחד.' : 'Manage your transactions and holdings in one place.'}
    icon={Layers}
    metaBadges={[
      { key: 'positions', icon: Layers, label: `${t.positions.overviewActivePositions}: ${count ?? '—'}`, loading: count === undefined },
      { key: 'quantity', icon: CalendarClock, label: `${t.positions.overviewTotalQuantity}: ${quantity ?? '—'}`, loading: quantity === undefined },
    ]}
    quickActions={quickActions}
    actions={quickActions ? undefined : <><Skeleton className="h-11 w-28 rounded-lg" /><Skeleton className="h-11 w-10 rounded-lg sm:w-20" /></>}
  />;
}

export const positionsSectionClass = 'rounded-xl border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-5';

export function PositionsSkeleton({ label }: { label: string }) {
  return <div aria-label={label} aria-busy="true" data-page-loading="true" className="space-y-4">
    <Card className="border-slate-200/70 bg-white/90 shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-12">
          {['lg:col-span-5', 'lg:col-span-3', 'lg:col-span-3', 'lg:col-span-1'].map((span, index) => <Skeleton key={index} className={`h-11 rounded-2xl ${span}`} />)}
        </div>
        <div className="flex h-4 items-center justify-between"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-16" /></div>
      </CardContent>
    </Card>
    <div className="space-y-3 lg:hidden">
      {[0, 1].map(index => <Card key={index} className="border-slate-200/70 bg-white/95 shadow-sm">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex h-11 items-center gap-3"><Skeleton className="h-11 w-11 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-16" /></div></div>
          <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map(cell => <div key={cell} className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2"><Skeleton className="h-3 w-12" /><Skeleton className="h-4 w-16" /></div>)}</div>
        </CardHeader>
        <CardContent className="space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-5 w-32" /><div className="grid gap-2 min-[360px]:grid-cols-2"><Skeleton className="h-9 rounded-full" /><Skeleton className="h-9 rounded-full" /></div><Skeleton className="ms-auto h-8 w-16" /></CardContent>
      </Card>)}
    </div>
    <div className="hidden overflow-hidden rounded-xl border border-slate-200 lg:block">
      {[0, 1, 2, 3].map(row => <div key={row} className={`grid grid-cols-7 items-center gap-5 border-b border-slate-100 px-4 ${row ? 'h-20' : 'h-12 bg-slate-50'}`}>{[0, 1, 2, 3, 4, 5, 6].map(col => <Skeleton key={col} className="h-3 w-3/4" />)}</div>)}
    </div>
  </div>;
}

export function PositionsRouteSkeleton({ locale }: { locale: Locale }) {
  return <DashboardContainer>
    <PositionsHeader locale={locale} />
    <DashboardMain><section className={positionsSectionClass}><PositionsSkeleton label={translations[locale].common.loading} /></section></DashboardMain>
  </DashboardContainer>;
}
