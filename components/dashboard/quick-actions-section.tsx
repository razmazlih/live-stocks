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
        'quick-actions-shell relative isolate w-full max-w-full overflow-hidden rounded-[1.9rem] border border-[color:var(--color-blue-100)]/70 bg-[linear-gradient(150deg,rgba(255,255,255,0.97)_0%,rgba(248,251,255,0.96)_40%,rgba(232,243,255,0.82)_100%)] p-3 shadow-[0_30px_64px_-40px_rgba(15,23,42,0.72)] backdrop-blur-xl max-[480px]:p-3 sm:p-5 lg:min-w-[420px] lg:max-w-[560px]',
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.82),transparent_46%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-16 top-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.16),transparent_70%)] blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-20 left-[-3.5rem] h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.12),transparent_72%)] blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(147,197,253,0.9),rgba(255,255,255,0))]"
        aria-hidden="true"
      />
      <div className="quick-actions-body relative z-10 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="max-w-full text-balance text-[10px] font-black uppercase tracking-[0.22em] text-[var(--color-slate-500)]">
              {title}
            </p>
            {description ? (
              <p className="max-w-[30rem] text-balance text-sm leading-relaxed text-[var(--color-slate-600)]/92">
                {description}
              </p>
            ) : null}
          </div>
          {visibleActions.length > 0 ? (
            <span className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-blue-200)]/88 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(239,246,255,0.94))] px-3 text-[11px] font-semibold tabular-nums text-[var(--color-blue-700)] shadow-[0_18px_24px_-18px_rgba(37,99,235,0.64)] ring-1 ring-white/70">
              {visibleActions.length}
            </span>
          ) : null}
        </div>
        {visibleActions.length ? (
          <div className="rounded-[1.6rem] border border-white/85 bg-[linear-gradient(160deg,rgba(255,255,255,0.82),rgba(248,250,255,0.66))] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:p-1.5">
            <DashboardQuickActions actions={visibleActions} />
          </div>
        ) : null}
        {children ? (
          <div
            className={cn(
              'rounded-[1.45rem] border border-white/75 bg-[rgba(255,255,255,0.64)] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] sm:p-3',
              visibleActions.length ? 'mt-1' : 'mt-3'
            )}
          >
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
