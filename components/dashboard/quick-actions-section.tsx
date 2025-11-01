import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import type { DashboardQuickAction } from './quick-actions';
import { DashboardQuickActions } from './quick-actions';

interface QuickActionsSectionProps {
  title: string;
  actions: DashboardQuickAction[];
  children?: ReactNode;
  className?: string;
}

export function QuickActionsSection({ title, actions, children, className }: QuickActionsSectionProps) {
  if (!actions.length && !children) {
    return null;
  }

  return (
    <div
      className={cn(
        'w-full max-w-md rounded-2xl border border-[color:var(--border-white)]/60 bg-[color:var(--surface-base)]/70 p-5 shadow-inner glass-blur-sm',
        className
      )}
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <DashboardQuickActions actions={actions} />
      {children}
    </div>
  );
}
