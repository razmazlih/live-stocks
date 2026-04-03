'use client';

import * as React from 'react';
import { Chip } from '@heroui/react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex min-h-6 max-w-full items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-none tracking-wide shadow-[0_10px_18px_-14px_rgba(15,23,42,0.45)] transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blue-300)] focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-[color:var(--color-blue-200)]/80 bg-[color:var(--color-blue-50)]/86 text-[var(--color-blue-700)]',
        secondary:
          'border-[color:var(--color-slate-200)]/85 bg-[color:var(--color-slate-50)]/88 text-[var(--color-slate-700)]',
        destructive:
          'border-[color:var(--color-red-200)]/85 bg-[color:var(--color-red-50)]/88 text-[var(--color-red-700)]',
        outline: 'border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.7)] text-[var(--color-slate-700)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends VariantProps<typeof badgeVariants> {
  className?: string;
  children?: React.ReactNode;
}

function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <Chip
      radius="full"
      variant="flat"
      className={cn(badgeVariants({ variant }), className)}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Chip>
  );
}

export { Badge, badgeVariants };
