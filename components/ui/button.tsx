'use client';

import * as React from 'react';
import { Button as HeroButton } from '@heroui/react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-emerald-400)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-neutral-white)] active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none touch-manipulation select-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border border-transparent bg-[linear-gradient(135deg,var(--color-emerald-700),var(--color-emerald-500))] text-[color:var(--color-neutral-white)] shadow-[0_16px_28px_-18px_rgba(5,150,105,0.58)] hover:bg-[linear-gradient(135deg,var(--color-emerald-700),var(--color-emerald-600))] hover:shadow-[0_18px_30px_-18px_rgba(5,150,105,0.66)]',
        destructive:
          'border border-transparent bg-[linear-gradient(135deg,var(--color-red-600),var(--color-rose-600))] text-[color:var(--color-neutral-white)] shadow-[0_16px_28px_-18px_rgba(220,38,38,0.58)] hover:shadow-[0_18px_30px_-16px_rgba(220,38,38,0.68)]',
        outline:
          'border border-[color:var(--color-slate-200)]/90 bg-[rgba(255,255,255,0.9)] text-[var(--color-slate-700)] shadow-[0_10px_24px_-20px_rgba(15,23,42,0.5)] hover:border-[color:var(--color-emerald-200)]/90 hover:bg-[rgba(255,255,255,0.98)] hover:text-[var(--color-primary-900)]',
        secondary:
          'border border-[color:var(--color-slate-200)]/90 bg-[color:var(--color-slate-50)]/90 text-[var(--color-slate-700)] shadow-[0_10px_24px_-20px_rgba(15,23,42,0.5)] hover:bg-[color:var(--color-slate-100)]/88 hover:text-[var(--color-primary-900)]',
        ghost:
          'text-[var(--color-slate-700)] hover:bg-[color:var(--color-emerald-50)]/72 hover:text-[var(--color-emerald-700)] hover:shadow-none',
        link: 'rounded-none p-0 text-[var(--color-emerald-700)] underline-offset-4 hover:underline hover:text-[var(--color-emerald-600)]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-xl px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function mapHeroVariant(variant: ButtonProps['variant']): {
  variant: 'solid' | 'bordered' | 'flat' | 'light';
  color: 'primary' | 'danger' | 'default';
} {
  const safeVariant = variant ?? 'default';

  if (safeVariant === 'outline') {
    return { variant: 'bordered' as const, color: 'default' as const };
  }
  if (safeVariant === 'secondary') {
    return { variant: 'flat' as const, color: 'default' as const };
  }
  if (safeVariant === 'ghost' || safeVariant === 'link') {
    return { variant: 'light' as const, color: 'default' as const };
  }
  if (safeVariant === 'destructive') {
    return { variant: 'solid' as const, color: 'danger' as const };
  }
  return { variant: 'solid' as const, color: 'primary' as const };
}

function mapHeroSize(size: ButtonProps['size']) {
  const safeSize = size ?? 'default';

  if (safeSize === 'sm') {
    return 'sm' as const;
  }
  if (safeSize === 'lg') {
    return 'lg' as const;
  }
  return 'md' as const;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild = false, children, ...props }, ref) => {
    const variantClasses = cn(buttonVariants({ variant, size }), className);

    if (asChild) {
      const onlyChild = React.Children.only(children);

      if (!React.isValidElement(onlyChild)) {
        return null;
      }

      const childProps = onlyChild.props as { className?: string };

      return React.cloneElement(onlyChild, {
        className: cn(variantClasses, childProps.className),
      });
    }

    const { variant: heroVariant, color } = mapHeroVariant(variant);

    return (
      <HeroButton
        ref={ref}
        variant={heroVariant}
        color={color}
        size={mapHeroSize(size)}
        radius="lg"
        isIconOnly={size === 'icon'}
        className={variantClasses}
        {...(props as Record<string, unknown>)}
      >
        {children}
      </HeroButton>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
