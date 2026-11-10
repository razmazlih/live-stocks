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
      <Link key={item.key} href={item.href} aria-current={isActive ? 'page' : undefined}
        className={cn('group flex min-h-11 min-w-0 items-center rounded-xl font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2', mobile ? 'flex-col justify-center gap-1 px-1 py-2 text-xs' : 'gap-3 px-4 py-3 text-sm', isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950')}>
        <Icon aria-hidden="true" className={cn('h-5 w-5 shrink-0', isActive ? 'text-blue-600' : 'text-slate-500')} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  return <>
    <aside className="hidden w-[216px] shrink-0 border-e border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <Link href="/" aria-label="LiveStocks" className="flex h-24 shrink-0 items-center gap-2 px-6 text-slate-950">
        <Image src="/brand/livestocks.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
        <span className="text-xl font-bold tracking-tight">LiveStocks</span>
      </Link>
      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-2" aria-label={dashboardLabel}>
        {primaryItems.map((item) => navigationLink(item))}
      </nav>
      {settings ? <div className="border-t border-slate-100 px-3 py-4">{navigationLink(settings)}</div> : null}
    </aside>
    <nav className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg shadow-slate-300/20 backdrop-blur lg:hidden" aria-label={dashboardLabel}>
      <div className="grid grid-cols-4 gap-1">{primaryItems.map((item) => navigationLink(item, true))}</div>
    </nav>
  </>;
}
