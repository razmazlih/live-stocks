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
    <Card shadow="sm" radius="2xl" className="mx-auto max-w-md border-none bg-white/90 text-center">
      <CardBody className="flex flex-col items-center justify-center gap-4 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-600 shadow-inner">
          <Icon className="h-6 w-6" />
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
          variant="solid"
          startContent={<Icon className="h-4 w-4" />}
          className={cn('font-semibold', buttonClassName)}
        >
          {actionLabel}
        </Button>
      </CardBody>
    </Card>
  );
}
