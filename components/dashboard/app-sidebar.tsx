'use client';

import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { LineChart, MoreHorizontal, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AppRouteItem, AppRouteKey } from './navigation';

interface AppSidebarProps {
  items: AppRouteItem[];
  activeKey: AppRouteKey;
  locale: 'he' | 'en';
}

const PRIMARY_KEYS: AppRouteKey[] = ['dashboard', 'positions', 'portfolio', 'watchlist'];
const GROUPS: { keys: AppRouteKey[]; he: string; en: string }[] = [
  { keys: PRIMARY_KEYS, he: 'ניהול התיק', en: 'Your portfolio' },
  { keys: ['insights', 'realized', 'exceptions', 'aiPrompts'], he: 'ניתוח', en: 'Analysis' },
  { keys: ['settings'], he: 'הגדרות', en: 'Settings' },
];

export function AppSidebar({ items, activeKey, locale }: AppSidebarProps) {
  const dashboardLabel = locale === 'he' ? 'ניווט ראשי' : 'Primary navigation';
  const moreLabel = locale === 'he' ? 'עוד' : 'More';
  const primaryItems = PRIMARY_KEYS.flatMap((key) => items.filter((item) => item.key === key));
  const secondaryItems = items.filter((item) => !PRIMARY_KEYS.includes(item.key));
  const moreActive = secondaryItems.some((item) => item.key === activeKey);
  const mobileLabels = locale === 'he'
    ? { dashboard: 'בית', positions: 'פוזיציות', portfolio: 'תיק', watchlist: 'מעקב' }
    : { dashboard: 'Home', positions: 'Positions', portfolio: 'Portfolio', watchlist: 'Watchlist' };

  function navigationLink(item: AppRouteItem, mobile = false) {
    const Icon = item.icon;
    const isActive = item.key === activeKey;
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group flex min-h-[44px] min-w-0 items-center rounded-xl font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
          mobile ? 'flex-col justify-center gap-1 px-1 py-2 text-[10px] sm:text-xs' : 'gap-3 px-3 py-2 text-sm',
          isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
        )}
      >
        <Icon aria-hidden="true" className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-blue-600' : 'text-slate-500')} />
        <span className="truncate">{mobile ? mobileLabels[item.key as keyof typeof mobileLabels] : item.label}</span>
        {!mobile && isActive ? <span aria-hidden="true" className="ms-auto h-1.5 w-1.5 rounded-full bg-blue-600" /> : null}
      </Link>
    );
  }

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-x border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <Link href="/" aria-label="LiveStocks" className="flex h-[76px] shrink-0 items-center gap-3 border-b border-slate-100 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <LineChart aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-slate-950">LiveStocks</p>
            <p className="text-xs text-slate-500">{locale === 'he' ? 'התיק שלך, במבט אחד' : 'Your portfolio, at a glance'}</p>
          </div>
        </Link>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label={dashboardLabel}>
          {GROUPS.map((group) => (
            <div key={group.en}>
              <p className="mb-2 px-3 text-xs font-medium text-slate-400">{group[locale]}</p>
              <div className="space-y-1">{items.filter((item) => group.keys.includes(item.key)).map((item) => navigationLink(item))}</div>
            </div>
          ))}
        </nav>
      </aside>

      <nav className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg shadow-slate-300/30 backdrop-blur lg:hidden" aria-label={dashboardLabel}>
        <div className="grid grid-cols-5 gap-1">
          {primaryItems.map((item) => navigationLink(item, true))}
          <Dialog.Root>
            <Dialog.Trigger aria-current={moreActive ? 'page' : undefined} className={cn('flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors duration-150 sm:text-xs', moreActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50')}>
              <MoreHorizontal aria-hidden="true" className="h-[18px] w-[18px]" />
              <span>{moreLabel}</span>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-200" />
              <Dialog.Content dir={locale === 'he' ? 'rtl' : 'ltr'} className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom sm:inset-x-[15%]">
                <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <Dialog.Title className="font-semibold text-slate-950">{locale === 'he' ? 'כלים נוספים' : 'More tools'}</Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-slate-500">{locale === 'he' ? 'ניתוח התיק והתאמה אישית' : 'Portfolio analysis and preferences'}</Dialog.Description>
                  </div>
                  <Dialog.Close className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors duration-150 hover:bg-slate-100" aria-label={locale === 'he' ? 'סגירה' : 'Close'}><X aria-hidden="true" className="h-5 w-5" /></Dialog.Close>
                </div>
                <nav aria-label={locale === 'he' ? 'ניווט נוסף' : 'More navigation'} className="space-y-1">
                  {secondaryItems.map((item) => <Dialog.Close asChild key={item.key}>{navigationLink(item)}</Dialog.Close>)}
                </nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </nav>
    </>
  );
}
