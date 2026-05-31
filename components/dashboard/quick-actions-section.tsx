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
        'w-full lg:min-w-[360px] lg:max-w-[520px]',
        className
      )}
    >
      <div className="flex items-center gap-2 lg:justify-end">
        <p className="text-[11px] font-semibold text-slate-500">
          {title}
        </p>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      {description ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-slate-500)]">{description}</p>
      ) : null}
      <DashboardQuickActions actions={actions} />
      {children}
    </div>
  );
}
