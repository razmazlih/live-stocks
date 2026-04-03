'use client';

import * as React from 'react';
import { Progress as HeroProgress } from '@heroui/react';

import { cn } from '@/lib/utils';

interface ProgressProps {
  className?: string;
  value?: number;
  max?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, ...props }, ref) => {
    const clampedMax = Number.isFinite(max) && max > 0 ? max : 100;
    const safeValue = Number.isFinite(value) ? value : 0;
    const clampedValue = Math.min(Math.max(safeValue, 0), clampedMax);

    return (
      <HeroProgress
        ref={ref}
        value={clampedValue}
        maxValue={clampedMax}
        className={cn('w-full', className)}
        {...(props as Record<string, unknown>)}
      />
    );
  }
);
Progress.displayName = 'Progress';

export { Progress };
