'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DashboardLoadingStateProps {
  icon: ReactNode;
  label: string;
}

export function DashboardLoadingState({ icon, label }: DashboardLoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      {icon}
      <p>{label}</p>
    </div>
  );
}

interface DashboardEmptyStateAction {
  href: string;
  label: string;
  icon: ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}

interface DashboardEmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action: DashboardEmptyStateAction;
}

export function DashboardEmptyState({ icon, title, description, action }: DashboardEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="rounded-full bg-blue-100 p-3 text-blue-600 shadow-inner">{icon}</div>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-slate-800">{title}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <Button
        asChild
        size={action.size ?? 'sm'}
        variant={action.variant ?? 'default'}
        className={cn('gap-2', action.className)}
      >
        <Link href={action.href}>
          {action.icon}
          <span>{action.label}</span>
        </Link>
      </Button>
    </div>
  );
}
