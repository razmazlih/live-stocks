import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedNumber } from '@/components/ui/animated-number';

let now = 0;
let reduced = false;
let frame: FrameRequestCallback | null;
function step(time: number) {
  now = time;
  const draw = frame;
  frame = null;
  act(() => draw?.(time));
}
const number = (value: number | null, identity = 'AAPL', currency: 'USD' | 'ILS' = 'USD') =>
  <AnimatedNumber value={value} identity={identity} locale="en" currency={currency} signed />;
describe('animated financial values', () => {
  beforeEach(() => {
    now = 0; reduced = false; frame = null;
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frame = fn; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => { frame = null; });
    vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('starts at the real value, coalesces bursts from the displayed amount and keeps only the target accessible', () => {
    const {container, rerender} = render(number(100));
    const node = container.querySelector('bdi')!;
    const drawn = node.querySelector('[aria-hidden="true"]')!;
    expect(node.dataset.move).toBeUndefined();
    expect(frame).toBeNull();
    rerender(number(200)); step(140);
    const shown = drawn.textContent;
    expect(shown).not.toBe('+$100.00');
    expect(shown).not.toBe('+$200.00');
    rerender(number(5000)); rerender(number(20)); step(180);
    expect(drawn.textContent).toBe(shown);
    expect(node.dataset.signal).toBe('down');
    expect(node.dataset.reserve).toBe('+$5,000.00');
    expect(node.querySelector('span:not([aria-hidden])')).toHaveTextContent('+$20.00');
    expect(node).toHaveAttribute('aria-live','off');
    step(630);
    expect(node.dataset.move).toBeUndefined();
    expect(node).toHaveTextContent('+$20.00');
    expect(drawn.textContent).toBe('');
  });
  it('passes zero once on a sign crossing and resets on currency, identity and missing values', () => {
    const {container, rerender} = render(number(-100));
    const node = container.querySelector('bdi')!;
    rerender(number(100)); step(180);
    expect(node.querySelector('[aria-hidden="true"]')).toHaveTextContent('$0.00');
    step(225);
    expect(node.querySelector('[aria-hidden="true"]')?.textContent).toMatch(/^\+\$/);
    rerender(number(300,'MSFT'));
    expect(node.dataset.move).toBeUndefined();
    expect(node.dataset.reserve).toBeUndefined();
    rerender(number(1200,'MSFT','ILS'));
    expect(node.dataset.signal).toBeUndefined();
    rerender(number(null)); rerender(number(40));
    expect(node.dataset.move).toBeUndefined();
  });
  it('changes immediately with a stationary directional signal in reduced motion and ignores identical quoted cents', () => {
    reduced = true;
    const {container, rerender} = render(number(1.004));
    const node = container.querySelector('bdi')!;
    rerender(number(1.002));
    expect(node.dataset.signal).toBeUndefined();
    rerender(number(1.005));
    expect(node).toHaveTextContent('+$1.01');
    expect(node.dataset.signal).toBe('up');
    expect(node.dataset.move).toBeUndefined();
    expect(frame).toBeNull();
    act(() => vi.advanceTimersByTime(450));
    expect(node.dataset.signal).toBeUndefined();
  });
});
