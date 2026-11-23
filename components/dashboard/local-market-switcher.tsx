'use client';

import { useSyncExternalStore } from 'react';
import { subscribeLocalMarketMode, useLocalMarketMode } from '@/hooks/use-local-market-mode';
import { hasLocalDemoLayoutHint, selectLocalMarketMode } from '@/lib/demo/review';
import type { LocalMarketMode } from '@/lib/demo/market-scenarios';
import { Skeleton } from '@/components/ui/skeleton';
import loadingStyles from './overview-skeleton.module.css';

const modes: { value: LocalMarketMode; he: string; en: string }[] = [
  { value: 'realtime', he: 'זמן אמת', en: 'Real time' },
  { value: 'regular', he: 'מסחר רגיל', en: 'Regular hours' },
  { value: 'extended', he: 'מסחר מורחב', en: 'Extended hours' },
  { value: 'closed', he: 'שוק סגור', en: 'Market closed' },
];

const footerClass = 'mt-9 border-t border-slate-200 pt-5 dark:border-slate-800';
const gridClass = 'grid max-w-2xl grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 sm:grid-cols-4 dark:bg-slate-900';
const noServerHint = () => null;

export function LocalMarketFooterSkeleton() {
  const show = useSyncExternalStore(subscribeLocalMarketMode, hasLocalDemoLayoutHint, noServerHint);
  if (process.env.NODE_ENV !== 'development' || show === false) return null;
  return <footer aria-hidden="true" className={footerClass + (show === null ? ' ' + loadingStyles.initialFooter : '')}>
    <div className="mb-2 flex h-5 items-center"><Skeleton className="h-3 w-36" /></div>
    <div className={gridClass}>{modes.map(mode => <div key={mode.value} className="grid min-h-[44px] place-items-center"><Skeleton className="h-3 w-16" /></div>)}</div>
  </footer>;
}

export function LocalMarketSwitcher({ locale }: { locale: 'he' | 'en' }) {
  const selected = useLocalMarketMode();
  if (selected === null) return null;
  return <footer className={footerClass}>
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{locale === 'he' ? 'מצב השוק בדמו המקומי' : 'Local demo market mode'}</legend>
      <div className={gridClass}>
        {modes.map(mode => <label key={mode.value} className="min-w-0 cursor-pointer">
          <input type="radio" name="local-market-mode" value={mode.value} checked={mode.value === selected}
            onChange={() => selectLocalMarketMode(mode.value)} className="peer sr-only" />
          <span className="flex min-h-[44px] items-center justify-center rounded-xl px-2 text-center text-sm font-medium text-slate-600 peer-checked:bg-white peer-checked:font-semibold peer-checked:text-slate-950 peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-blue-500 dark:text-slate-300 dark:peer-checked:bg-slate-700 dark:peer-checked:text-white">
            {mode[locale]}
          </span>
        </label>)}
      </div>
    </fieldset>
  </footer>;
}
