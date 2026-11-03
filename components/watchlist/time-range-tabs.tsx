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

export function TimeRangeTabs({
  value,
  onChange,
  ranges = WATCHLIST_TIME_RANGES,
  labels,
  className,
}: TimeRangeTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as TimeRange)}
      className={cn('w-full', className)}
    >
      <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 sm:flex sm:flex-wrap">
        {ranges.map((range) => (
          <TabsTrigger
            key={range}
            value={range}
            className={cn(
              'min-w-0 rounded-md border-0 px-2 py-1 text-xs font-medium text-slate-600 shadow-none transition-colors hover:bg-white data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-none sm:flex-1'
            )}
          >
            {labels?.[range] ?? range}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
