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
        'w-full max-w-full lg:min-w-[420px] lg:max-w-[560px]',
        className
      )}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
        <p className="max-w-full text-balance text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-slate-500)]">
          {title}
        </p>
        <span className="hidden h-px flex-1 bg-gradient-to-l from-[color:var(--color-primary-200)]/65 to-transparent lg:block" />
      </div>
      {description ? (
        <p className="mt-1 max-w-full text-balance text-xs leading-relaxed text-[var(--color-slate-500)]">{description}</p>
      ) : null}
      <DashboardQuickActions actions={actions} />
      {children}
    </div>
  );
}
