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
}

const ACTION_ICON_TONE_BY_KEY: Record<string, string> = {
  reload: 'bg-[color:var(--color-blue-50)] text-[var(--color-blue-700)]',
  settings: 'bg-[color:var(--color-slate-100)] text-[var(--color-slate-700)]',
  dashboard: 'bg-[color:var(--color-primary-050)] text-[var(--color-primary-700)]',
  insights: 'bg-[color:var(--color-blue-50)] text-[var(--color-indigo-700)]',
  portfolio: 'bg-[color:var(--color-primary-010)] text-[var(--color-indigo-700)]',
  realized: 'bg-[color:var(--color-emerald-50)] text-[var(--color-emerald-700)]',
  watchlist: 'bg-[color:var(--color-blue-50)] text-[var(--color-sky-700)]',
  positions: 'bg-[color:var(--color-blue-50)] text-[var(--color-blue-700)]',
  aiPrompts: 'bg-[color:var(--color-amber-200)]/30 text-[var(--color-amber-600)]',
  newGroup: 'bg-[color:var(--color-primary-050)] text-[var(--color-primary-700)]',
  newTicker: 'bg-[color:var(--color-blue-50)] text-[var(--color-sky-700)]',
};

export function DashboardQuickActions({ actions }: DashboardQuickActionsProps) {
  if (!actions.length) {
    return null;
  }

  const renderActionButton = (action: DashboardQuickAction) => {
    const Icon = action.icon;
    const contentClassName = 'flex w-full items-center justify-center gap-2';
    const labelBaseClassName = 'truncate text-xs font-semibold sm:text-sm';
    const iconBaseClassName = 'h-4 w-4 shrink-0';
    const iconToneClassName =
      ACTION_ICON_TONE_BY_KEY[action.key] ??
      'bg-[color:var(--color-primary-010)] text-[var(--color-primary-600)]';

    const buttonContent: ReactNode = action.href ? (
      <Link href={action.href} className={contentClassName}>
        <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full', iconToneClassName)}>
          <Icon className={cn(iconBaseClassName, action.iconClassName)} />
        </span>
        <span className={cn(labelBaseClassName, 'text-slate-800', action.labelClassName)}>{action.label}</span>
      </Link>
    ) : (
      <>
        <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full', iconToneClassName)}>
          <Icon className={cn(iconBaseClassName, action.iconClassName)} />
        </span>
        <span className={cn(labelBaseClassName, 'text-slate-800', action.labelClassName)}>{action.label}</span>
      </>
    );

    return (
      <Button
        key={action.key}
        size="sm"
        variant={action.variant ?? 'ghost'}
        asChild={Boolean(action.href)}
        onClick={action.onClick}
        disabled={action.disabled}
        aria-label={action.ariaLabel ?? action.label}
        className={cn(
          'h-10 min-w-[112px] rounded-lg border border-slate-200 bg-white px-3 text-slate-800 shadow-sm transition-colors duration-200 hover:border-blue-200 hover:bg-slate-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-1 disabled:opacity-45',
          action.className,
        )}
      >
        {buttonContent}
      </Button>
    );
  };

  return <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">{actions.map((action) => renderActionButton(action))}</div>;
}
