'use client';

import * as React from 'react';
import { ToastProvider } from '@heroui/react';

type ToasterProps = React.ComponentProps<typeof ToastProvider>;

const Toaster = ({ placement = 'top-center', ...props }: ToasterProps) => {
  return (
    <ToastProvider
      placement={placement}
      maxVisibleToasts={5}
      toastProps={{
        radius: 'lg',
        variant: 'flat',
      }}
      {...props}
    />
  );
};

export { Toaster };
