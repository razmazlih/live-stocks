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
  reload: 'bg-blue-50 text-[var(--color-blue-700)]',
  settings: 'bg-slate-100 text-[var(--color-slate-700)]',
  dashboard: 'bg-[color:var(--color-primary-050)] text-[var(--color-primary-700)]',
  insights: 'bg-blue-50 text-[var(--color-indigo-700)]',
  portfolio: 'bg-[color:var(--color-primary-010)] text-[var(--color-indigo-700)]',
  realized: 'bg-emerald-50 text-[var(--color-emerald-700)]',
  watchlist: 'bg-blue-50 text-[var(--color-sky-700)]',
  positions: 'bg-blue-50 text-[var(--color-blue-700)]',
  aiPrompts: 'bg-[color:var(--color-amber-200)]/30 text-[var(--color-amber-600)]',
  newGroup: 'bg-[color:var(--color-primary-050)] text-[var(--color-primary-700)]',
  newTicker: 'bg-blue-50 text-[var(--color-sky-700)]',
};

export function DashboardQuickActions({ actions }: DashboardQuickActionsProps) {
  if (!actions.length) {
    return null;
  }

  const renderActionButton = (action: DashboardQuickAction) => {
    const Icon = action.icon;
    const contentClassName = 'flex w-full min-w-0 items-center justify-start gap-2 sm:justify-center';
    const labelBaseClassName =
      'min-w-0 whitespace-normal text-balance text-xs font-semibold leading-tight sm:text-sm';
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
          '!h-auto !min-h-[42px] !whitespace-normal w-[min(76vw,13.5rem)] shrink-0 snap-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 shadow-sm transition-colors duration-200 hover:border-blue-200 hover:bg-slate-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-1 disabled:opacity-45 sm:!h-10 sm:!min-h-10 sm:w-auto sm:py-0',
          action.className,
        )}
      >
        {buttonContent}
      </Button>
    );
  };

  return (
    <div className="mt-3 grid auto-cols-[minmax(160px,1fr)] grid-flow-col gap-2 overflow-x-auto overscroll-x-contain scroll-px-1 pb-1 [scrollbar-width:none] [scroll-snap-type:x_mandatory] sm:auto-cols-auto sm:grid-cols-2 sm:grid-flow-row sm:overflow-visible lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
      {actions.map((action) => renderActionButton(action))}
    </div>
  );
}
