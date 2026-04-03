'use client';

import * as React from 'react';
import { Input as HeroInput } from '@heroui/react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <HeroInput
        ref={ref as React.Ref<HTMLInputElement>}
        type={type}
        variant="bordered"
        radius="lg"
        classNames={{
          inputWrapper: cn(
            'control-shell min-h-10 border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.88)] px-3.5 shadow-[0_16px_28px_-26px_rgba(15,23,42,0.7)] transition-[color,background-color,border-color,box-shadow] duration-200 ease-out hover:border-[color:var(--color-blue-200)]/90 data-[focus=true]:border-[color:var(--color-blue-400)] data-[focus=true]:ring-2 data-[focus=true]:ring-[color:var(--color-blue-300)]/60',
            className
          ),
          input:
            'text-base leading-5 text-[var(--color-primary-900)] placeholder:text-muted-foreground/70 md:text-sm',
        }}
        {...(props as Record<string, unknown>)}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
