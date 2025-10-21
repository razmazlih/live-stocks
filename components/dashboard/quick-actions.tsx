import { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const quickActionBaseClasses =
  'gap-2 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:ring-slate-500/60';

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
}

export function DashboardQuickActions({ actions }: DashboardQuickActionsProps) {
  if (!actions.length) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {actions.map((action) => {
        const Icon = action.icon;
        const buttonContent: ReactNode = action.href ? (
          <Link href={action.href}>
            <Icon className={cn('h-4 w-4', action.iconClassName)} />
            <span className={cn('whitespace-nowrap', action.labelClassName)}>{action.label}</span>
          </Link>
        ) : (
          <>
            <Icon className={cn('h-4 w-4', action.iconClassName)} />
            <span className={cn('whitespace-nowrap', action.labelClassName)}>{action.label}</span>
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
            className={cn(quickActionBaseClasses, action.className)}
          >
            {buttonContent}
          </Button>
        );
      })}
    </div>
  );
}
