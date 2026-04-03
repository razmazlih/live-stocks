import { addToast } from '@heroui/react';

function toText(value: string | Error): string {
  if (value instanceof Error) {
    return value.message;
  }

  return value;
}

export const toast = {
  success(message: string | Error) {
    return addToast({
      title: toText(message),
      color: 'success',
      severity: 'success',
    });
  },
  error(message: string | Error) {
    return addToast({
      title: toText(message),
      color: 'danger',
      severity: 'danger',
    });
  },
  info(message: string | Error) {
    return addToast({
      title: toText(message),
      color: 'primary',
      severity: 'primary',
    });
  },
  warning(message: string | Error) {
    return addToast({
      title: toText(message),
      color: 'warning',
      severity: 'warning',
    });
  },
};
