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
    <header className="relative overflow-hidden rounded-3xl border border-[color:var(--color-neutral-white)]/60 bg-[color:var(--color-neutral-white)]/80 px-6 py-8 shadow-xl backdrop-blur-sm">
      <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-[color:var(--color-primary-050)]/60 blur-3xl" />
      <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-[var(--color-primary-002)] p-3 text-[var(--color-primary-500)] shadow-inner">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[var(--color-primary-900)] sm:text-4xl">{title}</h1>
              <p className="mt-2 max-w-xl text-base text-[var(--color-slate-600)]">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--color-slate-500)] sm:text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-010)] px-3 py-1 text-[var(--color-primary-500)] shadow-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary-400)]" />
              {updatedLabel} {lastUpdatedDisplay ?? '—'}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--color-neutral-white)]/70 px-3 py-1 text-[var(--color-slate-600)] shadow-sm">
              <TrendingUp className="h-4 w-4 text-[var(--color-primary-400)]" />
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
