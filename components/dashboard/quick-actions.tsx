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
    <div className="mt-5 flex flex-wrap gap-3">
      {actions.map((action) => {
        const Icon = action.icon;
        const baseProps = {
          size: 'sm' as const,
          radius: 'full' as const,
          variant: action.variant ?? 'solid',
          color: action.color,
          className: cn(
            'justify-start gap-2 bg-opacity-90 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-0.5',
            action.className
          ),
          startContent: <Icon className={cn('h-4 w-4', action.iconClassName)} />,
          'aria-label': action.ariaLabel ?? action.label,
          isDisabled: action.disabled,
        } satisfies Partial<ComponentProps<typeof Button>>;

        if (action.href) {
          return (
            <Button
              key={action.key}
              {...baseProps}
              as={Link}
              href={action.href}
            >
              <span className={cn('whitespace-nowrap', action.labelClassName)}>{action.label}</span>
            </Button>
          );
        }

        return (
          <Button
            key={action.key}
            {...baseProps}
            onPress={action.onClick}
          >
            <span className={cn('whitespace-nowrap', action.labelClassName)}>{action.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
