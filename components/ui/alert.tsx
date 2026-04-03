'use client';

import * as React from 'react';
import { Alert as HeroAlert } from '@heroui/react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva('relative w-full rounded-lg', {
  variants: {
    variant: {
      default: '',
      destructive: '',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

interface AlertMarkerProps {
  className?: string;
  children?: React.ReactNode;
}

const AlertTitle = (_props: AlertMarkerProps) => null;
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = (_props: AlertMarkerProps) => null;
AlertDescription.displayName = 'AlertDescription';

type AlertElementProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>;

const Alert = React.forwardRef<HTMLDivElement, AlertElementProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const childArray = React.Children.toArray(children);

    const titleChild = childArray.find(
      (child): child is React.ReactElement<AlertMarkerProps> =>
        React.isValidElement(child) && child.type === AlertTitle
    );

    const descriptionChild = childArray.find(
      (child): child is React.ReactElement<AlertMarkerProps> =>
        React.isValidElement(child) && child.type === AlertDescription
    );

    const tone = variant === 'destructive' ? 'danger' : 'default';
    const heroVariant = variant === 'destructive' ? 'flat' : 'bordered';

    return (
      <HeroAlert
        ref={ref}
        color={tone}
        variant={heroVariant}
        title={titleChild?.props.children}
        description={descriptionChild?.props.children}
        className={cn(alertVariants({ variant }), className)}
        classNames={{
          title: cn('mb-1 font-medium leading-none tracking-tight', titleChild?.props.className),
          description: cn('text-sm [&_p]:leading-relaxed', descriptionChild?.props.className),
        }}
        {...(props as Record<string, unknown>)}
      />
    );
  }
);
Alert.displayName = 'Alert';

export { Alert, AlertTitle, AlertDescription };
