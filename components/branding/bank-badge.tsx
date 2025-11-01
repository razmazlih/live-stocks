import { cn } from '@/lib/utils';

export type BankIdentifier = 'bank_one' | 'bank_two';

const sizeStyles = {
  sm: {
    container: 'px-2.5 py-0.5 text-[11px]',
    iconWrapper: 'h-6 w-6',
    oneZeroLine: 'text-[6px] leading-[9px]',
    pepperWord: 'text-[6.5px]',
  },
  md: {
    container: 'px-3 py-1 text-xs',
    iconWrapper: 'h-7 w-7',
    oneZeroLine: 'text-[7px]',
    pepperWord: 'text-[7.5px]',
  },
} as const;

type Size = keyof typeof sizeStyles;

type BankBadgeProps = {
  bank: BankIdentifier;
  locale?: 'he' | 'en';
  size?: Size;
  className?: string;
};

const bankVisuals: Record<BankIdentifier, { background: string; ring: string; shadow: string }> = {
  bank_one: {
    background: 'bg-[var(--color-neutral-950)]',
    ring: 'ring-[hsl(var(--card))]/15',
    shadow: 'shadow-[0_8px_20px_var(--color-shadow-neutral-35)]',
  },
  bank_two: {
    background: 'bg-gradient-to-br from-[hsl(var(--destructive))] via-[hsl(var(--destructive))] to-[hsl(var(--destructive))]',
    ring: 'ring-[hsl(var(--destructive))]/40',
    shadow: 'shadow-[0_8px_20px_var(--color-shadow-hot-pink-28)]',
  },
};

function renderIcon(bank: BankIdentifier, locale: BankBadgeProps['locale'], size: Size) {
  const iconBase = 'flex items-center justify-center rounded-md';
  const { iconWrapper, oneZeroLine, pepperWord } = sizeStyles[size];

  if (bank === 'bank_one') {
    return (
      <span
        className={cn(
          iconBase,
          iconWrapper,
          'bg-[var(--color-neutral-900)] text-[hsl(var(--card))]'
        )}
      >
        <span
          className={cn(
            'flex flex-col items-center justify-center font-black uppercase tracking-[0.18em] leading-none',
            oneZeroLine
          )}
        >
          <span className="block">ONE</span>
          <span className="block">ZERO</span>
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        iconBase,
        iconWrapper,
        'bg-[hsl(var(--destructive))] text-[hsl(var(--card))] font-black uppercase tracking-[0.14em] leading-tight'
      )}
    >
      {locale === 'he' ? (
        <span className="flex flex-col items-center">
          <span className={pepperWord}>PEPPER</span>
          <span className="text-[60%] leading-none">פפר</span>
        </span>
      ) : (
        <span className={cn('leading-none', pepperWord)}>PEPPER.</span>
      )}
    </span>
  );
}

export function BankBadge({ bank, locale = 'he', size = 'md', className }: BankBadgeProps) {
  const sizeTokens = sizeStyles[size];
  const visuals = bankVisuals[bank];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full font-semibold text-[hsl(var(--card))] transition-transform duration-200 ease-out',
        'ring-1 ring-inset',
        visuals.background,
        visuals.ring,
        visuals.shadow,
        sizeTokens.container,
        className
      )}
    >
      {renderIcon(bank, locale, size)}
    </span>
  );
}
