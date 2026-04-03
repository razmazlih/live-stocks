'use client';

import * as React from 'react';
import { ScrollShadow } from '@heroui/react';

import { cn } from '@/lib/utils';

const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <ScrollShadow
      ref={ref}
      className={cn('relative overflow-auto', className)}
      hideScrollBar={false}
      {...props}
    >
      {children}
    </ScrollShadow>
  )
);
ScrollArea.displayName = 'ScrollArea';

const ScrollBar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (_props, _ref) => null
);
ScrollBar.displayName = 'ScrollBar';

export { ScrollArea, ScrollBar };
