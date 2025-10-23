import { ReactNode } from 'react';

import { Chip } from '@heroui/react';

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
    <Chip
      size="sm"
      variant="flat"
      startContent={icon}
      className={cn('gap-2 px-3 py-1 text-xs font-semibold sm:text-sm', toneClass, className)}
    >
      <span>{value}</span>
      <span className="text-[0.7rem] font-medium text-foreground/70 sm:text-xs">{label}</span>
    </Chip>
  );
}
