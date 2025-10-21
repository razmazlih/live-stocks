import { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DashboardQuickAction {
  key: string;
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: ComponentProps<typeof Button>['variant'];
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
  ariaLabel?: string;
}

interface DashboardQuickActionsProps {
  actions: DashboardQuickAction[];
  className?: string;
}

export function DashboardQuickActions({ actions, className }: DashboardQuickActionsProps) {
  if (!actions.length) {
    return null;
  }

  return (
    <div className={cn('mt-4 flex flex-wrap gap-3', className)}>
      {actions.map((action) => {
        const Icon = action.icon;
        const buttonContent: ReactNode = action.href ? (
          <Link href={action.href}>
            <Icon className={cn('h-4 w-4', action.iconClassName)} />
            <span className={cn(action.labelClassName)}>{action.label}</span>
          </Link>
        ) : (
          <>
            <Icon className={cn('h-4 w-4', action.iconClassName)} />
            <span className={cn(action.labelClassName)}>{action.label}</span>
          </>
        );

        return (
          <Button
            key={action.key}
            size="sm"
            variant={action.variant}
            asChild={Boolean(action.href)}
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.ariaLabel ?? action.label}
            className={cn('gap-2', action.className)}
          >
            {buttonContent}
          </Button>
        );
      })}
    </div>
  );
}
