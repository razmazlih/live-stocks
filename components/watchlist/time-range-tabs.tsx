'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { TimeRange } from '@/types';

interface TimeRangeTabsProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  ranges?: TimeRange[];
  labels?: Partial<Record<TimeRange, string>>;
  className?: string;
}

const DEFAULT_RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y'];

export function TimeRangeTabs({
  value,
  onChange,
  ranges = DEFAULT_RANGES,
  labels,
  className,
}: TimeRangeTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as TimeRange)}
      className={cn('w-full', className)}
    >
      <TabsList className="flex flex-wrap gap-2 rounded-none bg-transparent p-0">
        {ranges.map((range) => (
          <TabsTrigger
            key={range}
            value={range}
            className={cn(
              'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium transition-colors data-[state=active]:border-transparent data-[state=active]:bg-slate-900 data-[state=active]:text-white dark:border-[color:var(--color-primary-200)]/50 dark:bg-[color:var(--color-primary-010)]/80 dark:data-[state=active]:bg-[color:var(--color-primary-500)]/30 dark:data-[state=active]:text-white',
              'shadow-sm hover:border-slate-300 hover:bg-slate-100 dark:hover:border-[color:var(--color-primary-300)]/50 dark:hover:bg-[color:var(--color-primary-025)]/75'
            )}
          >
            {labels?.[range] ?? range}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
