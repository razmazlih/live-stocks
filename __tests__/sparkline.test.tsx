import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from '@/components/charts/sparkline';

const points = [
  { timestamp: 1_700_000_000_000, close: 100 },
  { timestamp: 1_700_086_400_000, close: 110 },
];

describe('Sparkline required exit target', () => {
  it('draws the target and its shaded gap inside the chart scale', () => {
    const { container } = render(
      <Sparkline points={points} width={320} height={96} projectedPrice={115} requiredExitPrice={130} />,
    );

    const targetLine = container.querySelector('[data-testid="sparkline-required-exit-line"]');
    const gap = container.querySelector('[data-testid="sparkline-required-exit-gap"]');

    expect(targetLine).not.toBeNull();
    expect(gap).not.toBeNull();
    expect(Number(targetLine?.getAttribute('y1'))).toBeGreaterThanOrEqual(0);
    expect(Number(targetLine?.getAttribute('y1'))).toBeLessThanOrEqual(96);
    expect(Number(gap?.getAttribute('height'))).toBeGreaterThan(0);
  });

  it('keeps the optional target visuals absent when no target is passed', () => {
    const { container } = render(
      <Sparkline points={points} width={320} height={96} projectedPrice={115} />,
    );

    expect(container.querySelector('[data-testid="sparkline-required-exit-line"]')).toBeNull();
    expect(container.querySelector('[data-testid="sparkline-required-exit-gap"]')).toBeNull();
  });
});

describe('Sparkline transaction date domain', () => {
  const priceHistory = [
    { timestamp: Date.UTC(2025, 0, 2), close: 100 },
    { timestamp: Date.UTC(2025, 0, 3), close: 110 },
  ];
  const events = [
    { id: 'entry', type: 'BUY' as const, timestamp: Date.UTC(2025, 0, 1), price: 90, quantity: 1 },
    { id: 'exit', type: 'SELL' as const, timestamp: Date.UTC(2025, 0, 4), price: 120, quantity: 1 },
  ];

  it('shows real transaction dates outside candle history without manufacturing price points', () => {
    const { container } = render(<Sparkline points={priceHistory} events={events} includeEventsInDomain width={300} />);
    expect(container.querySelector('circle[aria-label="BUY at 90"]')).toHaveAttribute('cx', '0');
    expect(container.querySelector('circle[aria-label="SELL at 120"]')).toHaveAttribute('cx', '300');
    const priceLine = container.querySelector('path[stroke-width="2.35"]');
    // Price history begins one third across the extended axis, not at the entry transaction.
    expect(priceLine?.getAttribute('d')).toMatch(/^M 100 /);
    expect(priceLine?.getAttribute('d')).toContain('L 200 ');
  });

  it('preserves the existing price-only time domain by default', () => {
    const { container } = render(<Sparkline points={priceHistory} events={events} width={300} />);
    expect(container.querySelector('path[stroke-width="2.35"]')?.getAttribute('d')).toMatch(/^M 0 /);
  });
});

describe('Sparkline historical holding colors', () => {
  const start = Date.UTC(2025, 0, 1);
  const day = 86_400_000;
  const history = Array.from({ length: 8 }, (_, index) => ({ timestamp: start + index * day, close: 105 }));
  const periods = [
    { id: 'old', start, end: start + 3 * day, current: false },
    { id: 'new', start: start + 5 * day, end: null, current: true },
  ];
  const colorAt = (container: HTMLElement, fraction: number) => {
    const stops = Array.from(container.querySelectorAll('linearGradient:first-child stop'));
    return stops.filter((stop) => Number.parseFloat(stop.getAttribute('offset') ?? '0') <= fraction * 100).at(-1)?.getAttribute('stop-color');
  };

  it.each([
    { baseline: 110, target: 120, expected: '#f00' },
    { baseline: 100, target: 110, expected: '#00f' },
    { baseline: 90, target: 100, expected: '#0f0' },
  ])('uses the old holding reference for $expected while keeping time outside holdings gray', ({ baseline, target, expected }) => {
    const holdingReferences = history.map((point, index) => ({
      timestamp: point.timestamp,
      baseline: index < 3 ? baseline : index < 5 ? null : 200,
      target: index < 3 ? target : index < 5 ? null : 220,
    }));
    const { container } = render(<Sparkline
      points={history} holdingPeriods={periods} holdingReferences={holdingReferences}
      baseline={200} projectedPrice={220} activeFromTimestamp={start + 5 * day}
      belowEntryColor="#f00" betweenProjectedColor="#00f" aboveProjectedColor="#0f0" inactiveBeforeColor="#888"
    />);

    // The latest entry/target must not recolor the earlier, already closed cycle.
    expect(colorAt(container, 1.5 / 7)).toBe(expected);
    expect(colorAt(container, 4 / 7)).toBe('#888');
    expect(colorAt(container, 6 / 7)).toBe('#f00');
  });

  it('leaves an earlier active interval gray when its own reference is missing', () => {
    const { container } = render(<Sparkline
      points={history} holdingPeriods={periods}
      holdingReferences={history.map((point, index) => ({ timestamp: point.timestamp, baseline: index < 5 ? null : 100, target: index < 5 ? null : 110 }))}
      baseline={100} projectedPrice={110} belowEntryColor="#f00" betweenProjectedColor="#00f" aboveProjectedColor="#0f0" inactiveBeforeColor="#888"
    />);
    expect(colorAt(container, 1.5 / 7)).toBe('#888');
    expect(colorAt(container, 6 / 7)).toBe('#00f');
  });
});
