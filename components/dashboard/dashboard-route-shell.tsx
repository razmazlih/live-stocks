'use client';

import { ReactNode, useMemo } from 'react';

import type { Locale } from '@/types';
import { useTranslation } from '@/lib/translations';

import type { AppRouteKey } from './navigation';
import { createAppRouteItems } from './navigation';
import { DashboardPageShell } from './page-shell';

interface DashboardRouteShellProps {
  activeKey: AppRouteKey;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  locale: Locale;
}

export function DashboardRouteShell({
  activeKey,
  children,
  className,
  contentClassName,
  locale,
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
      {children}
    </DashboardPageShell>
  );
}
