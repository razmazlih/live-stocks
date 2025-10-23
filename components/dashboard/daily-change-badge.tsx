import { ReactNode } from 'react';
import { Chip } from '@heroui/react';

import { cn } from '@/lib/utils';

type ChipColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
type ChipVariant = 'solid' | 'bordered' | 'light' | 'flat' | 'faded' | 'shadow' | 'dot';

interface DailyChangeBadgeProps {
  color: ChipColor;
  variant?: ChipVariant;
  icon: ReactNode;
  value: string;
  label: string;
  className?: string;
}

export function DailyChangeBadge({ color, variant = 'flat', icon, value, label, className }: DailyChangeBadgeProps) {
  return (
    <Chip
      as="span"
      radius="full"
      color={color}
      variant={variant}
      startContent={icon}
      className={cn('gap-2 px-3 py-2 text-xs font-semibold sm:text-sm', className)}
    >
      <span>{value}</span>
      <span className="text-xs font-medium opacity-80">{label}</span>
    </Chip>
  );
}
