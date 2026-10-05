import Link from 'next/link';
import type { ReactNode } from 'react';
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
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

export function PageHeader({ title, subtitle, icon: Icon, metaBadges = [], quickActionsTitle, quickActions = [], quickActionsDescription, actions, backHref, backLabel = 'Back', className }: PageHeaderProps) {
  const singleAction = quickActions.length === 1 ? quickActions[0] : undefined;
  const ActionIcon = singleAction?.icon;
  const actionContent = singleAction && ActionIcon ? <><ActionIcon aria-hidden="true" className={cn('h-4 w-4', singleAction.iconClassName)} /><span className={singleAction.labelClassName}>{singleAction.label}</span></> : null;

  return (
    <header className={cn('page-shell-surface rounded-2xl border border-slate-200 px-4 py-4 shadow-sm sm:px-6', className)}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        {backHref ? (
          <Button asChild variant="ghost" size="sm" className="w-fit gap-2 text-slate-600">
            <Link href={backHref}><ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />{backLabel}</Link>
          </Button>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Icon aria-hidden="true" className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
              {subtitle ? <p className="mt-1 hidden max-w-2xl text-sm leading-relaxed text-slate-500 sm:block">{subtitle}</p> : null}
            </div>
          </div>
          {metaBadges.length > 0 || singleAction || actions ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:justify-end">
              {metaBadges.length > 0 ? <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                {metaBadges.map((badge) => {
                  const BadgeIcon = badge.icon;
                  return <span key={badge.key} className={cn('inline-flex items-center gap-1.5 rounded-lg px-1 py-1 tabular-nums', badge.className)}>{BadgeIcon ? <BadgeIcon aria-hidden="true" className={cn('h-3.5 w-3.5', badge.iconClassName)} /> : null}<span>{badge.label}</span></span>;
                })}
              </div> : null}
              {singleAction ? <Button variant={singleAction.variant ?? 'outline'} size="sm" asChild={Boolean(singleAction.href)} onClick={singleAction.onClick} disabled={singleAction.disabled} aria-label={singleAction.ariaLabel ?? singleAction.label} className="shrink-0 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-700">{singleAction.href ? <Link href={singleAction.href}>{actionContent}</Link> : actionContent}</Button> : null}
              {actions}
            </div>
          ) : null}
        </div>
        {quickActionsTitle && quickActions.length > 1 ? <QuickActionsSection title={quickActionsTitle} description={quickActionsDescription} actions={quickActions} /> : null}
      </div>
    </header>
  );
}
