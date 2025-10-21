import type { DashboardQuickAction } from './quick-actions';
import { DashboardQuickActions } from './quick-actions';
import { cn } from '@/lib/utils';

interface QuickActionsCardProps {
  title: string;
  actions: DashboardQuickAction[];
  className?: string;
}

export function QuickActionsCard({ title, actions, className }: QuickActionsCardProps) {
  if (!actions.length) {
    return null;
  }

  return (
    <div
      className={cn(
        'w-full max-w-md rounded-2xl border border-white/60 bg-white/70 p-5 shadow-inner backdrop-blur-sm',
        className
      )}
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <DashboardQuickActions actions={actions} />
    </div>
  );
}
