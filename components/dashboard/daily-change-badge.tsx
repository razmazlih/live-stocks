import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface DailyChangeBadgeProps {
  toneClass: string;
  icon: ReactNode;
  value: string;
  label: string;
  className?: string;
}

export function DailyChangeBadge({ toneClass, icon, value, label, className }: DailyChangeBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-9 max-w-full min-w-0 flex-shrink-0 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-full border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-neutral-white)]/90 px-3 py-1.5 text-[11px] font-medium leading-tight shadow-sm backdrop-blur-sm sm:px-3.5 sm:text-xs',
        toneClass,
        className
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="whitespace-nowrap font-semibold tabular-nums tracking-tight">{value}</span>
      <span className="max-w-full text-balance text-[color:var(--color-slate-600)]">{label}</span>
    </span>
  );
}
