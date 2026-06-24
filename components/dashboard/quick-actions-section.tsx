import { ReactNode } from 'react';

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
  if (!actions.length && !children) {
    return null;
  }

  return (
    <div
      className={cn(
        'w-full max-w-5xl space-y-3 border-t border-slate-200/70 pt-5',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold tracking-wide text-slate-500">
          {title}
        </p>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      {description ? (
        <p className="text-xs leading-relaxed text-[var(--color-slate-500)] sm:text-sm">
          {description}
        </p>
      ) : null}
      <DashboardQuickActions actions={actions} />
      {children}
    </div>
  );
}
