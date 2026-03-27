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
      <TabsList className="flex w-full max-w-full snap-x snap-mandatory items-stretch justify-start gap-1 overflow-x-auto rounded-[20px] border border-[color:var(--color-slate-200)] bg-[color:var(--color-slate-50)]/90 p-1 shadow-sm [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:justify-center md:overflow-visible">
        {ranges.map((range) => (
          <TabsTrigger
            key={range}
            value={range}
            className={cn(
              'min-h-10 min-w-[3.25rem] shrink-0 snap-center rounded-full border border-transparent bg-transparent px-3 py-2 text-[0.78rem] font-semibold tabular-nums tracking-tight text-slate-600 transition-all touch-manipulation sm:min-h-11 sm:px-4 sm:text-sm',
              'hover:border-slate-200 hover:bg-white hover:text-slate-900 hover:shadow-sm',
              'data-[state=active]:border-[color:var(--color-slate-200)] data-[state=active]:bg-[color:var(--color-neutral-white)] data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-[color:var(--color-slate-200)]/70',
              'dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-100',
              'dark:data-[state=active]:border-slate-600 dark:data-[state=active]:bg-slate-100 dark:data-[state=active]:text-slate-900'
            )}
          >
            {labels?.[range] ?? range}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
