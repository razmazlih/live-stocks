import { ReactNode } from 'react';

import { Card, CardBody, CardHeader, Divider } from '@heroui/react';

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
    <Card className={cn('w-full max-w-md border-none bg-white/90 backdrop-blur-xl', className)} radius="xl" shadow="md">
      <CardHeader className="flex flex-col gap-2 pb-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      </CardHeader>
      <Divider className="mx-4" />
      <CardBody className="pt-4">
        <DashboardQuickActions actions={actions} />
        {children}
      </CardBody>
    </Card>
  );
}
