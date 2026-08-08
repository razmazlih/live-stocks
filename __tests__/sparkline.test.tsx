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
