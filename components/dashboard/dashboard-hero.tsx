import { ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';

import { Card, CardBody, Chip, Divider } from '@heroui/react';

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
    color: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
    variant?: 'solid' | 'bordered' | 'light' | 'flat' | 'faded' | 'shadow' | 'dot';
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
      as="header"
      radius="2xl"
      shadow="lg"
      className="relative overflow-hidden border-none bg-gradient-to-br from-white/95 via-white/90 to-blue-50/70 px-6 py-8 backdrop-blur-xl"
    >
      <div className="pointer-events-none absolute -right-32 top-0 h-56 w-56 rounded-full bg-blue-200/60 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-sky-100/50 blur-3xl" />
      <CardBody className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 text-blue-600 shadow-inner">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
              <p className="mt-2 max-w-2xl text-base text-slate-600">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
            <Chip
              className="bg-gradient-to-r from-blue-500/10 to-blue-400/10 px-4 py-2 text-blue-600"
              radius="full"
              variant="flat"
              startContent={<span className="h-2 w-2 animate-ping rounded-full bg-blue-400" />}
            >
              {updatedLabel} {lastUpdatedDisplay ?? '—'}
            </Chip>
            <Chip
              className="px-4 py-2"
              variant="bordered"
              color="primary"
              radius="full"
              startContent={<TrendingUp className="h-4 w-4 text-primary" />}
            >
              {exchangeRateLabel} {exchangeRateValue}
            </Chip>
            {dailyChange && (
              <DailyChangeBadge
                color={dailyChange.color}
                variant={dailyChange.variant}
                icon={dailyChange.icon}
                value={dailyChange.value}
                label={dailyChange.label}
              />
            )}
          </div>
        </div>
        <Divider orientation="vertical" className="hidden h-32 self-center rounded-full bg-gradient-to-b from-transparent via-blue-100 to-transparent lg:block" />
        <QuickActionsSection title={quickActionsTitle} actions={quickActions} />
      </CardBody>
    </Card>
  );
}
