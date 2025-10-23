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
    <Card className="relative overflow-hidden border-none bg-gradient-to-br from-white/90 via-white/70 to-white/40 p-6 shadow-2xl backdrop-blur-xl">
      <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-blue-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 left-10 h-48 w-48 rounded-full bg-sky-200/40 blur-3xl" />
      <CardBody className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-sky-100 to-blue-200 p-3 text-blue-600 shadow-lg">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{title}</h1>
              <p className="max-w-xl text-base text-slate-600">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
            <Chip
              size="sm"
              variant="flat"
              startContent={<span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />}
              className="h-auto rounded-full bg-sky-100/80 px-3 py-1.5 text-blue-700 shadow-sm"
            >
              {updatedLabel} {lastUpdatedDisplay ?? '—'}
            </Chip>
            <Chip
              size="sm"
              variant="flat"
              startContent={<TrendingUp className="h-4 w-4 text-blue-500" />}
              className="h-auto rounded-full bg-white/80 px-3 py-1.5 text-slate-600 shadow-sm"
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
        <QuickActionsSection title={quickActionsTitle} actions={quickActions} className="max-w-full lg:max-w-xs" />
      </CardBody>
    </Card>
  );
}
