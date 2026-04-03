'use client';

import * as React from 'react';
import { Textarea as HeroTextarea } from '@heroui/react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <HeroTextarea
        ref={ref as React.Ref<HTMLTextAreaElement>}
        variant="bordered"
        radius="lg"
        minRows={4}
        classNames={{
          inputWrapper: cn(
            'control-shell min-h-[104px] border-[color:var(--color-slate-200)]/85 bg-[rgba(255,255,255,0.88)] px-3.5 py-2.5 shadow-[0_16px_28px_-26px_rgba(15,23,42,0.7)] transition-[color,background-color,border-color,box-shadow] duration-200 ease-out hover:border-[color:var(--color-blue-200)]/90 data-[focus=true]:border-[color:var(--color-blue-400)] data-[focus=true]:ring-2 data-[focus=true]:ring-[color:var(--color-blue-300)]/60 sm:min-h-[88px] sm:py-2',
            className
          ),
          input:
            'text-base leading-6 text-[var(--color-primary-900)] placeholder:text-muted-foreground/70 md:text-sm',
        }}
        {...(props as Record<string, unknown>)}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
