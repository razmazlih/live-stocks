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
    <header className="home-hero relative isolate overflow-hidden rounded-[2rem] border border-[color:var(--color-slate-200)]/75 px-4 py-5 shadow-[0_24px_48px_-40px_rgba(15,23,42,0.65)] sm:px-6 sm:py-6 lg:px-7 lg:py-7 xl:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.58),transparent_42%)]" aria-hidden="true" />
      <div className="relative z-10 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,25.5rem)] xl:items-start xl:gap-6">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="mt-0.5 shrink-0 rounded-2xl border border-[color:var(--color-blue-100)]/75 bg-[color:var(--color-neutral-white)]/82 p-2.5 text-[var(--color-primary-500)] shadow-[0_16px_28px_-22px_rgba(37,99,235,0.72)] backdrop-blur-sm">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2">
              <h1 className="text-balance text-[clamp(1.9rem,4vw,2.85rem)] font-black tracking-tight text-[var(--color-primary-900)] leading-[1.05]">
                {title}
              </h1>
              <p className="max-w-2xl text-balance text-sm leading-relaxed text-[var(--color-slate-600)]/95 sm:text-base">{subtitle}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2.5 text-xs font-medium text-[var(--color-slate-500)] sm:grid-cols-2 sm:text-sm xl:grid-cols-3">
            <span className="inline-flex min-h-9 min-w-0 w-full items-center justify-start gap-2 rounded-full border border-[color:var(--color-blue-100)]/90 bg-[color:var(--color-neutral-white)]/88 px-3 py-1.5 text-[var(--color-primary-600)] shadow-[0_12px_24px_-22px_rgba(15,23,42,0.78)] backdrop-blur-sm sm:justify-center">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary-400)]" />
              <span className="max-w-full text-balance leading-tight">
                {updatedLabel} {lastUpdatedDisplay ?? '—'}
              </span>
            </span>
            <span className="inline-flex min-h-9 min-w-0 w-full items-center justify-start gap-2 rounded-full border border-[color:var(--color-slate-200)]/90 bg-[color:var(--color-neutral-white)]/88 px-3 py-1.5 text-[var(--color-slate-600)] shadow-[0_12px_24px_-22px_rgba(15,23,42,0.78)] backdrop-blur-sm sm:justify-center">
              <TrendingUp className="h-4 w-4 text-[var(--color-primary-400)]" />
              <span className="max-w-full text-balance leading-tight">
                {exchangeRateLabel} {exchangeRateValue}
              </span>
            </span>
            {dailyChange && (
              <DailyChangeBadge
                toneClass={dailyChange.toneClass}
                icon={dailyChange.icon}
                value={dailyChange.value}
                label={dailyChange.label}
                className="w-full justify-start sm:justify-center sm:col-span-2 xl:col-span-1"
              />
            )}
          </div>
        </div>
        <QuickActionsSection
          title={quickActionsTitle}
          actions={quickActions}
          className="w-full max-w-full xl:!max-w-[32rem] xl:self-start xl:justify-self-end"
        />
      </div>
    </header>
  );
}
