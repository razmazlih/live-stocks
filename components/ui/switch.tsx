'use client';

import * as React from 'react';
import { Switch as HeroSwitch } from '@heroui/react';

import { cn } from '@/lib/utils';

type HeroSwitchProps = React.ComponentPropsWithoutRef<typeof HeroSwitch>;

interface SwitchProps
  extends Omit<HeroSwitchProps, 'isSelected' | 'defaultSelected' | 'onValueChange'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) => (
    <HeroSwitch
      ref={ref}
      isSelected={checked}
      defaultSelected={defaultChecked}
      onValueChange={onCheckedChange}
      className={cn('inline-flex', className)}
      {...props}
    />
  )
);
Switch.displayName = 'Switch';

export { Switch };
