import { afterEach, expect, it, vi } from 'vitest';
import { LiveQuoteStore, syntheticTicks } from '@/hooks/use-live-quotes';
const base = Date.parse('2026-11-20T20:00Z');
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
it('keeps review movements deterministic when a new inspector adds symbols; no account requests', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(base);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const store = new LiveQuoteStore('review');
  const stop = store.start();
  const remove = store.register([{ symbol: 'AAPL', priority: 1 }]);
  await vi.advanceTimersByTimeAsync(4200);
  const price = store.snapshot().ticks.AAPL;
  expect(price.price).toBe(syntheticTicks(['AAPL'], base, 4200)[0].price);
  const also = store.register([{ symbol: 'MSFT', priority: 0 }]);
  await vi.advanceTimersByTimeAsync(150);
  expect(store.snapshot().ticks.AAPL).toEqual(price);
  expect(store.snapshot().ticks.MSFT.timestamp).toBe(price.timestamp);
  expect(fetch).not.toHaveBeenCalled();
  also();
  remove();
  stop();
});
it('never synthesizes an overnight or closed quote, and retains the extended reference basis', () => {
  expect(syntheticTicks(['NVDA'], Date.parse('2026-12-07T03:00Z'), 0)).toEqual([]);
  expect(syntheticTicks(['NVDA'], Date.parse('2026-11-21T18:00Z'), 0)).toEqual([]);
  expect(syntheticTicks(['NVDA'], Date.parse('2026-11-20T22:00Z'), 0)[0]).toMatchObject({
    price: 133.7,
    phase: 'post',
    source: 'demo',
  });
});

it('keeps the last accepted price across offline, hiding, and reconnection, and clears it on the next session', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(base);
  let hidden = false,
    online = true;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  let feed!: ReadableStreamDefaultController<Uint8Array>;
  const fetch = vi.fn(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            feed = controller;
          },
        }),
      ),
  );
  vi.stubGlobal('fetch', fetch);
  const store = new LiveQuoteStore('account');
  const stop = store.start();
  const remove = store.register([{ symbol: 'AAPL', priority: 0 }]);
  await vi.advanceTimersByTimeAsync(150);
  const send = (price: number, timestamp: number) =>
    feed.enqueue(
      new TextEncoder().encode(
        'data:' +
          JSON.stringify({
            status: 'streaming',
            ticks: [{ symbol: 'AAPL', price, timestamp, phase: 'regular', source: 'trade' }],
          }) +
          '\n\n',
      ),
    );
  send(215, base);
  await vi.advanceTimersByTimeAsync(0);
  expect(store.snapshot().ticks.AAPL.price).toBe(215);
  online = false;
  window.dispatchEvent(new Event('offline'));
  expect(store.snapshot()).toMatchObject({
    status: 'unavailable',
    ticks: { AAPL: { price: 215, stale: true, timestamp: base } },
  });
  online = true;
  hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(16 * 60_000);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(store.snapshot().ticks.AAPL.price).toBe(215);
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  expect(store.snapshot()).toMatchObject({
    status: 'connecting',
    ticks: { AAPL: { price: 215, stale: true } },
  });
  await vi.advanceTimersByTimeAsync(150);
  send(99, base - 1000);
  await vi.advanceTimersByTimeAsync(0);
  expect(store.snapshot().ticks.AAPL.price).toBe(215);
  send(216, Date.now());
  await vi.advanceTimersByTimeAsync(0);
  expect(store.snapshot().ticks.AAPL).toMatchObject({ price: 216 });
  expect(store.snapshot().ticks.AAPL.stale).toBeFalsy();
  vi.setSystemTime(new Date('2026-11-20T22:00Z'));
  window.dispatchEvent(new Event('focus'));
  expect(store.snapshot().ticks.AAPL).toBeUndefined();
  remove();
  stop();
  expect(store.snapshot().ticks).toEqual({});
});
