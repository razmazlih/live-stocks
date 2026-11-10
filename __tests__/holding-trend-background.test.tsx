import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HoldingTrendBackground } from '@/components/portfolio/holding-trend-background';

// Only actual price observations belong in the background; a lone observation
// must not turn into an invented trend.
describe('HoldingTrendBackground', () => {
  it('omits empty histories and histories with fewer than two valid unique timestamps', () => {
    const { container, rerender } = render(<HoldingTrendBackground points={[]} />);
    expect(container.querySelector('svg')).toBeNull();
    rerender(<HoldingTrendBackground points={[
      { timestamp: 100, close: 12 },
      { timestamp: 100, close: 15 },
      { timestamp: Number.NaN, close: 20 },
      { timestamp: 200, close: Number.POSITIVE_INFINITY },
      { timestamp: 300, close: -1 },
    ]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('sorts and deduplicates prices while preserving real elapsed-time spacing', () => {
    const { container } = render(<HoldingTrendBackground points={[
      { timestamp: 1000, close: 20 },
      { timestamp: 250, close: 999 },
      { timestamp: 0, close: 10 },
      { timestamp: 250, close: 15 },
      { timestamp: 500, close: Number.NaN },
    ]} />);
    const line = container.querySelector('path[fill="none"]');
    // The middle point is one quarter through the time span, not halfway.
    // Its duplicated timestamp uses the latest observation, excluding 999
    // from the price domain as well as from the line.
    expect(line).toHaveAttribute('d', 'M8.00,136.00 L254.00,80.00 L992.00,24.00');
    expect(line).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    expect(container.querySelector('circle')).toHaveAttribute('cx', '992');
  });

  it('renders a finite flat line as decoration without another accessible chart', () => {
    const { container } = render(<HoldingTrendBackground points={[
      { timestamp: 100, close: 0 },
      { timestamp: 200, close: 0 },
    ]} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveClass('pointer-events-none');
    expect(container.querySelector('path[fill="none"]')).toHaveAttribute('d', 'M8.00,80.00 L992.00,80.00');
    expect(svg?.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('title, desc, [tabindex]')).toBeNull();
  });
});
