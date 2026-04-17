'use client';

import * as React from 'react';
import {
  Card as HeroCard,
  CardHeader as HeroCardHeader,
  CardBody as HeroCardBody,
  CardFooter as HeroCardFooter,
} from '@heroui/react';

import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <HeroCard
      ref={ref as unknown as React.Ref<HTMLDivElement>}
      as="div"
      shadow="none"
      radius="lg"
      className={cn(
        'app-card-shell min-w-0 rounded-[1.25rem] border border-[color:var(--color-slate-200)]/78 bg-[linear-gradient(160deg,rgba(255,255,255,0.97),rgba(249,250,251,0.93))] text-card-foreground shadow-[0_22px_42px_-36px_rgba(15,23,42,0.48)] backdrop-blur-md transition-[border-color,box-shadow,transform] duration-200 ease-out hover:border-[color:var(--color-emerald-200)]/90',
        className
      )}
      {...(props as Record<string, unknown>)}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <HeroCardHeader
      ref={ref}
      className={cn('app-card-header flex min-w-0 flex-col space-y-1 p-3.5 sm:space-y-1.5 sm:p-6', className)}
      {...props}
    />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('min-w-0 font-semibold leading-tight tracking-tight text-balance', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('min-w-0 text-sm leading-6 text-muted-foreground', className)}
      {...props}
    />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <HeroCardBody ref={ref} className={cn('app-card-content min-w-0 p-3.5 pt-0 sm:p-6 sm:pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <HeroCardFooter
      ref={ref}
      className={cn('app-card-footer flex min-w-0 items-center p-3.5 pt-0 sm:p-6 sm:pt-0', className)}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
