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
    <Card className="mx-auto max-w-lg border-none bg-white/85 text-center shadow-xl backdrop-blur">
      <CardBody className="flex flex-col items-center justify-center gap-4 py-12">
        <div className="rounded-full bg-gradient-to-br from-blue-100 to-sky-200 p-4 text-blue-600 shadow-lg">
          <Icon className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold text-slate-800">{title}</p>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <Button
          as={Link}
          href={actionHref}
          size="md"
          color="primary"
          startContent={<Icon className="h-4 w-4" />}
          className={cn('font-semibold shadow-md', buttonClassName)}
        >
          {actionLabel}
        </Button>
      </CardBody>
    </Card>
  );
}
