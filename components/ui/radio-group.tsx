'use client';

import * as React from 'react';
import { RadioGroup as HeroRadioGroup, Radio as HeroRadio } from '@heroui/react';

import { cn } from '@/lib/utils';

type HeroRadioGroupProps = React.ComponentPropsWithoutRef<typeof HeroRadioGroup>;
type HeroRadioProps = React.ComponentPropsWithoutRef<typeof HeroRadio>;

const RadioGroup = React.forwardRef<HTMLDivElement, HeroRadioGroupProps>(
  ({ className, ...props }, ref) => {
    return <HeroRadioGroup ref={ref} className={cn('grid gap-2', className)} {...props} />;
  }
);
RadioGroup.displayName = 'RadioGroup';

const RadioGroupItem = React.forwardRef<HTMLInputElement, HeroRadioProps>(
  ({ className, children, value, ...props }, ref) => {
    return (
      <HeroRadio
        ref={ref}
        value={value}
        className={cn('inline-flex', className)}
        aria-label={typeof value === 'string' ? value : 'radio-option'}
        {...props}
      >
        {children ?? ''}
      </HeroRadio>
    );
  }
);
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
