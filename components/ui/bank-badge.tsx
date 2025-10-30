import { cn } from '@/lib/utils';
import { type PositionLocation } from '@/types';

const bankStyles: Record<PositionLocation, { container: string; icon: string; glyph: string }> = {
  bank_one: {
    container:
      'bg-gradient-to-r from-[#2F2A85] via-[#3D34A6] to-[#4C41C9] text-white shadow-[0_4px_18px_-6px_rgba(58,46,171,0.45)]',
    icon: 'bg-white/15 text-white',
    glyph: '10',
  },
  bank_two: {
    container:
      'bg-gradient-to-r from-[#FF4B5C] via-[#FF5F6C] to-[#FF7B6E] text-white shadow-[0_4px_18px_-6px_rgba(255,99,99,0.45)]',
    icon: 'bg-white/15 text-white',
    glyph: 'P',
  },
};

const sizeStyles = {
  sm: {
    wrapper: 'text-xs px-2 py-1 gap-1.5',
    icon: 'h-5 w-5 text-[11px]',
  },
  md: {
    wrapper: 'text-sm px-3 py-1.5 gap-2',
    icon: 'h-6 w-6 text-xs',
  },
} as const;

export type BankBadgeSize = keyof typeof sizeStyles;

interface BankBadgeProps {
  location: PositionLocation;
  label: string;
  size?: BankBadgeSize;
  className?: string;
}

export function BankBadge({ location, label, size = 'md', className }: BankBadgeProps) {
  const style = bankStyles[location];
  const sizeStyle = sizeStyles[size];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold tracking-tight ring-1 ring-black/5 backdrop-blur-sm',
        'transition-all duration-200 ease-out',
        style.container,
        sizeStyle.wrapper,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full uppercase',
          style.icon,
          sizeStyle.icon,
          'font-bold',
        )}
      >
        {style.glyph}
      </span>
      <span className="whitespace-nowrap leading-none">{label}</span>
    </span>
  );
}
