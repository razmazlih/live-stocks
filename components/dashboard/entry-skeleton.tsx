'use client';

import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { StockDetailSkeleton } from '@/app/stock/[symbol]/stock-detail-skeleton';
import { PerformanceSkeleton } from '@/components/portfolio/performance-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { WatchlistSkeleton } from '@/components/watchlist/watchlist-skeleton';
import { translations } from '@/lib/translations';
import { createAppRouteItems } from './navigation';
import { OverviewSkeleton } from './overview-skeleton';
import { DashboardContainer, DashboardMain, DashboardSurface } from './page-primitives';
import { DashboardPageShell } from './page-shell';
import styles from './overview-header.module.css';

const subscribe = () => () => {};
const defaultLocale = () => 'he' as const;
function browserLocale() {
  try { return localStorage.getItem('locale') === 'en' ? 'en' : 'he'; }
  catch { return defaultLocale(); }
}

export function EntrySkeleton() {
  const pathname = usePathname();
  const locale = useSyncExternalStore(subscribe, browserLocale, defaultLocale);
  const items = createAppRouteItems(translations[locale]);
  const stock = pathname.startsWith('/stock/');
  const overview = pathname === '/';
  const performance = pathname === '/portfolio' || pathname === '/realized';
  const activeKey = items.find(item => item.href === pathname)?.key ?? (stock || performance ? 'portfolio' : 'dashboard');

  return <DashboardPageShell direction={locale === 'he' ? 'rtl' : 'ltr'} locale={locale} navigationItems={items} activeKey={activeKey} aria-busy="true">
    {stock ? <StockDetailSkeleton locale={locale} /> : <DashboardContainer>
      <div aria-hidden="true" className={styles.header}>
        <div className={styles.titleRow}>
          <div><div className="flex h-[28.75px] items-center sm:h-[34.5px]"><Skeleton className="h-6 w-36" /></div><div className="mt-[7px] flex h-[1.4em] items-center text-[11px]"><Skeleton className="h-2.5 w-24" /></div></div>
          {overview && <Skeleton className="h-11 w-11 rounded-full" />}
        </div>
        <div className={styles.actions}><Skeleton className="h-11 rounded-full sm:w-32" /><Skeleton className="h-11 rounded-full sm:w-28" /></div>
      </div>
      <DashboardMain className={overview ? 'mt-5' : undefined}>
        {overview ? <OverviewSkeleton locale={locale} /> : performance ? <>
          <Skeleton className="h-12 w-full rounded-xl sm:max-w-sm" />
          <PerformanceSkeleton view={pathname === '/realized' ? 'realized' : 'history'} locale={locale} />
        </> : pathname === '/watchlist' ? <>
          <Skeleton className="h-[76px] rounded-2xl" />
          <WatchlistSkeleton label={translations[locale].watchlist.groups.loading} />
        </> : <DashboardSurface>
          <div role="status"><span className="sr-only">{locale === 'he' ? 'טוען את הדף' : 'Loading page'}</span>
            <Skeleton className="mb-5 h-6 w-36" />
            {[0, 1, 2].map(row => <div key={row} className="flex items-center gap-3 border-t py-5">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" /><div className="grow"><Skeleton className="h-4 w-24" /><Skeleton className="mt-2 h-3 w-32" /></div><Skeleton className="h-5 w-14" />
            </div>)}
          </div>
        </DashboardSurface>}
      </DashboardMain>
    </DashboardContainer>}
  </DashboardPageShell>;
}
