import { ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';

import { Card, CardBody, Chip } from '@heroui/react';

import { DailyChangeBadge } from './daily-change-badge';
import { DashboardQuickAction } from './quick-actions';
import { QuickActionsSection } from './quick-actions-section';

interface DashboardHeroProps {
  title: string;
  subtitle: string;
  updatedLabel: string;
  lastUpdatedDisplay: string | null;
  exchangeRateLabel: string;
  exchangeRateValue: string;
  quickActionsTitle: string;
  quickActions: DashboardQuickAction[];
  dailyChange?: {
    value: string;
    toneClass: string;
    icon: ReactNode;
    label: string;
  } | null;
}

export function DashboardHero({
  title,
  subtitle,
  updatedLabel,
  lastUpdatedDisplay,
  exchangeRateLabel,
  exchangeRateValue,
  quickActionsTitle,
  quickActions,
  dailyChange,
}: DashboardHeroProps) {
  return (
    <Card
      radius="lg"
      shadow="lg"
      className="relative overflow-hidden border border-default-200 bg-gradient-to-br from-primary/10 via-background to-background"
    >
      <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
      <CardBody className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground sm:text-4xl">{title}</h1>
              <p className="mt-2 max-w-xl text-base text-foreground/70">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium sm:text-sm">
            <Chip
              size="sm"
              variant="flat"
              color="primary"
              startContent={<span className="h-2 w-2 animate-pulse rounded-full bg-primary" />}
              className="px-3 py-1"
            >
              {updatedLabel} {lastUpdatedDisplay ?? '—'}
            </Chip>
            <Chip
              size="sm"
              variant="flat"
              color="secondary"
              startContent={<TrendingUp className="h-4 w-4" />}
              className="px-3 py-1"
            >
              {exchangeRateLabel} {exchangeRateValue}
            </Chip>
            {dailyChange && (
              <DailyChangeBadge
                toneClass={dailyChange.toneClass}
                icon={dailyChange.icon}
                value={dailyChange.value}
                label={dailyChange.label}
              />
            )}
          </div>
        </div>
        <QuickActionsSection title={quickActionsTitle} actions={quickActions} />
      </CardBody>
    </Card>
  );
}
