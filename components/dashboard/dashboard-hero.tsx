import { ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';
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
  const chipClassName =
    'inline-flex min-h-10 min-w-0 w-full items-center justify-start gap-2.5 rounded-[1rem] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(140deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] px-3 py-2 text-[var(--color-slate-700)] shadow-[0_16px_28px_-24px_rgba(15,23,42,0.45)] backdrop-blur-md sm:px-3.5 sm:justify-center';

  return (
    <header className="home-hero home-hero--rebuild relative isolate overflow-hidden rounded-[2rem] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(140deg,rgba(255,255,255,0.98),rgba(249,250,250,0.95)_56%,rgba(236,253,245,0.76)_100%)] px-3.5 py-4 shadow-[0_34px_68px_-48px_rgba(15,23,42,0.6)] backdrop-blur-xl sm:px-6 sm:py-6 lg:px-7 lg:py-7 xl:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.58),transparent_42%)]" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -left-10 bottom-0 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.2),transparent_72%)] blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(167,243,208,0.92),rgba(255,255,255,0))]"
        aria-hidden="true"
      />
      <div className="relative z-10 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,25.5rem)] xl:items-start xl:gap-7">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="mt-0.5 shrink-0 rounded-[1.2rem] border border-[color:var(--color-emerald-200)]/75 bg-[linear-gradient(160deg,rgba(255,255,255,0.95),rgba(236,253,245,0.88))] p-2.5 text-[var(--color-emerald-700)] shadow-[0_20px_34px_-24px_rgba(5,150,105,0.48)] backdrop-blur-md sm:p-3">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2.5">
              <h1 className="text-balance text-[clamp(1.9rem,4vw,2.85rem)] font-black tracking-tight text-[var(--color-primary-900)] leading-[1.05]">
                {title}
              </h1>
              <p className="max-w-2xl text-balance text-sm leading-relaxed text-[var(--color-slate-600)]/95 sm:text-base">
                {subtitle}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2.5 text-xs font-medium text-[var(--color-slate-500)] sm:grid-cols-2 sm:text-sm xl:grid-cols-3">
            <span
              className={cn(
                chipClassName,
                'border-[color:var(--color-emerald-200)]/90 text-[var(--color-emerald-700)]'
              )}
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-emerald-500)]" />
              <span className="max-w-full text-balance leading-tight">
                {updatedLabel} {lastUpdatedDisplay ?? '—'}
              </span>
            </span>
            <span
              className={cn(
                chipClassName,
                'border-[color:var(--color-slate-200)]/90 text-[var(--color-slate-600)]'
              )}
            >
              <TrendingUp className="h-4 w-4 text-[var(--color-amber-500)]" />
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
                className="min-h-10 w-full justify-start rounded-[1rem] border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(248,250,252,0.86))] px-3 py-2 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.45)] sm:px-3.5 sm:justify-center sm:col-span-2 xl:col-span-1"
              />
            )}
          </div>
        </div>
        <div className="w-full xl:self-stretch">
          <div className="h-full w-full xl:[border-inline-start:1px_solid_rgba(226,232,240,0.78)] xl:ps-6">
            <QuickActionsSection
              title={quickActionsTitle}
              actions={quickActions}
              className="w-full max-w-full xl:!max-w-[32rem] xl:self-start xl:justify-self-end"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
