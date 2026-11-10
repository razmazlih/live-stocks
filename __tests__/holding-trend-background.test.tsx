import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoldingTrendBackground } from '@/components/portfolio/holding-trend-background';

// Only actual price observations belong in the background; a lone observation
// must not turn into an invented trend.
describe('HoldingTrendBackground', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
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
    const line = container.querySelector('[data-price-line]');
    // The middle point is one quarter through the time span, not halfway.
    // Its duplicated timestamp uses the latest observation, excluding 999
    // from the price domain as well as from the line.
    expect(line).toHaveAttribute('d', 'M8.00,136.00 L254.00,80.00 L992.00,24.00');
    expect(line).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    expect(container.querySelector('[data-current-price]')).toHaveAttribute('transform', 'translate(992,24)');
    expect(container.querySelector('circle')).toHaveStyle({ transform: 'scale(var(--chart-marker-x, 1), var(--chart-marker-y, 1))' });
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
    expect(container.querySelector('[data-price-line]')).toHaveAttribute('d', 'M8.00,80.00 L992.00,80.00');
    expect(svg?.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('title, desc, [tabindex]')).toBeNull();
  });


  it('colors exact crossings within a segment without adding price observations', () => {
    const { container } = render(<HoldingTrendBackground expanded baseline={15} targetPrice={25} points={[
      { timestamp: 0, close: 10 }, { timestamp: 1000, close: 30 },
    ]} />);
    const stops = [...container.querySelectorAll('[data-price-stroke] stop')];
    expect(stops.map((stop) => stop.getAttribute('offset'))).toEqual(['0.008', '0.254', '0.254', '0.746', '0.746', '0.992']);
    expect(stops.map((stop) => stop.getAttribute('stop-color'))).toEqual(['#e11d48', '#e11d48', '#2563eb', '#2563eb', '#059669', '#059669']);
    expect(container.querySelector('[data-price-line]')?.getAttribute('d')?.match(/L/g)).toHaveLength(1);
    expect(container.querySelector('[data-reference="baseline"]')).toHaveAttribute('stroke-dasharray');
    expect(container.querySelector('[data-reference="target"]')).toHaveAttribute('stroke-dasharray');
  });

  it('uses actual valid trades only and keeps one SVG and price path through expansion', () => {
    const points = [{ timestamp: 0, close: 10 }, { timestamp: 1000, close: 30 }];
    const events = [
      { id: 'buy', type: 'BUY' as const, timestamp: -1000, price: 5, quantity: 2 },
      { id: 'sell', type: 'SELL' as const, timestamp: 2000, price: 35, quantity: 1 },
      { id: 'bad-time', type: 'BUY' as const, timestamp: Number.NaN, price: 12, quantity: 1 },
      { id: 'bad-price', type: 'SELL' as const, timestamp: 3000, price: -10, quantity: 1 },
      { id: 'bad-quantity', type: 'BUY' as const, timestamp: 3000, price: 15, quantity: 0 },
    ];
    const { container, rerender } = render(<HoldingTrendBackground points={points} events={events} baseline={15} targetPrice={25} tone="loss" />);
    const svg = container.querySelector('svg');
    const line = container.querySelector('[data-price-line]');
    expect(container.querySelectorAll('[data-event]')).toHaveLength(2);
    expect(container.querySelector('[data-event="BUY"]')).toHaveAttribute('data-event-time', '-1000');
    expect(container.querySelector('[data-event="SELL"]')).toHaveAttribute('data-event-price', '35');
    expect(container.querySelector('[data-event="BUY"]')?.parentElement).toHaveStyle({ opacity: '0' });
    rerender(<HoldingTrendBackground expanded points={points} events={events} baseline={15} targetPrice={25} tone="loss" />);
    expect(container.querySelector('svg')).toBe(svg);
    expect(container.querySelector('[data-price-line]')).toBe(line);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('[data-event="BUY"]')?.parentElement).toHaveStyle({ opacity: '1' });
    expect(container.querySelector('[data-event="BUY"]')).toHaveStyle({ pointerEvents: 'all' });
    expect(container.querySelector('[data-event="BUY"] title')?.textContent).toContain('1969');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('does not imply goal success when the target is unavailable', () => {
    const { container } = render(<HoldingTrendBackground expanded baseline={5} points={[{ timestamp: 0, close: 10 }, { timestamp: 1000, close: 30 }]} />);
    const stops = [...container.querySelectorAll('[data-price-stroke] stop')];
    expect(stops.length).toBeGreaterThan(0);
    expect(stops.every((stop) => stop.getAttribute('stop-color') === '#64748b')).toBe(true);
    expect(container.querySelector('[data-reference="target"]')).toBeNull();
  });

  it('interpolates the domain and reverses a partial expansion without replacing its path', () => {
    let now = 0;
    let nextId = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++nextId, callback); return nextId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
    const step = (timestamp: number) => {
      now = timestamp;
      const pending = [...callbacks.values()]; callbacks.clear();
      act(() => pending.forEach((callback) => callback(timestamp)));
    };
    const points = [{ timestamp: 0, close: 10 }, { timestamp: 1000, close: 30 }];
    const { container, rerender } = render(<HoldingTrendBackground points={points} baseline={5} targetPrice={100} />);
    const path = container.querySelector('[data-price-line]');
    const collapsed = path?.getAttribute('d');
    rerender(<HoldingTrendBackground expanded points={points} baseline={5} targetPrice={100} />);
    expect(path?.getAttribute('d')).toBe(collapsed);
    step(210);
    const partial = path?.getAttribute('d');
    expect(partial).not.toBe(collapsed);
    rerender(<HoldingTrendBackground points={points} baseline={5} targetPrice={100} />);
    expect(path?.getAttribute('d')).toBe(partial);
    step(630);
    expect(path?.getAttribute('d')).toBe(collapsed);
    expect(container.querySelector('[data-price-line]')).toBe(path);
  });

  it('compares each price segment against the changing historical target and shares colors with its fill', () => {
    const { container } = render(<HoldingTrendBackground expanded points={[
      { timestamp: 0, close: 15 }, { timestamp: 1000, close: 45 },
    ]} references={[
      { timestamp: 0, baseline: 10, target: 20 }, { timestamp: 1000, baseline: 10, target: 40 },
    ]} />);
    const stops = [...container.querySelectorAll('[data-price-stroke] stop')];
    // Price crosses the growing target halfway through the period, rather than
    // when it would cross today's target applied to the whole history.
    expect(stops.map((stop) => stop.getAttribute('offset'))).toEqual(['0.008', '0.5', '0.5', '0.992']);
    expect(stops.map((stop) => stop.getAttribute('stop-color'))).toEqual(['#2563eb', '#2563eb', '#059669', '#059669']);
    expect(container.querySelector('[data-reference="target"]')).toHaveAttribute('d', 'M8.00,104.00 L992.00,40.00');
    const price = container.querySelector('[data-price-line]');
    const area = container.querySelector('[data-price-area]');
    expect(area?.getAttribute('fill')).toBe(price?.getAttribute('stroke'));
    expect(area).toHaveAttribute('mask');
  });

  it('preserves missing historical references instead of filling them with today’s values', () => {
    const points = [0, 1000, 2000, 3000].map((timestamp) => ({ timestamp, close: 20 }));
    const { container, rerender } = render(<HoldingTrendBackground expanded points={points} baseline={5} targetPrice={10} references={points.map((point) => ({ timestamp: point.timestamp, baseline: null, target: null }))} />);
    expect(container.querySelector('[data-reference]')).toBeNull();
    expect([...container.querySelectorAll('[data-price-stroke] stop')].every((stop) => stop.getAttribute('stop-color') === '#64748b')).toBe(true);
    rerender(<HoldingTrendBackground expanded points={points} references={[
      { timestamp: 0, baseline: 10, target: 15 },
      { timestamp: 1000, baseline: null, target: null },
      { timestamp: 2000, baseline: 10, target: 15 },
      { timestamp: 3000, baseline: 10, target: 16 },
    ]} />);
    const target = container.querySelector('[data-reference="target"]')?.getAttribute('d');
    expect(target?.match(/M/g)).toHaveLength(2);
    expect(target?.match(/L/g)).toHaveLength(1);
  });

  it('splits color thresholds at intermediate reference changes without adding price observations', () => {
    const { container } = render(<HoldingTrendBackground expanded points={[
      { timestamp: 0, close: 20 }, { timestamp: 1000, close: 20 },
    ]} references={[
      { timestamp: 0, baseline: 10, target: 30 },
      { timestamp: 500, baseline: 10, target: 10 },
      { timestamp: 1000, baseline: 10, target: 30 },
    ]} />);
    const stops = [...container.querySelectorAll('[data-price-stroke] stop')];
    expect(stops.map((stop) => stop.getAttribute('offset'))).toEqual(['0.008', '0.254', '0.254', '0.5', '0.5', '0.746', '0.746', '0.992']);
    expect(stops.map((stop) => stop.getAttribute('stop-color'))).toEqual(['#2563eb', '#2563eb', '#059669', '#059669', '#059669', '#059669', '#2563eb', '#2563eb']);
    expect(container.querySelector('[data-price-line]')?.getAttribute('d')?.match(/L/g)).toHaveLength(1);
    expect(container.querySelector('[data-event="SELL"] rect')).toBeNull();
  });

});
