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
}

const DEFAULT_RANGES: readonly TimeRange[] = [...WATCHLIST_TIME_RANGES, 'All'];

export function TimeRangeTabs({ value, onChange, ranges = DEFAULT_RANGES, labels, className }: TimeRangeTabsProps) {
  return <Tabs value={value} onValueChange={(next) => onChange(next as TimeRange)} className={cn('min-w-0 max-w-full', className)}>
    <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white [scrollbar-width:thin]">
      <TabsList className="grid h-auto w-full min-w-0 grid-cols-4 gap-0 sm:flex sm:w-max sm:min-w-full sm:flex-nowrap sm:justify-start rounded-none bg-transparent p-0.5">
        {ranges.map((range) => <TabsTrigger key={range} value={range} className="min-h-11 min-w-0 shrink-0 rounded-lg border-0 px-2 sm:min-w-11 sm:px-3 py-2 text-xs font-medium text-slate-600 shadow-none transition-colors hover:bg-slate-50 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-none">
          {labels?.[range] ?? range}
        </TabsTrigger>)}
      </TabsList>
    </div>
  </Tabs>;
}
