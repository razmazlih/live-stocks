import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarketOverviewSkeleton, OverviewSkeleton } from '@/components/dashboard/overview-skeleton';
import { LocalMarketFooterSkeleton } from '@/components/dashboard/local-market-switcher';
import { overviewLayoutInitScript } from '@/lib/overview-layout-init';
import { diskMarketModeKey, reviewMarketModeKey } from '@/lib/demo/market-scenarios';
import { demoLocaleKey } from '@/lib/entry-locale';
import { demoScenarioClock, readMarketLayoutPhase } from '@/lib/demo/review';
import { getMarketClock } from '@/lib/utils/trading-hours';

function runBeforePaint(time: string, development = false, review = false) {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(time));
  window.Function(overviewLayoutInitScript(development, review))();
  return document.documentElement.dataset.loadingMarketPhase;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  for (const key of ['loadingMarketPhase', 'initialDemoMarketLayout', 'localMarketFooter']) delete document.documentElement.dataset[key];
});

describe('overview entry and partial market placeholders', () => {
  it('selects the correct frame before hydration at session boundaries, including previous UTC date, holidays and early close', () => {
    for (const time of [
      '2026-11-20T08:59:00Z', '2026-11-20T09:00:00Z', '2026-11-20T14:30:00Z',
      '2026-11-20T21:00:00Z', '2026-11-21T00:59:00Z', '2026-11-21T01:00:00Z',
      '2026-11-26T16:00:00Z', '2026-11-27T17:59:00Z', '2026-11-27T18:00:00Z',
      '2026-07-01T13:30:00Z', '2026-07-01T20:00:00Z', '2027-01-13T03:00:00Z', '2032-11-21T17:00:00Z',
    ]) {
      const phase = getMarketClock(Date.parse(time)).phase;
      expect(runBeforePaint(time), time).toBe(phase === 'pre' || phase === 'post' ? 'extended' : phase === 'overnight' ? 'closed' : phase);
    }
    const markup = renderToStaticMarkup(<OverviewSkeleton locale="en" />);
    for (const phase of ['regular', 'extended', 'closed', 'unknown']) expect(markup).toContain('data-entry-phase="' + phase + '"');
  });

  it('matches the remembered disk demo before auth without granting a financial override', () => {
    vi.stubEnv('NODE_ENV', 'development');
    localStorage.setItem(demoLocaleKey, 'he');
    sessionStorage.setItem(diskMarketModeKey, 'regular');
    expect(runBeforePaint('2026-11-21T17:00:00Z', true)).toBe('regular');
    expect(readMarketLayoutPhase()).toBe('regular');
    expect(demoScenarioClock()).toBeNull();
    const { container } = render(<><OverviewSkeleton locale="he" /><LocalMarketFooterSkeleton /></>);
    expect(container.querySelector('[data-market-skeleton] [data-part]')).toHaveAttribute('data-part', 'daily');
    expect(container.querySelector('footer')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('ignores demo presets in production and preserves isolated review links', () => {
    sessionStorage.setItem(diskMarketModeKey, 'regular');
    localStorage.setItem(demoLocaleKey, 'he');
    window.history.replaceState({}, '', '/?scenario=extended');
    expect(runBeforePaint('2026-11-21T17:00:00Z')).toBe('closed');
    expect(document.documentElement.dataset.localMarketFooter).toBeUndefined();
    expect(runBeforePaint('2026-11-21T17:00:00Z', false, true)).toBe('extended');
    expect(readMarketLayoutPhase()).toBe('post');
    window.history.replaceState({}, '', '/');
    sessionStorage.setItem(reviewMarketModeKey, 'closed');
    expect(runBeforePaint('2026-11-20T20:00:00Z', false, true)).toBe('closed');
  });

  it('keeps loaded holdings usable while the session panel alone is pending', () => {
    const { container } = render(<MarketOverviewSkeleton locale="he" phase="post" />);
    expect(screen.getByRole('status')).toHaveTextContent('טוען את נתוני המסחר');
    expect(container.querySelector('[data-page-loading]')).toBeNull();
    expect(Array.from(container.querySelectorAll('[data-part]'), element => element.getAttribute('data-part'))).toEqual(['target', 'daily', 'mover']);
  });
});
