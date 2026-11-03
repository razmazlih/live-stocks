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
