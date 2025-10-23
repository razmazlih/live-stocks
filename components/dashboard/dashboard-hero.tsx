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
      radius="2xl"
      className="relative overflow-hidden border-0 bg-gradient-to-br from-primary-900/70 via-slate-900/80 to-slate-950/90 text-white shadow-2xl"
    >
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute -right-24 top-[-6rem] h-56 w-56 rounded-full bg-primary-500/60 blur-3xl" />
        <div className="absolute -bottom-32 left-0 h-72 w-72 rounded-full bg-sky-500/30 blur-3xl" />
      </div>
      <CardBody className="relative z-10 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)] lg:items-start">
        <div className="space-y-6">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-400/20 text-primary-100 shadow-lg shadow-primary-900/30 ring-1 ring-white/20">
                  <TrendingUp className="h-7 w-7" />
                </span>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
                  <p className="mt-2 max-w-xl text-base text-white/70 sm:text-lg">{subtitle}</p>
                </div>
              </div>
              {dailyChange && (
                <DailyChangeBadge
                  toneClass={dailyChange.toneClass}
                  className="shadow-sm"
                  icon={dailyChange.icon}
                  value={dailyChange.value}
                  label={dailyChange.label}
                />
              )}
            </div>
            <Divider className="border-white/10" />
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-white/70 sm:text-sm">
              <Chip
                size="sm"
                radius="full"
                variant="flat"
                className="gap-2 bg-white/10 text-white"
                startContent={<span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />}
              >
                {updatedLabel} {lastUpdatedDisplay ?? '—'}
              </Chip>
              <Chip
                size="sm"
                radius="full"
                variant="shadow"
                color="primary"
                className="gap-2 bg-primary-500/20 text-primary-100"
                startContent={<TrendingUp className="h-4 w-4" />}
              >
                {exchangeRateLabel} {exchangeRateValue}
              </Chip>
            </div>
          </div>
        </div>
        <QuickActionsSection title={quickActionsTitle} actions={quickActions} />
      </CardBody>
    </Card>
  );
}
