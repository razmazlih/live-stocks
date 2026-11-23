'use client';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { demoAsset, demoQuote } from '@/lib/demo/assets';
import { DEMO_SCENARIO_EVENT, demoScenarioClock, readLocalMarketMode, reviewClock } from '@/lib/demo/review';
import { getMarketClock } from '@/lib/utils/trading-hours';
import {
  admissibleTick,
  liveSymbol,
  MAX_STREAM_DEMAND,
  mergeDemand,
  newerTick,
  PRIORITY,
  type LiveQuoteFrame,
  type LiveQuoteTick,
  type LiveQuoteStatus,
  type LiveQuotePriority,
  type StreamDemand,
} from '@/lib/live-quotes';

export type { LiveQuoteTick, LiveQuoteStatus, LiveQuotePriority } from '@/lib/live-quotes';
export type LiveQuoteMode = 'account' | 'demo' | 'review';
export interface LiveQuoteSnapshot {
  ticks: Record<string, LiveQuoteTick>;
  status: LiveQuoteStatus;
}
const empty: LiveQuoteSnapshot = { ticks: {}, status: 'idle' };
const noopSubscribe = () => () => {};
const emptySnapshot = () => empty;

export function syntheticTicks(symbols: string[], base: number, elapsed: number): LiveQuoteTick[] {
  const clock = getMarketClock(base);
  if (!clock.session || !['regular', 'pre', 'post'].includes(clock.phase)) return [];
  const step = Math.floor(elapsed / 2000);
  const timestamp = Math.min(base + step * 2_000, (clock.nextTransition ?? Infinity) - 1);
  return symbols.flatMap((symbol) => {
    if (!demoAsset(symbol)) return [];
    const quote = demoQuote(symbol);
    const seed = [...symbol].reduce((n, c) => n + c.charCodeAt(0), 0);
    const start = clock.phase === 'regular' ? quote.c : quote.c + quote.d * 0.4;
    const swing = Math.sin(step * 0.65 + seed) - Math.sin(seed);
    const price = Number((start + start * 0.0018 * swing).toFixed(2));
    const tick = admissibleTick(symbol, price, timestamp, timestamp, 'demo');
    return tick ? [{ ...tick, demoStep: step }] : [];
  });
}

export class LiveQuoteStore {
  private wants = new Map<symbol, StreamDemand[]>();
  private observers = new Set<() => void>();
  private state: LiveQuoteSnapshot = empty;
  private controller?: AbortController;
  private restartTimer?: ReturnType<typeof setTimeout>;
  private wakeTimer?: ReturnType<typeof setTimeout>;
  private updateTimer?: ReturnType<typeof setInterval>;
  private retryMs = 1000;
  private demandKey = '';
  private quoteSession = '';
  private active = false;
  private epoch = 0;
  private simulation?: { id: string; base: number; start: number };
  constructor(private mode: LiveQuoteMode) {}
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.observers.add(fn);
    return () => this.observers.delete(fn);
  };

  private update(status: LiveQuoteStatus, ticks: LiveQuoteTick[] = [], clear = false) {
    let values = clear ? ({} as Record<string, LiveQuoteTick>) : this.state.ticks;
    for (const tick of ticks)
      if (newerTick(values[tick.symbol], tick)) {
        if (values === this.state.ticks) values = { ...values };
        values[tick.symbol] = tick;
      }
    if (values !== this.state.ticks || status !== this.state.status) {
      this.state = { status, ticks: values };
      this.observers.forEach((fn) => fn());
    }
  }

  register(demand: StreamDemand[]) {
    const id = Symbol();
    this.wants.set(id, demand);
    this.reconcile();
    return () => {
      this.wants.delete(id);
      this.reconcile();
    };
  }
  start() {
    this.active = true;
    document.addEventListener('visibilitychange', this.wake);
    window.addEventListener('online', this.wake);
    window.addEventListener('offline', this.wake);
    window.addEventListener('pageshow', this.wake);
    window.addEventListener('focus', this.wake);
    if (this.mode !== 'account') window.addEventListener(DEMO_SCENARIO_EVENT, this.wake);
    this.reconcile(true);
    return () => {
      this.active = false;
      document.removeEventListener('visibilitychange', this.wake);
      window.removeEventListener('online', this.wake);
      window.removeEventListener('offline', this.wake);
      window.removeEventListener('pageshow', this.wake);
      window.removeEventListener('focus', this.wake);
      if (this.mode !== 'account') window.removeEventListener(DEMO_SCENARIO_EVENT, this.wake);
      this.stopRun();
      this.demandKey = '';
      this.quoteSession = '';
      this.simulation = undefined;
      this.update('idle', [], true);
    };
  }
  private stopRun() {
    this.epoch++;
    this.controller?.abort();
    clearTimeout(this.restartTimer);
    clearTimeout(this.wakeTimer);
    clearInterval(this.updateTimer);
  }
  private wake = () => {
    this.reconcile(true);
  };
  private reconcile(force = false) {
    if (!this.active) return;
    const demands = mergeDemand(this.wants.values()).slice(0, MAX_STREAM_DEMAND);
    let fixedClock: number | null = null;
    if (this.mode === 'review' && readLocalMarketMode() !== 'realtime') fixedClock = reviewClock();
    if (this.mode === 'demo') fixedClock = demoScenarioClock();
    const clockNow = fixedClock ?? Date.now();
    const clock = getMarketClock(clockNow);
    const enabled = demands.length > 0 && !document.hidden && (this.mode !== 'account' || navigator.onLine !== false);
    const session = [clock.date, clock.phase, fixedClock ?? 'realtime'].join(':');
    const id = [enabled, session, ...demands.map((d) => d.priority + d.symbol)].join('|');
    if (!force && id === this.demandKey) return;
    this.demandKey = id;
    this.stopRun();
    const epoch = this.epoch;
    const symbols = new Set(demands.map((d) => d.symbol));
    const retained =
      session === this.quoteSession
        ? Object.values(this.state.ticks).filter((tick) => symbols.has(tick.symbol))
        : [];
    if (session !== this.quoteSession) this.simulation = undefined;
    this.quoteSession = session;
    if (fixedClock === null && demands.length && clock.nextTransition) {
      this.wakeTimer = setTimeout(this.wake, Math.max(50, clock.nextTransition - clockNow + 20));
    }
    if (!demands.length || clock.phase === 'closed' || clock.phase === 'unknown') {
      this.update(demands.length ? 'closed' : 'idle', [], true);
      return;
    }
    if (!enabled) {
      this.update(
        'unavailable',
        retained.map((tick) => (tick.stale ? tick : { ...tick, stale: true })),
        true,
      );
      return;
    }
    if (this.mode !== 'account' && this.simulation?.id !== session) {
      this.simulation = { id: session, base: clockNow, start: Date.now() };
    }
    const sim = this.simulation;
    this.update('connecting', retained, true);
    this.restartTimer = setTimeout(() => {
      if (epoch !== this.epoch) return;
      if (this.mode !== 'account') {
        if (!sim) return;
        const render = () => {
          const ticks = syntheticTicks([...symbols], sim.base, Date.now() - sim.start);
          this.update(ticks.length ? 'streaming' : 'unavailable', ticks);
        };
        render();
        this.updateTimer = setInterval(render, 2000);
        return;
      }
      this.updateTimer = setInterval(() => {
        const now = Date.now();
        const observed = Object.values(this.state.ticks);
        if (observed.some((tick) => !tick.stale && now - tick.timestamp > 15 * 60_000)) {
          this.update(
            this.state.status,
            observed.map((tick) => (now - tick.timestamp > 15 * 60_000 ? { ...tick, stale: true } : tick)),
            true,
          );
        }
      }, 15_000);
      void this.read(demands, epoch);
    }, 120);
  }

  private async read(demands: StreamDemand[], epoch: number) {
    const params = new URLSearchParams();
    for (const n of [0, 1, 2]) {
      const list = demands.filter((d) => d.priority === n).map((d) => d.symbol);
      if (list.length) params.set(['selected', 'holding', 'watchlist'][n], list.join(','));
    }
    const wanted = new Set(demands.map((d) => d.symbol));
    const controller = new AbortController();
    this.controller = controller;
    // The server sends a heartbeat every 12 seconds. A stalled radio or proxy
    // may leave fetch pending without notifying the browser that it went offline.
    const abortStalledRead = () => controller.abort();
    let heartbeatDeadline = setTimeout(abortStalledRead, 30_000);
    let retry = true;
    let complete = false;
    try {
      const response = await fetch('/api/quotes/stream?' + params, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        if ([400, 401, 403, 409].includes(response.status)) retry = false;
        throw new Error('Stream unavailable');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (epoch !== this.epoch) return;
        if (done) {
          complete = true;
          break;
        }
        clearTimeout(heartbeatDeadline);
        heartbeatDeadline = setTimeout(abortStalledRead, 30_000);
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 150_000) throw new Error('Invalid stream frame');
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const message = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (!message.startsWith('data:')) continue;
          const frame = JSON.parse(message.slice(5)) as LiveQuoteFrame;
          if (
            !['connecting', 'streaming', 'fallback', 'unavailable', 'closed'].includes(frame.status) ||
            !Array.isArray(frame.ticks)
          )
            continue;
          const now = Date.now();
          const valid = frame.ticks.flatMap((t) => {
            if (!t || !wanted.has(t.symbol) || (t.source !== 'trade' && t.source !== 'quote')) return [];
            const tick = admissibleTick(
              t.symbol,
              t.price,
              t.timestamp,
              now,
              t.source,
              t.phase === 'overnight',
            );
            return tick?.phase === t.phase ? [tick] : [];
          });
          this.update(frame.status, valid);
          this.retryMs = 1000;
        }
      }
    } catch {
      if (epoch === this.epoch)
        this.update(
          'unavailable',
          Object.values(this.state.ticks).map((tick) => (tick.stale ? tick : { ...tick, stale: true })),
          true,
        );
    } finally {
      clearTimeout(heartbeatDeadline);
      if (epoch === this.epoch) {
        controller.abort();
        if (retry) {
          const delay = complete ? 300 : this.retryMs + Math.floor(Math.random() * 500);
          if (!complete) this.retryMs = Math.min(this.retryMs * 2, 60_000);
          this.restartTimer = setTimeout(() => this.read(demands, epoch), delay);
        }
      }
    }
  }
}

const QuoteContext = createContext<LiveQuoteStore | null>(null);
export function LiveQuoteProvider({
  mode = 'account',
  children,
}: {
  mode?: LiveQuoteMode;
  children: ReactNode;
}) {
  const store = useMemo(() => new LiveQuoteStore(mode), [mode]);
  useEffect(() => store.start(), [store]);
  return <QuoteContext.Provider value={store}>{children}</QuoteContext.Provider>;
}

function selectedSnapshot(store: LiveQuoteStore | null, selected: string[]) {
  let prior: LiveQuoteSnapshot = empty;
  return () => {
    if (!store || !selected.length) return empty;
    const value = store.snapshot();
    const present = selected.filter((s) => value.ticks[s]);
    const status =
      value.status === 'streaming' && present.length && present.every((s) => value.ticks[s].stale)
        ? 'fallback'
        : value.status;
    if (status === prior.status && selected.every((s) => prior.ticks[s] === value.ticks[s])) return prior;
    prior = { status, ticks: Object.fromEntries(present.map((s) => [s, value.ticks[s]])) };
    return prior;
  };
}

export function useLiveQuotes(
  symbols: readonly string[],
  priority: LiveQuotePriority = 'watchlist',
): LiveQuoteSnapshot {
  const store = useContext(QuoteContext);
  const names = [...new Set(symbols.map(liveSymbol).filter((s): s is string => s !== null))].sort().join(',');
  const selected = useMemo(() => (names ? names.split(',') : []), [names]);
  useEffect(
    () => store?.register(selected.map((symbol) => ({ symbol, priority: PRIORITY[priority] }))),
    [store, selected, priority],
  );
  const read = useMemo(() => selectedSnapshot(store, selected), [store, selected]);
  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, read, emptySnapshot);
}
