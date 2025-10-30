import { cn } from '@/lib/utils';

export type BankIdentifier = 'bank_one' | 'bank_two';

const sizeStyles = {
  sm: {
    container: 'px-2.5 py-0.5 text-[11px]',
    icon: 'h-4 w-4 text-[10px] font-semibold',
  },
  md: {
    container: 'px-3 py-1 text-xs',
    icon: 'h-5 w-5 text-[11px] font-semibold',
  },
} as const;

type Size = keyof typeof sizeStyles;

type BankBadgeProps = {
  bank: BankIdentifier;
  label: string;
  locale?: 'he' | 'en';
  size?: Size;
  className?: string;
};

const bankVisuals: Record<BankIdentifier, { gradient: string; ring: string; shadow: string }> = {
  bank_one: {
    gradient: 'from-[#00C6FF] via-[#0095FF] to-[#0055FF]',
    ring: 'ring-[#12BFFD]/40',
    shadow: 'shadow-[0_8px_20px_rgba(8,145,220,0.22)]',
  },
  bank_two: {
    gradient: 'from-[#FF8FB7] via-[#FF5F96] to-[#FF2E63]',
    ring: 'ring-[#FF4F8A]/35',
    shadow: 'shadow-[0_8px_20px_rgba(244,63,94,0.22)]',
  },
};

function renderIcon(bank: BankIdentifier, locale: BankBadgeProps['locale'], size: Size) {
  const iconBase = 'flex items-center justify-center rounded-full';
  const { icon } = sizeStyles[size];

  if (bank === 'bank_one') {
    return (
      <span className={cn(iconBase, icon, 'bg-white/25 text-white tracking-tight')}>01</span>
    );
  }

  return (
    <span
      className={cn(
        iconBase,
        icon,
        'bg-white text-[#FF2E63] font-bold tracking-tight'
      )}
    >
      {locale === 'he' ? 'פ' : 'P'}
    </span>
  );
}

export function BankBadge({ bank, label, locale = 'he', size = 'md', className }: BankBadgeProps) {
  const sizeTokens = sizeStyles[size];
  const visuals = bankVisuals[bank];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-gradient-to-r font-semibold text-white transition-transform duration-200 ease-out',
        'ring-1 ring-inset',
        visuals.gradient,
        visuals.ring,
        visuals.shadow,
        sizeTokens.container,
        className
      )}
    >
      {renderIcon(bank, locale, size)}
      <span className="leading-tight">{label}</span>
    </span>
  );
}
