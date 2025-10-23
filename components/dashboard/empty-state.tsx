import Link from 'next/link';
import { LucideIcon, Plus } from 'lucide-react';
import { Button, Card, CardBody } from '@heroui/react';

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
    <Card className="mx-auto max-w-lg border-0 bg-gradient-to-br from-slate-900/70 via-slate-900/50 to-slate-950/80 text-center text-white shadow-xl">
      <CardBody className="flex flex-col items-center gap-5 py-14">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-500/20 text-primary-100 shadow-lg shadow-primary-900/30">
          <Icon className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <p className="text-xl font-semibold tracking-tight text-white">{title}</p>
          <p className="text-sm text-white/70">{description}</p>
        </div>
        <Button
          as={Link}
          href={actionHref}
          size="md"
          radius="full"
          color="primary"
          className={cn('gap-2 bg-primary-500 text-white shadow-lg shadow-primary-900/30 hover:-translate-y-0.5', buttonClassName)}
          startContent={<Icon className="h-4 w-4" />}
        >
          {actionLabel}
        </Button>
      </CardBody>
    </Card>
  );
}
