import { ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';

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
    <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-surface-glass px-6 py-8 shadow-xl glass-blur-sm">
      {/* Softened brand halo driven by tokens for dark/light parity */}
      <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-[hsl(var(--primary)/0.12)] blur-3xl" />
      <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-primary/15 p-3 text-primary shadow-inner">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground sm:text-4xl">{title}</h1>
              <p className="mt-2 max-w-xl text-base text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/20 px-3 py-1 text-primary shadow-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              {updatedLabel} {lastUpdatedDisplay ?? '—'}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-surface-elevated px-3 py-1 text-muted-foreground shadow-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              {exchangeRateLabel} {exchangeRateValue}
            </span>
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
      </div>
    </header>
  );
}
