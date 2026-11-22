'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { StockDetailSkeleton } from '@/app/stock/[symbol]/stock-detail-skeleton';
import { PerformanceHeader, PerformanceTabsList } from '@/components/portfolio/performance-navigation';
import { PerformanceSkeleton } from '@/components/portfolio/performance-skeleton';
import { PositionsRouteSkeleton } from '@/components/portfolio/positions-route-skeleton';
import { SyncReviewEntrySkeleton } from '@/components/positions/sync-review-skeleton';
import { SettingsHeader } from '@/components/settings/settings-header';
import { readDemoEntryLocale, readPersonalLocale } from '@/lib/entry-locale';
import { SettingsEntryContent } from '@/components/settings/settings-skeleton';
import { Tabs } from '@/components/ui/tabs';
import { WatchlistRouteSkeleton } from '@/components/watchlist/watchlist-skeleton';
import { parsePerformanceView } from '@/lib/performance-display';
import { translations } from '@/lib/translations';
import type { Locale } from '@/types';
import { createAppRouteItems } from './navigation';
import { OverviewHeader } from './overview-header';
import { OverviewSkeleton } from './overview-skeleton';
import { DashboardContainer, DashboardMain } from './page-primitives';
import { DashboardPageShell } from './page-shell';

const subscribe = () => () => {};
const defaultLocale = () => 'he' as const;
const browserLocale = () => readDemoEntryLocale() ?? readPersonalLocale();
const serverIsDemo = () => false;
const browserIsDemo = () => readDemoEntryLocale() !== null;

function PerformanceEntry({ locale, view }: { locale: Locale; view: ReturnType<typeof parsePerformanceView> }) {
  return <DashboardContainer>
    <PerformanceHeader locale={locale} />
    <DashboardMain>
      <Tabs value={view} dir={locale === 'he' ? 'rtl' : 'ltr'}>
        <PerformanceTabsList locale={locale} disabled />
        <PerformanceSkeleton view={view} locale={locale} />
      </Tabs>
    </DashboardMain>
  </DashboardContainer>;
}

function RequestedPerformanceEntry({ locale }: { locale: Locale }) {
  return <PerformanceEntry locale={locale} view={parsePerformanceView(useSearchParams())} />;
}

function SettingsEntry({ locale }: { locale: Locale }) {
  const demo = useSyncExternalStore(subscribe, browserIsDemo, serverIsDemo);
  return <DashboardContainer>
    <SettingsHeader locale={locale} />
    <DashboardMain><SettingsEntryContent locale={locale} demo={demo} /></DashboardMain>
  </DashboardContainer>;
}

function EntryContent({ pathname, locale }: { pathname: string; locale: Locale }) {
  if (pathname.startsWith('/stock/')) return <StockDetailSkeleton locale={locale} />;
  if (pathname === '/portfolio') return <RequestedPerformanceEntry locale={locale} />;
  if (pathname === '/realized') return <PerformanceEntry view="realized" locale={locale} />;
  if (pathname === '/exceptions') return <PerformanceEntry view="targets" locale={locale} />;
  if (pathname === '/insights') return <PerformanceEntry view="history" locale={locale} />;
  if (pathname === '/watchlist') return <WatchlistRouteSkeleton locale={locale} />;
  if (pathname === '/positions') return <PositionsRouteSkeleton locale={locale} />;
  if (pathname === '/settings') return <SettingsEntry locale={locale} />;

  return <DashboardContainer>
    <OverviewHeader locale={locale} lastUpdate={null} loading refreshing={false} />
    <DashboardMain className="mt-5"><OverviewSkeleton locale={locale} /></DashboardMain>
  </DashboardContainer>;
}

export function EntrySkeleton() {
  const pathname = usePathname();
  const locale = useSyncExternalStore(subscribe, browserLocale, defaultLocale);
  if (pathname === '/positions/sync') return <SyncReviewEntrySkeleton />;
  const items = createAppRouteItems(translations[locale]);
  const activeKey = items.find(item => item.href === pathname)?.key ?? (pathname === '/ai-prompts' ? 'dashboard' : 'portfolio');

  return <DashboardPageShell direction={locale === 'he' ? 'rtl' : 'ltr'} locale={locale}
    navigationItems={items} activeKey={activeKey} aria-busy="true" data-page-loading>
    <EntryContent pathname={pathname} locale={locale} />
  </DashboardPageShell>;
}
