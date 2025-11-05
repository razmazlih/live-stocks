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
    <header className="glass-panel relative overflow-hidden rounded-[2.5rem] px-6 py-10 sm:px-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="floating-orb floating-orb--blue -right-24 top-0 h-56 w-56 sm:h-72 sm:w-72" />
        <div className="floating-orb floating-orb--pink -left-16 bottom-[-4rem] h-48 w-48 sm:h-64 sm:w-64" />
      </div>
      <div className="liquid-sparkle" />
      <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="glass-chip rounded-2xl p-3 text-[var(--color-primary-500)] shadow-[0_20px_35px_-25px_rgba(37,99,235,0.6)]">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <h1 className="liquid-text-gradient text-3xl font-bold sm:text-4xl">{title}</h1>
              <p className="mt-2 max-w-xl text-base text-[var(--color-slate-600)]">
                {subtitle}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--color-slate-500)] sm:text-sm">
            <span className="glass-chip inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[var(--color-primary-600)] shadow-[0_18px_28px_-20px_rgba(37,99,235,0.45)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary-400)]" />
              {updatedLabel} {lastUpdatedDisplay ?? '—'}
            </span>
            <span className="glass-chip inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[var(--color-slate-600)] shadow-[0_18px_28px_-20px_rgba(37,99,235,0.35)]">
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
