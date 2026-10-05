'use client';

import { ReactNode, useMemo } from 'react';

import type { Locale } from '@/types';
import { useTranslation } from '@/lib/translations';

import type { AppRouteKey } from './navigation';
import { createAppRouteItems } from './navigation';
import { DashboardPageShell } from './page-shell';
import { PortfolioFeedback } from './portfolio-feedback';

interface DashboardRouteShellProps {
  activeKey: AppRouteKey;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  locale: Locale;
  portfolioFeedback?: boolean;
}

export function DashboardRouteShell({
  activeKey,
  children,
  className,
  contentClassName,
  locale,
  portfolioFeedback = true,
}: DashboardRouteShellProps) {
  const { t } = useTranslation(locale);
  const navigationItems = useMemo(() => createAppRouteItems(t), [t]);

  return (
    <DashboardPageShell
      activeKey={activeKey}
      className={className}
      contentClassName={contentClassName}
      direction={locale === 'he' ? 'rtl' : 'ltr'}
      locale={locale}
      navigationItems={navigationItems}
    >
      {portfolioFeedback && ['dashboard', 'portfolio', 'realized', 'insights', 'aiPrompts', 'exceptions'].includes(activeKey)
        ? <PortfolioFeedback locale={locale}>{children}</PortfolioFeedback>
        : children}
    </DashboardPageShell>
  );
}
