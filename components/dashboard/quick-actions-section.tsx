import { ReactNode } from 'react';

import { isNavbarHref } from '@/lib/navigation-routes';
import { cn } from '@/lib/utils';

import type { DashboardQuickAction } from './quick-actions';
import { DashboardQuickActions } from './quick-actions';

interface QuickActionsSectionProps {
  title: string;
  description?: string;
  actions: DashboardQuickAction[];
  children?: ReactNode;
  className?: string;
}

export function QuickActionsSection({
  title,
  description,
  actions,
  children,
  className,
}: QuickActionsSectionProps) {
  const visibleActions = actions.filter((action) => !isNavbarHref(action.href));

  if (!visibleActions.length && !children) {
    return null;
  }

  return (
    <div
      className={cn(
        'relative isolate w-full max-w-full overflow-hidden rounded-[1.75rem] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(155deg,rgba(255,255,255,0.96)_0%,rgba(246,250,255,0.9)_58%,rgba(226,240,255,0.46)_100%)] p-4 shadow-[0_24px_44px_-34px_rgba(15,23,42,0.64)] backdrop-blur-md max-[480px]:p-3.5 sm:p-5 lg:min-w-[420px] lg:max-w-[560px]',
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.78),transparent_48%)]"
        aria-hidden="true"
      />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <p className="max-w-full text-balance text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-slate-500)]">
              {title}
            </p>
            {description ? (
              <p className="max-w-full text-balance text-xs leading-relaxed text-[var(--color-slate-500)]">{description}</p>
            ) : null}
          </div>
          {visibleActions.length > 0 ? (
            <span className="inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-primary-200)]/78 bg-[color:var(--color-primary-050)]/88 px-2 text-[11px] font-semibold text-[var(--color-primary-700)] shadow-[0_12px_18px_-14px_rgba(37,99,235,0.58)]">
              {visibleActions.length}
            </span>
          ) : null}
        </div>
        {visibleActions.length ? (
          <div className="mt-4">
            <DashboardQuickActions actions={visibleActions} />
          </div>
        ) : null}
        {children ? <div className={cn(visibleActions.length ? 'mt-4' : 'mt-3')}>{children}</div> : null}
      </div>
    </div>
  );
}
