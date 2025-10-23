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
        const commonProps = {
          size: 'sm' as const,
          variant: action.variant ?? 'flat',
          color: action.color ?? 'primary',
          startContent: <Icon className={cn('h-4 w-4', action.iconClassName)} />,
          className: cn('gap-2 font-medium', action.className),
          isDisabled: action.disabled,
          'aria-label': action.ariaLabel ?? action.label,
        };

        if (action.href) {
          return (
            <Button key={action.key} {...commonProps} as={Link} href={action.href}>
              <span className={cn(action.labelClassName)}>{action.label}</span>
            </Button>
          );
        }

        return (
          <Button key={action.key} {...commonProps} onPress={action.onClick}>
            <span className={cn(action.labelClassName)}>{action.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
