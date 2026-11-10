'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WATCHLIST_TIME_RANGES } from '@/lib/display/time-ranges';
import { cn } from '@/lib/utils';
import type { TimeRange } from '@/types';

interface TimeRangeTabsProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  ranges?: readonly TimeRange[];
  labels?: Partial<Record<TimeRange, string>>;
  className?: string;
  dir?: 'rtl' | 'ltr';
}

const DEFAULT_RANGES: readonly TimeRange[] = [...WATCHLIST_TIME_RANGES, 'All'];

export function TimeRangeTabs({ value, onChange, ranges = DEFAULT_RANGES, labels, className, dir = 'ltr' }: TimeRangeTabsProps) {
  return <Tabs dir={dir} value={value} onValueChange={(next) => onChange(next as TimeRange)} className={cn('min-w-0 max-w-full', className)}>
    <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl bg-slate-100/90 p-1 [scrollbar-width:thin]">
      <TabsList className="grid h-auto w-full min-w-0 grid-cols-4 gap-1 sm:flex sm:w-max sm:min-w-full sm:flex-nowrap sm:justify-start rounded-none bg-transparent p-0">
        {ranges.map((range) => <TabsTrigger key={range} value={range} className="min-h-11 min-w-0 flex-1 shrink-0 rounded-lg border border-transparent px-2 sm:min-w-11 sm:px-3 py-2 text-xs font-medium text-slate-500 shadow-none transition-colors hover:bg-white/70 hover:text-slate-900 data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">
          {labels?.[range] ?? range}
        </TabsTrigger>)}
      </TabsList>
    </div>
  </Tabs>;
}
