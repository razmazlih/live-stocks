import { ReactNode } from 'react';
import { Card, CardBody } from '@heroui/react';

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
    <Card
      className={cn(
        'w-full max-w-md overflow-hidden border-0 bg-gradient-to-br from-slate-900/60 via-slate-800/50 to-slate-900/40 p-0 text-foreground shadow-xl backdrop-blur-xl',
        className
      )}
      radius="2xl"
    >
      <CardBody className="space-y-4 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary-200/80">{title}</p>
        <DashboardQuickActions actions={actions} />
        {children}
      </CardBody>
    </Card>
  );
}
