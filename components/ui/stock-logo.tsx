'use client';

import { Building2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StockAvatarImage } from '@/components/ui/stock-avatar-image';
import { cn } from '@/lib/utils';

const COMPANY_MARKS: Record<string, string> = { CAPR: '/stock-logos/CAPR.png' };

export function StockLogo({ symbol, display, imageUrl, className }: {
  symbol: string;
  display: string;
  imageUrl?: string | null;
  className?: string;
}) {
  return <Avatar aria-hidden="true" className={cn('holding-monogram h-11 w-11 shrink-0 rounded-xl border border-slate-200/80 bg-white shadow-none', className)}>
    <StockAvatarImage symbol={symbol} display={display} imageUrl={imageUrl} sourceOverride={COMPANY_MARKS[symbol.trim().toUpperCase()]} plain className="p-1.5" />
    <AvatarFallback className="rounded-[inherit] bg-white text-slate-400"><Building2 aria-hidden className="h-4 w-4" /></AvatarFallback>
  </Avatar>;
}
