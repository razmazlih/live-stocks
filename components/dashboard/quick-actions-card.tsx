import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { DashboardQuickAction, DashboardQuickActions } from './quick-actions';

interface QuickActionsCardProps {
  title: string;
  actions: DashboardQuickAction[];
  className?: string;
  actionsClassName?: string;
  children?: ReactNode;
}

export function QuickActionsCard({
  title,
  actions,
  className,
  actionsClassName,
  children,
}: QuickActionsCardProps) {
  return (
    <div
      className={cn(
        'w-full max-w-md rounded-2xl border border-white/60 bg-white/70 p-5 shadow-inner backdrop-blur-sm',
        className
      )}
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <DashboardQuickActions actions={actions} className={actionsClassName} />
      {children}
    </div>
  );
}

