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
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm',
        toneClass,
        className,
      )}
    >
      {icon}
      {value}
      <span className="text-xs font-medium text-muted-foreground/80">{label}</span>
    </span>
  );
}
