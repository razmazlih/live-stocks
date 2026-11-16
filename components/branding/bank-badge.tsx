'use client';

import { Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInvestmentSources } from '@/hooks/use-investment-sources';

export type BankIdentifier = string;

/** Kept as a compatible component name while callers migrate to personal sources. */
export function BankBadge({ bank, locale = 'he', size = 'md', className }: {
  bank: BankIdentifier; locale?: 'he' | 'en'; size?: 'sm' | 'md'; className?: string;
}) {
  const { sourceName } = useInvestmentSources();
  return <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 font-medium text-slate-700', size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs', className)}>
    <Landmark aria-hidden className="h-3.5 w-3.5 shrink-0" /><bdi className="break-words">{sourceName(bank, locale)}</bdi>
  </span>;
}
