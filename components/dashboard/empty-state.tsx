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
    <Card radius="lg" shadow="md" className="py-12 text-center">
      <CardBody className="items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          <p className="text-sm text-foreground/70">{description}</p>
        </div>
        <Button
          as={Link}
          href={actionHref}
          size="sm"
          color="primary"
          className={cn('gap-2', buttonClassName)}
          startContent={<Icon className="h-4 w-4" />}
        >
          {actionLabel}
        </Button>
      </CardBody>
    </Card>
  );
}
