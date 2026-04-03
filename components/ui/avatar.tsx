'use client';

import * as React from 'react';
import { Avatar as HeroAvatar } from '@heroui/react';

import { cn } from '@/lib/utils';

type AvatarImageElement = React.ReactElement<React.ImgHTMLAttributes<HTMLImageElement>>;
type AvatarFallbackElement = React.ReactElement<React.HTMLAttributes<HTMLDivElement>>;

const AvatarImage = (_props: React.ImgHTMLAttributes<HTMLImageElement>) => null;
AvatarImage.displayName = 'AvatarImage';

const AvatarFallback = (_props: React.HTMLAttributes<HTMLDivElement>) => null;
AvatarFallback.displayName = 'AvatarFallback';

const Avatar = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, children, ...props }, ref) => {
    const childArray = React.Children.toArray(children);

    const imageChild = childArray.find(
      (child): child is AvatarImageElement => React.isValidElement(child) && child.type === AvatarImage
    );
    const fallbackChild = childArray.find(
      (child): child is AvatarFallbackElement =>
        React.isValidElement(child) && child.type === AvatarFallback
    );

    const fallbackContent = fallbackChild?.props.children;

    return (
      <span
        ref={ref}
        className={cn('relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}
        {...props}
      >
        <HeroAvatar
          showFallback
          src={imageChild?.props.src}
          name={typeof fallbackContent === 'string' ? fallbackContent : undefined}
          className="h-full w-full"
          imgProps={{
            alt: imageChild?.props.alt,
            className: cn('aspect-square h-full w-full object-cover', imageChild?.props.className),
          }}
          classNames={{
            fallback: cn(
              'flex h-full w-full items-center justify-center rounded-full bg-muted',
              fallbackChild?.props.className
            ),
          }}
        />
      </span>
    );
  }
);
Avatar.displayName = 'Avatar';

export { Avatar, AvatarImage, AvatarFallback };
