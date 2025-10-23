import { ComponentProps, ComponentType, ReactNode } from 'react';
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
    <div className="flex flex-wrap gap-3">
      {actions.map((action) => {
        const Icon = action.icon;
        const linkProps = action.href
          ? { as: Link as unknown as ComponentType, href: action.href }
          : {};

        return (
          <Button
            key={action.key}
            size="sm"
            variant={action.variant}
            color={action.color}
            {...linkProps}
            onPress={action.onClick}
            isDisabled={action.disabled}
            aria-label={action.ariaLabel ?? action.label}
            className={cn('gap-2', action.className)}
          >
            <Icon className={cn('h-4 w-4', action.iconClassName)} />
            <span className={cn(action.labelClassName)}>{action.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
