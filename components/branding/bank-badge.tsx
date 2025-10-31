import { cn } from '@/lib/utils';

export type BankIdentifier = 'bank_one' | 'bank_two';

const sizeStyles = {
  sm: {
    container: 'px-2.5 py-0.5 text-[11px]',
    icon: 'h-6 w-6',
  },
  md: {
    container: 'px-3 py-1 text-xs',
    icon: 'h-7 w-7',
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

const bankVisuals: Record<
  BankIdentifier,
  {
    gradient: string;
    ring: string;
    shadow: string;
    iconRing: string;
    iconShadow: string;
  }
> = {
  bank_one: {
    gradient: 'from-[#1F1F23] via-[#111214] to-[#000000]',
    ring: 'ring-white/10',
    shadow: 'shadow-[0_12px_26px_rgba(0,0,0,0.35)]',
    iconRing: 'ring-white/15',
    iconShadow: 'shadow-[0_6px_14px_rgba(0,0,0,0.45)]',
  },
  bank_two: {
    gradient: 'from-[#FF8CB8] via-[#FF2E82] to-[#F00062]',
    ring: 'ring-[#FF8EBA]/40',
    shadow: 'shadow-[0_12px_26px_rgba(255,63,120,0.28)]',
    iconRing: 'ring-[#FFD0E5]/60',
    iconShadow: 'shadow-[0_6px_16px_rgba(255,70,140,0.35)]',
  },
};

function OneZeroIcon() {
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-[2px] bg-[#000000] px-[6px] py-[4px] text-[0.5rem] font-black uppercase leading-none text-white">
      <span className="tracking-[0.35em]">ONE</span>
      <span className="tracking-[0.18em]">ZERO</span>
    </span>
  );
}

function PepperIcon({ locale }: { locale: BankBadgeProps['locale'] }) {
  const isHebrew = locale === 'he';
  const textStyles = isHebrew
    ? 'font-bold tracking-[0.02em]'
    : 'font-black uppercase tracking-[0.08em]';

  return (
    <span
      className={cn(
        'flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FF8CB8] via-[#FF2E82] to-[#F00062] px-[6px] text-[0.58rem] text-white',
        textStyles
      )}
    >
      {isHebrew ? 'פפר.' : 'PEPPER.'}
    </span>
  );
}

function renderIcon(bank: BankIdentifier, locale: BankBadgeProps['locale'], size: Size) {
  const iconBase = 'flex items-center justify-center rounded-xl overflow-hidden ring-1';
  const { icon } = sizeStyles[size];
  const visuals = bankVisuals[bank];

  const iconClasses = cn(iconBase, icon, visuals.iconRing, visuals.iconShadow);

  if (bank === 'bank_one') {
    return (
      <span className={iconClasses}>
        <OneZeroIcon />
      </span>
    );
  }

  return (
    <span className={iconClasses}>
      <PepperIcon locale={locale} />
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
