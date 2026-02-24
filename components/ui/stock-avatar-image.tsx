'use client';

import { useEffect, useMemo, useState } from 'react';

import { AvatarImage } from '@/components/ui/avatar';

interface StockAvatarImageProps {
  symbol: string;
  display: string;
  imageUrl?: string | null;
}

const PREFERRED_LOGO_STORAGE_KEY = 'stock-avatar-preferred-logos:v1';

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function readPreferredLogo(symbol: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PREFERRED_LOGO_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, string> | null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const candidate = parsed[symbol];
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;
  } catch {
    return null;
  }
}

function writePreferredLogo(symbol: string, logoUrl: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const raw = window.localStorage.getItem(PREFERRED_LOGO_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const next = parsed && typeof parsed === 'object' ? parsed : {};
    next[symbol] = logoUrl;
    window.localStorage.setItem(PREFERRED_LOGO_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best-effort cache only.
  }
}

function buildLogoCandidates(symbol: string, imageUrl?: string | null, preferredLogoUrl?: string | null): string[] {
  const normalizedSymbol = normalizeSymbol(symbol);
  const lowerSymbol = normalizedSymbol.toLowerCase();

  const candidates = [
    preferredLogoUrl?.trim() || '',
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
  const normalizedSymbol = useMemo(() => normalizeSymbol(symbol), [symbol]);
  const [preferredLogoUrl, setPreferredLogoUrl] = useState<string | null>(null);
  const logoCandidates = useMemo(
    () => buildLogoCandidates(symbol, imageUrl, preferredLogoUrl),
    [imageUrl, preferredLogoUrl, symbol]
  );
  const [activeSrc, setActiveSrc] = useState<string | null>(null);

  useEffect(() => {
    setPreferredLogoUrl(readPreferredLogo(normalizedSymbol));
  }, [normalizedSymbol]);

  useEffect(() => {
    let cancelled = false;
    let activeImage: HTMLImageElement | null = null;
    let timeoutId: number | null = null;

    const probeCandidate = (index: number) => {
      if (cancelled) {
        return;
      }
      if (index >= logoCandidates.length) {
        setActiveSrc(null);
        return;
      }

      const candidate = logoCandidates[index];
      activeImage = new window.Image();

      const complete = (success: boolean) => {
        if (cancelled) {
          return;
        }

        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (success) {
          setActiveSrc(candidate);
          if (index > 0) {
            writePreferredLogo(normalizedSymbol, candidate);
          }
          return;
        }

        probeCandidate(index + 1);
      };

      activeImage.onload = () => complete(true);
      activeImage.onerror = () => complete(false);
      timeoutId = window.setTimeout(() => complete(false), 3500);
      activeImage.src = candidate;
    };

    setActiveSrc(logoCandidates[0] ?? null);
    probeCandidate(0);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (activeImage) {
        activeImage.onload = null;
        activeImage.onerror = null;
      }
    };
  }, [logoCandidates, normalizedSymbol]);

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
      />
    </>
  );
}
