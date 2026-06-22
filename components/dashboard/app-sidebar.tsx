import Link from 'next/link';
import { LineChart } from 'lucide-react';

import type { AppRouteItem, AppRouteKey } from './navigation';

interface AppSidebarProps {
  items: AppRouteItem[];
  activeKey: AppRouteKey;
  locale: 'he' | 'en';
}

export function AppSidebar({ items, activeKey, locale }: AppSidebarProps) {
  const dashboardLabel = locale === 'he' ? 'ניווט ראשי' : 'Primary navigation';
  const statusLabel = locale === 'he' ? 'סטטוס מסחר' : 'Market status';
  const subtitle = locale === 'he' ? 'Portfolio OS' : 'Portfolio OS';

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-x border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-[72px] items-center gap-3 border-b border-slate-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <LineChart className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-slate-950">LiveStocks</p>
            <p className="text-xs font-medium text-slate-500">{subtitle}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label={dashboardLabel}>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeKey;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-700'}`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <p className="text-xs font-semibold text-slate-700">{statusLabel}</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">NASDAQ · 10:30 AM</p>
          </div>
        </div>
      </aside>

      <nav
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-lg shadow-slate-200/70 backdrop-blur lg:hidden"
        aria-label={dashboardLabel}
      >
        <div className="flex snap-x gap-1 overflow-x-auto overscroll-x-contain scroll-px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeKey;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex min-w-[76px] shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100 after:absolute after:inset-x-4 after:top-1 after:h-0.5 after:rounded-full after:bg-blue-500'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="max-w-[68px] truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
