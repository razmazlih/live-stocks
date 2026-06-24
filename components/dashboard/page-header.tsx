import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { DashboardQuickAction } from './quick-actions';
import { QuickActionsSection } from './quick-actions-section';

export interface PageMetaBadge {
  key: string;
  icon?: LucideIcon;
  label: string;
  className?: string;
  iconClassName?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  metaBadges?: readonly PageMetaBadge[];
  quickActionsTitle?: string;
  quickActions?: DashboardQuickAction[];
  quickActionsDescription?: string;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  metaBadges = [],
  quickActionsTitle,
  quickActions = [],
  quickActionsDescription,
  backHref,
  backLabel = 'Back',
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'page-shell-surface rounded-2xl px-5 py-6 shadow-sm sm:px-8',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="w-full space-y-4">
          {backHref ? (
            <Link href={backHref} className="inline-flex">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 text-slate-600 shadow-sm hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
              </Button>
            </Link>
          ) : null}

          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-xl border border-blue-100 bg-blue-50 p-2.5 text-blue-700">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl leading-tight font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-base">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>

          {metaBadges.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 sm:text-sm">
              {metaBadges.map((badge) => {
                const BadgeIcon = badge.icon;
                return (
                  <span
                    key={badge.key}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700',
                      badge.className,
                    )}
                  >
                    {BadgeIcon ? <BadgeIcon className={cn('h-4 w-4 text-slate-500', badge.iconClassName)} /> : null}
                    <span>{badge.label}</span>
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>

        {quickActionsTitle ? (
          <QuickActionsSection
            title={quickActionsTitle}
            description={quickActionsDescription}
            actions={quickActions}
          />
        ) : null}
      </div>
    </header>
  );
}
