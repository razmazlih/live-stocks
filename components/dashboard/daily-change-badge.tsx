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
      startContent={<span className="flex items-center text-base">{icon}</span>}
      className={cn('h-auto rounded-full px-3 py-2 font-semibold shadow-sm backdrop-blur', className)}
      classNames={{
        base: cn('border-none text-xs sm:text-sm', toneClass),
        content:
          'flex flex-col gap-0.5 text-right leading-tight sm:flex-row sm:items-center sm:gap-2 sm:text-xs sm:[&>*:first-child]:text-sm',
      }}
    >
      <span>{value}</span>
      <span className="text-[0.7rem] font-medium opacity-80 sm:text-xs">{label}</span>
    </Chip>
  );
}
