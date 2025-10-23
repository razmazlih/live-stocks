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
    <Card radius="lg" shadow="md" className={cn('w-full max-w-md backdrop-blur-sm', className)}>
      <CardHeader className="flex-col items-start gap-2 pb-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-foreground/70">{title}</p>
      </CardHeader>
      <CardBody className="flex flex-col gap-4 pt-0">
        <DashboardQuickActions actions={actions} />
        {children && (
          <>
            <Divider className="my-2" />
            <div className="space-y-3">{children}</div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
