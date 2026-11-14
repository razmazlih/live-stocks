import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockAvatarImage } from '@/components/ui/stock-avatar-image';
import { TickerIdentity } from '@/components/watchlist/ticker-card';

const renderedSources = vi.hoisted(() => [] as string[]);
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  AvatarFallback: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  AvatarImage: ({ src, alt }: { src: string; alt: string }) => {
    renderedSources.push(src);
    // Inspect the exact requested URL without Next Image rewriting the test double.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} />;
  },
}));

const storageKey = 'stock-avatar-preferred-logos:v1';
const probes: ProbeImage[] = [];
const requestedSources: string[] = [];

class ProbeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private source = '';

  constructor() { probes.push(this); }
  set src(value: string) { this.source = value; requestedSources.push(value); }
  get src() { return this.source; }
}

function failCurrentProbe() {
  act(() => { probes[probes.length - 1].onerror?.(); });
}

beforeEach(() => {
  window.localStorage.clear();
  probes.length = 0;
  requestedSources.length = 0;
  renderedSources.length = 0;
  vi.stubGlobal('Image', ProbeImage);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('stock avatar logo sources', () => {
  it.each([
    { source: 'stored image', url: '  HTTPS://LoGo.ClEaRbIt.CoM/apple.com  ', plain: false },
    { source: 'stored image', url: '  HTTPS://LoGo.ClEaRbIt.CoM/apple.com  ', plain: true },
    { source: 'preferred cache', url: '//logo.clearbit.com/apple.com', plain: false },
    { source: 'preferred cache', url: '//logo.clearbit.com/apple.com', plain: true },
    { source: 'override', url: 'https://logo.clearbit.com./apple.com', plain: false },
    { source: 'override', url: 'https://logo.clearbit.com./apple.com', plain: true },
  ])('never requests a retired URL from $source (plain=$plain)', ({ source, url, plain }) => {
    if (source === 'preferred cache') {
      window.localStorage.setItem(storageKey, JSON.stringify({ AAPL: url }));
    }
    render(<StockAvatarImage symbol="AAPL" display="Apple"
      imageUrl={source === 'stored image' ? url : undefined}
      sourceOverride={source === 'override' ? url : undefined} plain={plain} />);

    // Exhaust every provider so a bad URL hidden later in the list is also caught.
    for (let attempt = 0; attempt < 10 && screen.queryByRole('img'); attempt += 1) {
      failCurrentProbe();
    }
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(requestedSources.length).toBeGreaterThan(0);
    expect([...requestedSources, ...renderedSources].some(src => /clearbit/i.test(src))).toBe(false);
  });

  it('prefers a valid cached logo, then tries the custom image when it fails', () => {
    const cached = 'https://example.com/cached-apple.png';
    const custom = 'https://example.com/custom-apple.png';
    window.localStorage.setItem(storageKey, JSON.stringify({ AAPL: cached }));
    render(<StockAvatarImage symbol=" aapl " display="Apple" imageUrl={custom} />);

    expect(screen.getByRole('img')).toHaveAttribute('src', cached);
    expect(probes[probes.length - 1].src).toBe(cached);
    failCurrentProbe();
    expect(probes[probes.length - 1].src).toBe(custom);
    act(() => { probes[probes.length - 1].onload?.(); });
    expect(screen.getByRole('img')).toHaveAttribute('src', custom);
  });

  it('keeps a local company mark ahead of valid cached and custom logos', () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ CAPR: 'https://example.com/capr.png' }));
    render(<StockAvatarImage symbol="CAPR" display="Capricor" imageUrl="https://example.com/custom.png"
      sourceOverride="/stock-logos/CAPR.png" plain />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/stock-logos/CAPR.png');
    expect(requestedSources.every(src => src === '/stock-logos/CAPR.png')).toBe(true);
  });

  it.each([false, true])('advances through existing alternatives and respects plain=$plain', plain => {
    render(<StockAvatarImage symbol="AAPL" display="Apple" plain={plain} />);
    expect(probes[probes.length - 1].src).toBe('https://financialmodelingprep.com/image-stock/AAPL.png');
    failCurrentProbe();
    expect(probes[probes.length - 1].src).toBe('https://assets.parqet.com/logos/symbol/AAPL');
    failCurrentProbe();
    expect(probes[probes.length - 1].src).toBe('https://eodhd.com/img/logos/US/AAPL.png');
    failCurrentProbe();

    if (plain) {
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(requestedSources.some(src => src.startsWith('https://ui-avatars.com/'))).toBe(false);
    } else {
      expect(probes[probes.length - 1].src).toMatch(/^https:\/\/ui-avatars.com\//);
      act(() => { probes[probes.length - 1].onload?.(); });
      expect(screen.getByRole('img')).toHaveAttribute('src', probes[probes.length - 1].src);
    }
    expect(requestedSources.some(src => /clearbit/i.test(src))).toBe(false);
  });

  it.each([false, true])('blocks retired watchlist images (compact=%s)', compact => {
    render(<TickerIdentity compact={compact} ticker={{ symbol: 'AAPL', display: 'Apple',
      imageUrl: 'https://logo.clearbit.com/apple.com' }} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://financialmodelingprep.com/image-stock/AAPL.png');
    expect([...requestedSources, ...renderedSources].some(src => /clearbit/i.test(src))).toBe(false);
  });

  it('preserves a supported custom watchlist image', () => {
    const imageUrl = 'https://example.com/apple.png';
    render(<TickerIdentity ticker={{ symbol: 'AAPL', display: 'Apple', imageUrl }} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', imageUrl);
    expect(requestedSources).toEqual([imageUrl]);
  });

  it('keeps watchlist initials without image requests when no image was supplied', () => {
    render(<TickerIdentity ticker={{ symbol: 'AAPL', display: 'Apple' }} />);
    expect(screen.getByText('AA')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(requestedSources).toEqual([]);
  });
});
