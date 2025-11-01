import Link from 'next/link';
import { LucideIcon, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DashboardEmptyStateProps {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  icon?: LucideIcon;
  buttonClassName?: string;
}

export function DashboardEmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon: Icon = Plus,
  buttonClassName,
}: DashboardEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="rounded-full bg-blue-100 p-3 text-blue-600 shadow-inner">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-slate-800">{title}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <Button
        asChild
        size="sm"
        className={cn('gap-2 bg-[var(--color-blue-500)] text-white shadow-sm hover:bg-[var(--color-blue-600)]', buttonClassName)}
      >
        <Link href={actionHref}>
          <Icon className="h-4 w-4" />
          <span>{actionLabel}</span>
        </Link>
      </Button>
    </div>
  );
}
