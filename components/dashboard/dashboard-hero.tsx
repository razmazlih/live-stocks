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
    <header className="home-hero relative overflow-hidden rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-blue-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500 sm:text-base">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
            <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {updatedLabel} {lastUpdatedDisplay ?? '—'}
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              {exchangeRateLabel} {exchangeRateValue}
            </span>
            {dailyChange && (
              <DailyChangeBadge
                toneClass={dailyChange.toneClass}
                icon={dailyChange.icon}
                value={dailyChange.value}
                label={dailyChange.label}
                className="rounded-lg border border-transparent"
              />
            )}
          </div>
        </div>
        <QuickActionsSection title={quickActionsTitle} actions={quickActions} />
      </div>
    </header>
  );
}
