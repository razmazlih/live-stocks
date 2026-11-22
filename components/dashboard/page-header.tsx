import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DashboardQuickAction } from './quick-actions';

export interface PageMetaBadge {
  key: string;
  icon?: LucideIcon;
  label: string;
  loading?: boolean;
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

export function PageHeader({ title, subtitle, metaBadges = [], quickActions = [], actions, backHref, backLabel = 'Back', className }: PageHeaderProps) {
  return <header className={cn('py-1', className)}>
    {backHref ? <Button asChild variant="ghost" size="sm" className="mb-3 -ms-3 w-fit gap-2 text-slate-600"><Link href={backHref}><ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />{backLabel}</Link></Button> : null}
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p> : null}
        {metaBadges.length > 0 ? <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {metaBadges.map((badge) => {
            const BadgeIcon = badge.icon;
            return <div key={badge.key} className="inline-flex items-center gap-1.5 tabular-nums">
              {BadgeIcon && <BadgeIcon aria-hidden className="h-3.5 w-3.5" />}
              {badge.loading ? <div className="relative" aria-hidden>
                <span className="invisible">{badge.label}</span>
                <Skeleton className="absolute inset-0 my-auto h-3" />
              </div> : <span>{badge.label}</span>}
            </div>;
          })}
        </div> : null}
      </div>
      {quickActions.length || actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {quickActions.map((action) => { const Icon = action.icon; const content = <><Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', action.iconClassName)} /><span className={action.labelClassName}>{action.label}</span></>; return <Button key={action.key} variant={action.variant ?? 'outline'} size="sm" asChild={Boolean(action.href)} onClick={action.onClick} disabled={action.disabled} aria-label={action.ariaLabel ?? action.label} className={cn('gap-2 rounded-lg', action.className)}>{action.href ? <Link href={action.href}>{content}</Link> : content}</Button>; })}
        {actions}
      </div> : null}
    </div>
  </header>;
}
