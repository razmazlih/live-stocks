import { ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';

import { DailyChangeBadge } from './daily-change-badge';
import { DashboardQuickAction, DashboardQuickActions } from './quick-actions';

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
    <header className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-6 py-8 shadow-xl backdrop-blur-sm">
      <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-blue-200/60 blur-3xl" />
      <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-blue-100 p-3 text-blue-600 shadow-inner">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#0F172A] sm:text-4xl">{title}</h1>
              <p className="mt-2 max-w-xl text-base text-slate-600">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-600 shadow-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
              {updatedLabel} {lastUpdatedDisplay ?? '—'}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-slate-600 shadow-sm">
              <TrendingUp className="h-4 w-4 text-blue-500" />
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
        <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/70 p-5 shadow-inner backdrop-blur-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{quickActionsTitle}</p>
          <DashboardQuickActions actions={quickActions} />
        </div>
      </div>
    </header>
  );
}
