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
    <header className="home-hero relative overflow-hidden rounded-[2rem] border border-[color:var(--color-neutral-white)]/70 px-5 py-6 shadow-xl glass-blur-sm sm:px-7 sm:py-7">
      <div className="pointer-events-none absolute -right-24 -top-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(var(--color-primary-400-rgb),0.25),_transparent_68%)] blur-2xl" />
      <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,_rgba(var(--color-primary-900-rgb),0.12),_transparent_72%)] blur-2xl" />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-[color:var(--color-neutral-white)]/80 p-2.5 text-[var(--color-primary-500)] shadow-md ring-1 ring-[color:var(--color-slate-200)]/70">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[var(--color-primary-900)] sm:text-3xl">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--color-slate-600)] sm:text-base">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--color-slate-500)] sm:text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-blue-100)]/80 bg-[color:var(--color-neutral-white)]/85 px-3 py-1.5 text-[var(--color-primary-600)] shadow-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary-400)]" />
              {updatedLabel} {lastUpdatedDisplay ?? '—'}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-[color:var(--color-neutral-white)]/85 px-3 py-1.5 text-[var(--color-slate-600)] shadow-sm">
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
