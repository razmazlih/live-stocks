// @vitest-environment node
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { afterEach, expect, it, vi } from 'vitest';
import { admissibleTick, mergeDemand, newerTick, type LiveQuoteFrame } from '@/lib/live-quotes';
import {
  QuoteRelay,
  type CoordinationInput,
  type CoordinationState,
  type RelayIO,
} from '@/lib/server/live-quote-relay';

const now = Date.parse('2026-11-20T20:00Z');
afterEach(() => vi.useRealTimers());
it('keeps regular, extended, late, future and older marks separate', () => {
  const tick = admissibleTick('AMD', 150, now, now, 'trade')!;
  expect(tick.phase).toBe('regular');
  expect(admissibleTick('AMD', 151, now + 1000, now, 'trade')).toBeNull();
  expect(admissibleTick('AMD', 151, now - 16 * 60_000, now, 'trade')).toBeNull();
  expect(newerTick(tick, { ...tick, timestamp: now - 1 })).toBe(false);
  const after = Date.parse('2026-11-20T22:00Z');
  expect(admissibleTick('AMD', 151, after, after, 'quote')).toBeNull();
  expect(admissibleTick('AMD', 151, after, after, 'trade')?.phase).toBe('post');
  const overnight = Date.parse('2026-12-07T03:00Z');
  expect(admissibleTick('AMD', 151, overnight, overnight, 'trade')).toBeNull();
  expect(admissibleTick('AMD', 151, overnight, overnight, 'trade', true)?.phase).toBe('overnight');
  expect(
    mergeDemand([
      [
        { symbol: 'AMD', priority: 2 },
        { symbol: 'NVDA', priority: 1 },
      ],
      [
        { symbol: 'amd', priority: 0 },
        { symbol: 'VOD.L', priority: 0 },
      ],
    ]),
  ).toEqual([
    { symbol: 'AMD', priority: 0 },
    { symbol: 'NVDA', priority: 1 },
  ]);
});

class FakeSocket extends EventEmitter {
  readyState = Number(WebSocket.CONNECTING);
  messages: string[] = [];
  send(s: string) {
    this.messages.push(s);
  }
  open() {
    this.readyState = WebSocket.OPEN;
    this.emit('open');
  }
  terminate() {
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }
}
it('shares one socket, filters every listener, coalesces in order and fences losing owners', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  let leader = true;
  let symbols = ['AAA', 'BBB'];
  const step = vi.fn(
    async (_request: CoordinationInput): Promise<CoordinationState> => ({
      leader,
      allowSocket: leader,
      symbols,
      restSymbol: null,
      status: 'streaming',
      marks: {},
    }),
  );
  const socket = new FakeSocket();
  const io: RelayIO = { step, socket: vi.fn(() => socket as unknown as WebSocket), quote: vi.fn() };
  const dispose = vi.fn();
  const relay = new QuoteRelay(io, dispose);
  const a: LiveQuoteFrame[] = [],
    b: LiveQuoteFrame[] = [];
  const leaveA = relay.listen([{ symbol: 'AAA', priority: 0 }], (f) => a.push(f));
  const leaveB = relay.listen([{ symbol: 'BBB', priority: 1 }], (f) => b.push(f));
  await vi.advanceTimersByTimeAsync(0);
  socket.open();
  expect(io.socket).toHaveBeenCalledTimes(1);
  expect(socket.messages).toHaveLength(2);
  socket.emit(
    'message',
    Buffer.from(
      JSON.stringify({
        type: 'trade',
        data: [
          { s: 'AAA', p: 10, t: now, v: 10 },
          { s: 'BBB', p: 11, t: now, v: 3 },
          { s: 'AAA', p: 99, t: now - 100, v: 10 },
          { s: 'CCC', p: 888, t: now, v: 10 },
        ],
      }),
    ),
  );
  await vi.advanceTimersByTimeAsync(300);
  expect(a.at(-1)?.ticks.map((t) => [t.symbol, t.price])).toEqual([['AAA', 10]]);
  expect(b.at(-1)?.ticks.map((t) => t.symbol)).toEqual(['BBB']);
  leaveA();
  symbols = ['BBB'];
  await vi.advanceTimersByTimeAsync(2500);
  expect(socket.messages).toContain(JSON.stringify({ type: 'unsubscribe', symbol: 'AAA' }));
  leader = false;
  await vi.advanceTimersByTimeAsync(2500);
  expect(socket.readyState).toBe(WebSocket.CLOSED);
  leaveB();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(step.mock.calls.at(-1)?.[0].release).toBe(true);
});
