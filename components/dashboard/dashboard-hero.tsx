'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type QuickActionBase = {
  id: string;
  label: string;
  icon: ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  labelClassName?: string;
};

export type DashboardHeroQuickAction =
  | (QuickActionBase & {
      type: 'button';
      onClick: () => void;
      disabled?: boolean;
    })
  | (QuickActionBase & {
      type: 'link';
      href: string;
    });

interface DailyChangeBadge {
  value: string;
  label: string;
  toneClass: string;
  icon: ReactNode;
}

interface DashboardHeroProps {
  leadingIcon: ReactNode;
  title: string;
  subtitle: string;
  updateLabel: string;
  updateValue: string | null;
  rateIcon: ReactNode;
  rateLabel: string;
  rateValue: string;
  quickActionsTitle: string;
  quickActions: DashboardHeroQuickAction[];
  dailyChangeBadge?: DailyChangeBadge;
}

export function DashboardHero({
  leadingIcon,
  title,
  subtitle,
  updateLabel,
  updateValue,
  rateIcon,
  rateLabel,
  rateValue,
  quickActionsTitle,
  quickActions,
  dailyChangeBadge,
}: DashboardHeroProps) {
  return (
    <header className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-6 py-8 shadow-xl backdrop-blur-sm">
      <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-blue-200/60 blur-3xl" />
      <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-blue-100 p-3 text-blue-600 shadow-inner">{leadingIcon}</div>
            <div>
              <h1 className="text-3xl font-bold text-[#0F172A] sm:text-4xl">{title}</h1>
              <p className="mt-2 max-w-xl text-base text-slate-600">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-blue-600 shadow-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
              {updateLabel} {updateValue ?? '—'}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-slate-600 shadow-sm">
              {rateIcon}
              {rateLabel} {rateValue}
            </span>
            {dailyChangeBadge && (
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm',
                  dailyChangeBadge.toneClass,
                )}
              >
                {dailyChangeBadge.icon}
                {dailyChangeBadge.value}
                <span className="text-xs font-medium text-slate-600/80">{dailyChangeBadge.label}</span>
              </span>
            )}
          </div>
        </div>
        <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/70 p-5 shadow-inner backdrop-blur-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{quickActionsTitle}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {quickActions.map((action) => {
              const size = action.size ?? 'sm';
              const variant = action.variant ?? 'default';
              const className = cn('gap-2', action.className);
              const labelClassName = cn(action.labelClassName);

              if (action.type === 'link') {
                return (
                  <Button
                    key={action.id}
                    asChild
                    size={size}
                    variant={variant}
                    className={className}
                  >
                    <Link href={action.href}>
                      {action.icon}
                      <span className={labelClassName}>{action.label}</span>
                    </Link>
                  </Button>
                );
              }

              return (
                <Button
                  key={action.id}
                  size={size}
                  variant={variant}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={className}
                >
                  {action.icon}
                  <span className={labelClassName}>{action.label}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
