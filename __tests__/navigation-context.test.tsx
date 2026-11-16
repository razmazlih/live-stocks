import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStockHref, rememberReturnContext, validateReturnTo } from '@/lib/navigation-context';
import { parsePositionsState, parseWatchlistState } from '@/lib/list-url-state';
import { useUrlState } from '@/hooks/use-url-state';
import { useReturnContext } from '@/hooks/use-return-context';

describe('list navigation continuity', () => {
  beforeEach(() => window.history.replaceState(null, '', '/positions'));

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/api/quote', '/positions/../api', 'javascript:alert(1)', '/stock/AAPL'])('rejects unsafe or unsupported return destination %s', (url) => {
    expect(validateReturnTo(url)).toBe('/portfolio');
  });

  it('round-trips a filtered second page through a stock link', () => {
    const source = '/positions?q=Apple&account=bank_two&sort=symbol_desc&page=2&pageSize=10';
    const href = buildStockHref('BRK/B', source);
    expect(href.startsWith('/stock/BRK%2FB?')).toBe(true);
    const restored = validateReturnTo(new URL(href, 'https://local.test').searchParams.get('returnTo'));
    expect(restored).toBe(source);
    expect(parsePositionsState(new URL(restored, 'https://local.test').searchParams)).toEqual({ searchTerm: 'Apple', locationFilter: 'bank_two', sortOption: 'symbol_desc', currentPage: 2, pageSize: 10 });
  });

  it('preserves a custom source UUID in list navigation', () => {
    const id = '30000000-0000-4000-8000-000000000003';
    expect(parsePositionsState(new URLSearchParams({ account: id })).locationFilter).toBe(id);
  });

  it('restores the originating card focus and scroll after the list is ready', async () => {
    window.history.replaceState(null, '', '/positions?q=Apple&page=2');
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    rememberReturnContext('original-card');
    const { rerender, unmount } = renderHook(({ ready }) => useReturnContext(ready), { initialProps: { ready: false } });
    const card = document.createElement('a');
    card.id = 'original-card';
    card.href = '/stock/AAPL';
    document.body.appendChild(card);
    rerender({ ready: true });
    await waitFor(() => expect(document.activeElement).toBe(card));
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    unmount();
    card.remove();
    scroll.mockRestore();
  });

  it('validates malformed filters and dates' , () => {
    expect(parsePositionsState(new URLSearchParams('page=-2&pageSize=999&sort=invalid&account=unknown'))).toMatchObject({ currentPage: 1, pageSize: 20, sortOption: 'latest_activity', locationFilter: 'all' });
    expect(parseWatchlistState(new URLSearchParams('range=invalid&from=2026-02-31'))).toMatchObject({ range: '1M', customStartDate: null });
  });

  it('updates list parameters without losing others and reacts to browser history', () => {
    window.history.replaceState(null, '', '/positions?q=Apple&page=2&pageSize=10');
    const { result } = renderHook(() => useUrlState(parsePositionsState));
    expect(result.current[0].currentPage).toBe(2);
    act(() => result.current[1]({ account: 'bank_two', page: null }));
    expect(result.current[0]).toMatchObject({ searchTerm: 'Apple', currentPage: 1, pageSize: 10, locationFilter: 'bank_two' });
    act(() => {
      window.history.replaceState(null, '', '/positions?q=Microsoft&page=3');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current[0]).toMatchObject({ searchTerm: 'Microsoft', currentPage: 3 });
  });
});
