'use client';

import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { AppRouteItem, AppRouteKey } from './navigation';

interface AppSidebarProps {
  items: AppRouteItem[];
  activeKey: AppRouteKey;
  locale: 'he' | 'en';
}

const PRIMARY_KEYS: AppRouteKey[] = ['dashboard', 'positions', 'portfolio', 'watchlist'];

export function AppSidebar({ items, activeKey, locale }: AppSidebarProps) {
  const dashboardLabel = locale === 'he' ? 'ניווט ראשי' : 'Primary navigation';
  const primaryItems = PRIMARY_KEYS.flatMap((key) => items.filter((item) => item.key === key));
  const settings = items.find((item) => item.key === 'settings');

  function navigationLink(item: AppRouteItem, mobile = false) {
    const Icon = item.icon;
    const isActive = item.key === activeKey;
    return (
      <Link key={item.key} href={item.href} aria-current={isActive ? 'page' : undefined} data-active={isActive ? 'true' : undefined}
        className={cn('glass-navigation-link group flex min-h-[44px] min-w-0 items-center rounded-xl font-medium transition-[color,background-color,box-shadow,transform] duration-200 active:scale-[.98] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', mobile ? 'flex-col justify-center gap-1 px-1 py-2 text-[11px] sm:text-xs' : 'gap-3 px-4 py-3 text-sm')}>
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  return <>
    <aside className="workspace-rail hidden w-[204px] shrink-0 border-e lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col">
      <Link href="/" aria-label="LiveStocks" className="flex h-[82px] shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-5 text-[var(--text-primary)]">
        <Image src="/brand/livestocks.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
        <span className="text-xl font-bold tracking-tight">LiveStocks</span>
      </Link>
      <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-5" aria-label={dashboardLabel}>
        {primaryItems.map((item) => navigationLink(item))}
      </nav>
      {settings ? <div className="border-t border-[var(--border-subtle)] px-3 py-4">{navigationLink(settings)}</div> : null}
    </aside>
    <nav className="glass-navigation workspace-dock fixed inset-x-3 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-[20px] border p-1 lg:hidden" aria-label={dashboardLabel}>
      <div className="grid grid-cols-4 gap-1">{primaryItems.map((item) => navigationLink(item, true))}</div>
    </nav>
  </>;
}
