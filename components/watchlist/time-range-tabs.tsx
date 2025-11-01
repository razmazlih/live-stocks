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
              'rounded-full border border-border bg-[hsl(var(--card))] px-3 py-1 text-xs font-medium transition-colors data-[state=active]:border-transparent data-[state=active]:bg-[hsl(var(--primary))] data-[state=active]:text-[hsl(var(--primary-foreground))]',
              'shadow-sm hover:border-border hover:bg-[hsl(var(--muted))]'
            )}
          >
            {labels?.[range] ?? range}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
