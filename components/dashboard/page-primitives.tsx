import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface DashboardContainerProps {
  children: ReactNode;
  className?: string;
  width?: 'md' | 'lg' | 'xl' | 'full';
}

const WIDTH_CLASS: Record<NonNullable<DashboardContainerProps['width']>, string> = {
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
  full: 'max-w-[1560px]',
};

export function DashboardContainer({
  children,
  className,
  width = 'full',
}: DashboardContainerProps) {
  return (
    <div className={cn('mx-auto w-full min-w-0 px-4 py-8 sm:px-6 lg:px-8', WIDTH_CLASS[width], className)}>
      {children}
    </div>
  );
}

export function DashboardMain({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <main className={cn('mt-5 space-y-5', className)}>{children}</main>;
}

export function DashboardSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6', className)}>
      {children}
    </section>
  );
}

export function DashboardLoading({
  icon,
  label,
  className,
}: {
  icon: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-slate-500', className)}>
      {icon}
      <p>{label}</p>
    </div>
  );
}

export function DashboardEmptyPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16 text-center', className)}>
      {children}
    </div>
  );
}
