'use client';

import { useEffect, useMemo, useState } from 'react';

import { AvatarImage } from '@/components/ui/avatar';

interface StockAvatarImageProps {
  symbol: string;
  display: string;
  imageUrl?: string | null;
}

function buildLogoCandidates(symbol: string, imageUrl?: string | null): string[] {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const lowerSymbol = normalizedSymbol.toLowerCase();

  const candidates = [
    imageUrl?.trim() || '',
    `https://logo.clearbit.com/${lowerSymbol}.com`,
    `https://logo.clearbit.com/${lowerSymbol}.io`,
    `https://financialmodelingprep.com/image-stock/${normalizedSymbol}.png`,
    `https://assets.parqet.com/logos/symbol/${normalizedSymbol}`,
    `https://eodhd.com/img/logos/US/${normalizedSymbol}.png`,
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      normalizedSymbol
    )}&background=E2E8F0&color=1E293B&format=png&size=128`,
  ].filter(Boolean);

  return [...new Set(candidates)];
}

export function StockAvatarImage({ symbol, display, imageUrl }: StockAvatarImageProps) {
  const logoCandidates = useMemo(() => buildLogoCandidates(symbol, imageUrl), [imageUrl, symbol]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [logoCandidates]);

  const activeSrc = logoCandidates[candidateIndex];

  if (!activeSrc) {
    return null;
  }

  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_28%_24%,#f8fafc_0%,#e2e8f0_58%,#cbd5e1_100%)]"
      />
      <AvatarImage
        src={activeSrc}
        alt={display}
        className="relative z-10 h-full w-full rounded-[inherit] object-cover [filter:drop-shadow(0_0_1px_rgba(15,23,42,0.55))_drop-shadow(0_1px_2px_rgba(15,23,42,0.25))_drop-shadow(0_0_1px_rgba(255,255,255,0.95))]"
        onLoadingStatusChange={(status) => {
          if (status === 'error' && candidateIndex < logoCandidates.length - 1) {
            setCandidateIndex((prev) => Math.min(prev + 1, logoCandidates.length - 1));
          }
        }}
      />
    </>
  );
}
