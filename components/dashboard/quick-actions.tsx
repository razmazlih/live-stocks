import { ComponentProps } from 'react';
import Link from 'next/link';
import { LucideIcon } from 'lucide-react';
import { Button } from '@heroui/react';

import { cn } from '@/lib/utils';

export interface DashboardQuickAction {
  key: string;
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  onPress?: () => void;
  disabled?: boolean;
  variant?: ComponentProps<typeof Button>['variant'];
  color?: ComponentProps<typeof Button>['color'];
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
  ariaLabel?: string;
}

interface DashboardQuickActionsProps {
  actions: DashboardQuickAction[];
}

export function DashboardQuickActions({ actions }: DashboardQuickActionsProps) {
  if (!actions.length) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.key}
            size="sm"
            variant={action.variant}
            color={action.color}
            as={action.href ? Link : undefined}
            href={action.href}
            onPress={action.onPress ?? action.onClick}
            isDisabled={action.disabled}
            aria-label={action.ariaLabel ?? action.label}
            startContent={<Icon className={cn('h-4 w-4', action.iconClassName)} />}
            className={cn('gap-2 font-semibold', action.className)}
          >
            <span className={cn(action.labelClassName)}>{action.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
