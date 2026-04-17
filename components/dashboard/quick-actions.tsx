import { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, LucideIcon } from 'lucide-react';

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

interface QuickActionTone {
  surfaceClassName: string;
  iconClassName: string;
}

const ACTION_TONE_BY_KEY: Record<string, QuickActionTone> = {
  reload: {
    surfaceClassName:
      'border-[color:var(--color-emerald-200)]/82 bg-[color:var(--color-emerald-50)]/78 text-[var(--color-emerald-700)] hover:bg-[color:var(--color-emerald-50)]/92',
    iconClassName: 'bg-[color:var(--color-emerald-100)]/90 text-[var(--color-emerald-700)]',
  },
  settings: {
    surfaceClassName:
      'border-[color:var(--color-slate-200)]/90 bg-[color:var(--color-slate-50)]/82 text-[var(--color-slate-700)] hover:bg-[color:var(--color-slate-50)]',
    iconClassName: 'bg-[color:var(--color-slate-100)]/90 text-[var(--color-slate-700)]',
  },
  dashboard: {
    surfaceClassName:
      'border-[color:var(--color-emerald-200)]/80 bg-[color:var(--color-emerald-50)]/72 text-[var(--color-primary-900)] hover:bg-[color:var(--color-emerald-50)]/90',
    iconClassName: 'bg-[color:var(--color-emerald-100)]/92 text-[var(--color-emerald-700)]',
  },
  insights: {
    surfaceClassName:
      'border-[color:var(--color-sky-100)]/80 bg-[color:var(--color-blue-50)]/72 text-[var(--color-primary-900)] hover:bg-[color:var(--color-blue-50)]/92',
    iconClassName: 'bg-[color:var(--color-blue-100)]/90 text-[var(--color-sky-700)]',
  },
  portfolio: {
    surfaceClassName:
      'border-[color:var(--color-slate-200)]/74 bg-[color:var(--color-primary-010)]/76 text-[var(--color-primary-900)] hover:bg-[color:var(--color-primary-010)]/94',
    iconClassName: 'bg-[color:var(--color-slate-100)]/92 text-[var(--color-slate-700)]',
  },
  realized: {
    surfaceClassName:
      'border-[color:var(--color-emerald-200)]/75 bg-[color:var(--color-emerald-50)]/74 text-[var(--color-emerald-700)] hover:bg-[color:var(--color-emerald-50)]/92',
    iconClassName: 'bg-[color:var(--color-emerald-100)]/72 text-[var(--color-emerald-700)]',
  },
  watchlist: {
    surfaceClassName:
      'border-[color:var(--color-amber-200)]/95 bg-[color:var(--color-amber-200)]/28 text-[var(--color-amber-600)] hover:bg-[color:var(--color-amber-200)]/42',
    iconClassName: 'bg-[color:var(--color-amber-200)]/58 text-[var(--color-amber-600)]',
  },
  positions: {
    surfaceClassName:
      'border-[color:var(--color-emerald-200)]/75 bg-[color:var(--color-emerald-50)]/74 text-[var(--color-emerald-700)] hover:bg-[color:var(--color-emerald-50)]/92',
    iconClassName: 'bg-[color:var(--color-emerald-100)]/88 text-[var(--color-emerald-700)]',
  },
  aiPrompts: {
    surfaceClassName:
      'border-[color:var(--color-amber-200)]/85 bg-[color:var(--color-amber-200)]/42 text-[var(--color-amber-600)] hover:bg-[color:var(--color-amber-200)]/58',
    iconClassName: 'bg-[color:var(--color-amber-200)]/55 text-[var(--color-amber-600)]',
  },
  newGroup: {
    surfaceClassName:
      'border-[color:var(--color-primary-200)]/78 bg-[color:var(--color-primary-050)]/74 text-[var(--color-primary-900)] hover:bg-[color:var(--color-primary-050)]/90',
    iconClassName: 'bg-[color:var(--color-primary-050)]/90 text-[var(--color-primary-700)]',
  },
  newTicker: {
    surfaceClassName:
      'border-[color:var(--color-sky-100)]/95 bg-[color:var(--color-blue-50)]/74 text-[var(--color-blue-700)] hover:bg-[color:var(--color-blue-50)]/92',
    iconClassName: 'bg-[color:var(--color-sky-100)]/68 text-[var(--color-sky-700)]',
  },
};

const DEFAULT_ACTION_TONE: QuickActionTone = {
  surfaceClassName:
    'border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/88 text-[var(--color-slate-700)] hover:bg-[color:var(--color-slate-50)]',
  iconClassName: 'bg-[color:var(--color-primary-050)]/90 text-[var(--color-primary-700)]',
};

export function DashboardQuickActions({ actions }: DashboardQuickActionsProps) {
  if (!actions.length) {
    return null;
  }

  const renderActionButton = (action: DashboardQuickAction) => {
    const Icon = action.icon;
    const tone = ACTION_TONE_BY_KEY[action.key] ?? DEFAULT_ACTION_TONE;

    const buttonContent: ReactNode = (
      <span className="flex w-full min-w-0 items-center justify-start gap-3 text-start">
        <span
          className={cn(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--color-neutral-white)]/60 shadow-sm transition-transform duration-200 group-hover:scale-[1.04]',
            tone.iconClassName
          )}
        >
          <Icon className={cn('h-[17px] w-[17px] shrink-0', action.iconClassName)} />
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 overflow-hidden text-[13px] font-semibold leading-[1.25] text-balance sm:text-sm [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]',
            action.labelClassName
          )}
        >
          {action.label}
        </span>
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/85 text-[var(--color-slate-500)] shadow-sm transition-transform duration-200 group-hover:translate-y-[-1px] group-hover:text-[var(--color-primary-600)]">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </span>
    );

    const buttonClassName = cn(
      'group relative h-auto min-h-[4.75rem] w-full justify-start rounded-2xl border px-3.5 py-3 text-start shadow-[0_18px_34px_-30px_rgba(15,23,42,0.68)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_42px_-30px_rgba(15,23,42,0.74)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-neutral-white)] active:translate-y-0 disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:shadow-sm',
      tone.surfaceClassName,
      action.className
    );

    return (
      action.href && !action.disabled ? (
        <Button
          key={action.key}
          size="sm"
          variant={action.variant ?? 'ghost'}
          asChild
          onClick={action.onClick}
          aria-label={action.ariaLabel ?? action.label}
          className={buttonClassName}
        >
          <Link href={action.href}>{buttonContent}</Link>
        </Button>
      ) : (
        <Button
          key={action.key}
          size="sm"
          variant={action.variant ?? 'ghost'}
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={action.ariaLabel ?? action.label}
          className={buttonClassName}
        >
          {buttonContent}
        </Button>
      )
    );
  };

  return <div className="grid grid-cols-1 gap-2.5 min-[520px]:grid-cols-2">{actions.map((action) => renderActionButton(action))}</div>;
}
