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
    <header className="liquid-panel relative overflow-hidden rounded-3xl px-6 py-8">
      <div className="pointer-events-none absolute -right-16 top-[-12%] h-64 w-64 rounded-full bg-[radial-gradient(circle_at_top,_rgba(var(--color-blue-200-rgb),0.35),_transparent_65%)] blur-3xl animate-[glassDrift_22s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute -bottom-12 left-[-10%] h-60 w-60 rounded-full bg-[radial-gradient(circle_at_center,_rgba(var(--color-purple-400-rgb),0.18),_transparent_68%)] blur-3xl opacity-80 animate-[glassPulse_18s_ease-in-out_infinite]" />
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
