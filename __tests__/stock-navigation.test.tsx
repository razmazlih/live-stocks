import { forwardRef } from 'react';
import type { ComponentProps, MouseEvent } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockDetailsLink, StockNavigationProvider, useStockNavigationPreview, useStockNavigationReady } from '@/components/portfolio/stock-navigation';

const routing = vi.hoisted(() => ({
  path: '/',
  router: { push: vi.fn() },
  fallback: vi.fn(),
  onClick: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => routing.router, usePathname: () => routing.path }));
vi.mock('next/link', () => ({
  default: forwardRef<HTMLAnchorElement, ComponentProps<'a'> & { onNavigate?: (event: { preventDefault(): void }) => void }>(function MockLink({ onNavigate, onClick, ...props }, ref) {
    return <a {...props} ref={ref} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        let prevented = false;
        onNavigate?.({ preventDefault: () => { prevented = true; } });
        if (!prevented) routing.fallback(props.href);
      }
      // jsdom has no browser navigation; preserve the Link-level decision above.
      event.preventDefault();
    }} />;
  }),
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function installTransition() {
  const animation = deferred();
  let didUpdate = false;
  const start = vi.fn((update: () => Promise<void>) => {
    // Native snapshots call the update asynchronously after the click completes.
    const updateCallbackDone = Promise.resolve().then(update).then(() => { didUpdate = true; });
    return {
      ready: updateCallbackDone,
      updateCallbackDone,
      finished: updateCallbackDone.then(() => animation.promise),
      skipTransition: skip,
    };
  });
  const skip = vi.fn(() => animation.resolve());
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
  return { start, skip, finish: animation.resolve, didUpdate: () => didUpdate };
}

function Destination({ ready }: { ready: boolean }) {
  useStockNavigationReady(ready);
  return null;
}
function IdentityProbe() {
  const matched = useStockNavigationPreview('aapl');
  const different = useStockNavigationPreview('MSFT');
  return <><output data-testid="matched-preview">{JSON.stringify(matched)}</output><output data-testid="different-preview">{JSON.stringify(different)}</output></>;
}
function Fixture({ ready = false, preview = false }: { ready?: boolean; preview?: boolean }) {
  return <StockNavigationProvider>
    <article data-testid="source"><StockDetailsLink href="/stock/AAPL?returnTo=%2F" preview={preview ? { symbol: 'AAPL', display: 'Apple', imageUrl: '/apple.svg' } : undefined} onClick={routing.onClick}>Open Apple</StockDetailsLink></article>
    <article data-testid="other"><StockDetailsLink href="/stock/AAPL?returnTo=%2F">Another Apple</StockDetailsLink></article>
    <Destination ready={ready} />
    <IdentityProbe />
  </StockNavigationProvider>;
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.useFakeTimers();
  vi.clearAllMocks();
  routing.path = '/';
  window.history.replaceState(null, '', '/');
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
  delete document.documentElement.dataset.stockNavigation;
});

describe('stock detail navigation', () => {
  it('keeps ordinary links when native transitions are unavailable', () => {
    render(<Fixture />);
    fireEvent.click(screen.getByRole('link', { name: 'Open Apple' }));
    expect(routing.onClick).toHaveBeenCalledOnce();
    expect(routing.fallback).toHaveBeenCalledWith('/stock/AAPL?returnTo=%2F');
    expect(routing.router.push).not.toHaveBeenCalled();
    expect(screen.getByTestId('source').style.viewTransitionName).toBeFalsy();
  });

  it('respects reduced motion without snapshotting or delaying navigation', () => {
    const native = installTransition();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    render(<Fixture />);
    fireEvent.click(screen.getByRole('link', { name: 'Open Apple' }));
    expect(native.start).not.toHaveBeenCalled();
    expect(routing.fallback).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Open Apple' })).not.toHaveAttribute('aria-busy');
  });

  it('morphs only the clicked card and waits for the actual destination before finishing', async () => {
    const native = installTransition();
    const { rerender } = render(<Fixture />);
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Open Apple' })); });
    expect(screen.getByTestId('source').style.viewTransitionName).toBe('stock-detail-surface');
    expect(screen.getByTestId('other').style.viewTransitionName).toBeFalsy();
    expect(routing.router.push).toHaveBeenCalledExactlyOnceWith('/stock/AAPL?returnTo=%2F');
    expect(routing.fallback).not.toHaveBeenCalled();
    expect(native.didUpdate()).toBe(false);
    expect(screen.getByRole('link', { name: 'Open Apple' })).toHaveAttribute('aria-busy', 'true');

    routing.path = '/stock/AAPL';
    window.history.replaceState(null, '', '/stock/AAPL');
    rerender(<Fixture ready />);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(native.didUpdate()).toBe(true);
    expect(native.skip).not.toHaveBeenCalled();
    await act(async () => native.finish());
    expect(screen.getByTestId('source').style.viewTransitionName).toBeFalsy();
    expect(screen.getByRole('link', { name: 'Open Apple' })).not.toHaveAttribute('aria-busy');
    expect(document.documentElement).not.toHaveAttribute('data-stock-navigation');
  });

  it('releases a slow destination after 1.2 seconds and clears the pending state', async () => {
    const native = installTransition();
    render(<Fixture />);
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Open Apple' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1199); });
    expect(native.skip).not.toHaveBeenCalled();
    expect(native.didUpdate()).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    expect(native.skip).toHaveBeenCalledOnce();
    expect(native.didUpdate()).toBe(true);
    expect(screen.getByRole('link', { name: 'Open Apple' })).not.toHaveAttribute('aria-busy');
    expect(screen.getByTestId('source').style.viewTransitionName).toBeFalsy();
    expect(routing.router.push).toHaveBeenCalledOnce();
  });

  it('preserves modified clicks without starting a transition', () => {
    const native = installTransition();
    render(<Fixture />);
    fireEvent.click(screen.getByRole('link', { name: 'Open Apple' }), { ctrlKey: true });
    fireEvent.click(screen.getByRole('link', { name: 'Open Apple' }), { metaKey: true });
    expect(native.start).not.toHaveBeenCalled();
    expect(routing.router.push).not.toHaveBeenCalled();
    expect(routing.onClick).toHaveBeenCalledTimes(2);
  });

  it('does not enqueue another navigation while a transition is pending', async () => {
    const native = installTransition();
    render(<Fixture />);
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Open Apple' }));
      fireEvent.click(screen.getByRole('link', { name: 'Another Apple' }));
    });
    expect(native.start).toHaveBeenCalledOnce();
    expect(routing.router.push).toHaveBeenCalledOnce();
    expect(routing.fallback).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1220); });
  });

  it('cleans up a failed snapshot and leaves ordinary navigation available', () => {
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: vi.fn(() => { throw new Error('Snapshot unavailable'); }) });
    render(<Fixture />);
    fireEvent.click(screen.getByRole('link', { name: 'Open Apple' }));
    expect(routing.fallback).toHaveBeenCalledOnce();
    expect(screen.getByTestId('source').style.viewTransitionName).toBeFalsy();
    expect(document.documentElement).not.toHaveAttribute('data-stock-navigation');
  });

  it('carries identity only for the matching destination symbol, without financial preview values', async () => {
    installTransition();
    render(<Fixture preview />);
    expect(screen.getByTestId('matched-preview')).toHaveTextContent('null');
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Open Apple' })); });
    expect(JSON.parse(screen.getByTestId('matched-preview').textContent!)).toEqual({ symbol: 'AAPL', display: 'Apple', imageUrl: '/apple.svg' });
    expect(screen.getByTestId('different-preview')).toHaveTextContent('null');
    await act(async () => { await vi.advanceTimersByTimeAsync(1220); });
  });

  it('releases a superseded destination instead of freezing the next route', async () => {
    const native = installTransition();
    const { rerender } = render(<Fixture />);
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Open Apple' })); });
    routing.path = '/watchlist';
    window.history.replaceState(null, '', '/watchlist');
    rerender(<Fixture ready />);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(native.skip).toHaveBeenCalledOnce();
    expect(native.didUpdate()).toBe(true);
    expect(document.documentElement).not.toHaveAttribute('data-stock-navigation');
  });

  it('releases an unfinished callback when its provider unmounts', async () => {
    const native = installTransition();
    const { unmount } = render(<Fixture />);
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Open Apple' })); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(native.skip).toHaveBeenCalledOnce();
    expect(native.didUpdate()).toBe(true);
    expect(document.documentElement).not.toHaveAttribute('data-stock-navigation');
  });
});
