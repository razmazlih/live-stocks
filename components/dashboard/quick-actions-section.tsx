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
    <Card className={cn('w-full max-w-md border-none bg-white/80 shadow-xl backdrop-blur', className)}>
      <CardBody className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <DashboardQuickActions actions={actions} />
        {children}
      </CardBody>
    </Card>
  );
}
