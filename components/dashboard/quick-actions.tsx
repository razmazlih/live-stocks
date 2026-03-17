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

const ACTION_TONE_BY_KEY: Record<string, string> = {
  reload: 'border-[color:var(--color-blue-200)]/75 !bg-[color:var(--color-blue-50)]/70 !hover:bg-[color:var(--color-blue-50)]/88',
  settings: 'border-[color:var(--color-slate-200)]/90 !bg-[color:var(--color-slate-50)]/72 !hover:bg-[color:var(--color-slate-50)]/90',
  dashboard: 'border-[color:var(--color-primary-200)]/75 !bg-[color:var(--color-primary-050)]/68 !hover:bg-[color:var(--color-primary-050)]/86',
  insights: 'border-[color:var(--color-indigo-200)]/80 !bg-[color:var(--color-indigo-50)]/72 !hover:bg-[color:var(--color-indigo-50)]/90',
  portfolio: 'border-[color:var(--color-indigo-600)]/30 !bg-[color:var(--color-primary-010)]/72 !hover:bg-[color:var(--color-primary-010)]/90',
  realized: 'border-[color:var(--color-emerald-200)]/75 !bg-[color:var(--color-emerald-50)]/72 !hover:bg-[color:var(--color-emerald-50)]/90',
  watchlist: 'border-[color:var(--color-sky-100)] !bg-[color:var(--color-blue-50)]/72 !hover:bg-[color:var(--color-blue-50)]/90',
  positions: 'border-[color:var(--color-blue-200)]/75 !bg-[color:var(--color-blue-50)]/72 !hover:bg-[color:var(--color-blue-50)]/90',
  aiPrompts: 'border-[color:var(--color-amber-200)]/75 !bg-[color:var(--color-amber-200)]/38 !hover:bg-[color:var(--color-amber-200)]/56',
  newGroup: 'border-[color:var(--color-primary-200)]/75 !bg-[color:var(--color-primary-050)]/70 !hover:bg-[color:var(--color-primary-050)]/88',
  newTicker: 'border-[color:var(--color-sky-100)] !bg-[color:var(--color-blue-50)]/72 !hover:bg-[color:var(--color-blue-50)]/90',
};

const ACTION_ICON_TONE_BY_KEY: Record<string, string> = {
  reload: 'bg-[color:var(--color-blue-50)] text-[var(--color-blue-700)]',
  settings: 'bg-[color:var(--color-slate-100)] text-[var(--color-slate-700)]',
  dashboard: 'bg-[color:var(--color-primary-050)] text-[var(--color-primary-700)]',
  insights: 'bg-[color:var(--color-indigo-50)] text-[var(--color-indigo-700)]',
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
    const contentClassName = 'flex w-full min-w-0 items-center justify-center gap-2';
    const labelBaseClassName = 'min-w-0 whitespace-normal break-words text-center text-xs font-semibold leading-tight sm:text-sm';
    const iconBaseClassName = 'h-4 w-4 shrink-0';
    const toneClassName =
      ACTION_TONE_BY_KEY[action.key] ??
      'border-[color:var(--color-primary-025)]';
    const iconToneClassName =
      ACTION_ICON_TONE_BY_KEY[action.key] ??
      'bg-[color:var(--color-primary-010)] text-[var(--color-primary-600)]';

    const buttonContent: ReactNode = action.href ? (
      <Link href={action.href} className={contentClassName}>
        <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full', iconToneClassName)}>
          <Icon className={cn(iconBaseClassName, action.iconClassName)} />
        </span>
        <span className={cn(labelBaseClassName, '!text-[var(--color-slate-800)]', action.labelClassName)}>{action.label}</span>
      </Link>
    ) : (
      <>
        <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full', iconToneClassName)}>
          <Icon className={cn(iconBaseClassName, action.iconClassName)} />
        </span>
        <span className={cn(labelBaseClassName, '!text-[var(--color-slate-800)]', action.labelClassName)}>{action.label}</span>
      </>
    );

    return (
      <Button
        key={action.key}
        size="sm"
        variant="ghost"
        asChild={Boolean(action.href)}
        onClick={action.onClick}
        disabled={action.disabled}
        aria-label={action.ariaLabel ?? action.label}
        className={cn(
          toneClassName,
          'h-auto min-w-0 w-full rounded-full px-3 py-2.5 !whitespace-normal !text-[var(--color-slate-800)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)] focus-visible:ring-offset-1 disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-sm',
        )}
      >
        {buttonContent}
      </Button>
    );
  };

  return <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{actions.map((action) => renderActionButton(action))}</div>;
}
