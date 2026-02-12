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
    <AvatarImage
      src={activeSrc}
      alt={display}
      onLoadingStatusChange={(status) => {
        if (status === 'error' && candidateIndex < logoCandidates.length - 1) {
          setCandidateIndex((prev) => Math.min(prev + 1, logoCandidates.length - 1));
        }
      }}
    />
  );
}
