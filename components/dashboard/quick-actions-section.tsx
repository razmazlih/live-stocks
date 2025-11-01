import { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { ThemeToggle } from '../theme-toggle';

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
        'w-full max-w-md rounded-2xl border border-border bg-[hsl(var(--card))] p-5 shadow-inner glass-panel',
        className
      )}
    >
      {/* כל הסטיילים כאן נשענים על טוקני הנושא */}
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <DashboardQuickActions actions={actions} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {children}
        <ThemeToggle />
      </div>
    </div>
  );
}
