import { randomUUID } from 'node:crypto';
import WebSocket, { type RawData } from 'ws';
import {
  admissibleTick,
  mergeDemand,
  newerTick,
  MAX_STREAM_DEMAND,
  type StreamDemand,
  type LiveQuoteTick,
  type LiveQuoteFrame,
  type LiveQuoteStatus,
} from '@/lib/live-quotes';
import { getMarketClock } from '@/lib/utils/trading-hours';

type RelayStatus = Exclude<LiveQuoteStatus, 'idle'>;
export interface CoordinationState {
  leader: boolean;
  allowSocket: boolean;
  symbols: string[] | null;
  restSymbol: string | null;
  status: RelayStatus;
  marks: Record<string, LiveQuoteTick>;
}
export interface CoordinationInput {
  node: string;
  demand: StreamDemand[];
  marks: Record<string, LiveQuoteTick>;
  status: RelayStatus;
  release: boolean;
  backoff?: number;
  wantsSocket?: boolean;
}
export interface RelayIO {
  step: (input: CoordinationInput) => Promise<CoordinationState>;
  socket: () => WebSocket;
  quote: (symbol: string) => Promise<{ c?: number; t?: number; backoff?: number }>;
}

export function providerBackoff(status: number | undefined, retryAfter: string | null) {
  if (status === 401 || status === 403) return 900;
  if (status !== 429) return 0;
  const seconds = Number(retryAfter);
  const value =
    Number.isFinite(seconds) && seconds > 0 ? seconds : (Date.parse(retryAfter ?? '') - Date.now()) / 1000;
  return Number.isFinite(value) ? Math.min(3600, Math.max(1, Math.ceil(value))) : 60;
}

type Subscriber = { demand: StreamDemand[]; wanted: Set<string>; emit: (frame: LiveQuoteFrame) => void };
const heartbeatMs = 2500;
const leaseSafetyMs = 8500;

// One relay per provider credential per running process. The database elects
// one upstream owner across processes; followers consume only persisted marks.
export class QuoteRelay {
  private id = randomUUID();
  private clients = new Set<Subscriber>();
  private last = new Map<string, LiveQuoteTick>();
  private staged: Record<string, LiveQuoteTick> = {};
  private changes = new Set<string>();
  private subscribed = new Set<string>();
  private desired = new Set<string>();
  private ws?: WebSocket;
  private status: RelayStatus = 'connecting';
  private lastSent?: RelayStatus;
  private nextConnect = 0;
  private retry = 3000;
  private backoffUntil = 0;
  private lease = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private fenceTimer?: ReturnType<typeof setTimeout>;
  private flushTimer?: ReturnType<typeof setTimeout>;
  private busy = false;
  private delay = heartbeatMs;
  private closed = false;
  private lifetime = 0;
  constructor(
    private io: RelayIO,
    private dispose: () => void,
  ) {}

  listen(demand: StreamDemand[], emit: Subscriber['emit']) {
    const client = { demand, wanted: new Set(demand.map((d) => d.symbol)), emit };
    this.clients.add(client);
    emit({ status: this.status, ticks: [...this.last.values()].filter((t) => client.wanted.has(t.symbol)) });
    if (!this.timer && !this.busy) void this.beat();
    return () => {
      this.clients.delete(client);
      if (!this.clients.size && !this.closed) {
        this.closed = true;
        this.lifetime++;
        clearTimeout(this.timer);
        clearTimeout(this.flushTimer);
        this.fence();
        this.dispose();
        if (!this.busy) void this.release();
      }
    };
  }

  private async release() {
    try {
      await this.io.step({ node: this.id, demand: [], marks: {}, status: 'closed', release: true });
    } catch {
      /* Lease expires independently. */
    }
  }
  private fence() {
    clearTimeout(this.fenceTimer);
    this.lease = 0;
    this.subscribed.clear();
    const socket = this.ws;
    this.ws = undefined;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.terminate();
  }
  private emitSoon() {
    if (!this.flushTimer && !this.closed)
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        const changed = [...this.changes].flatMap((s) => (this.last.has(s) ? [this.last.get(s)!] : []));
        this.changes.clear();
        for (const client of this.clients) {
          const ticks = changed.filter((t) => client.wanted.has(t.symbol));
          if (ticks.length || this.status !== this.lastSent) client.emit({ status: this.status, ticks });
        }
        this.lastSent = this.status;
      }, 250);
  }
  private setStatus(status: RelayStatus) {
    this.status = status;
    this.emitSoon();
  }
  private accept(tick: LiveQuoteTick, publish: boolean) {
    if (!newerTick(this.last.get(tick.symbol), tick)) return;
    this.last.set(tick.symbol, tick);
    if (publish) this.staged[tick.symbol] = tick;
    this.changes.add(tick.symbol);
    this.emitSoon();
  }
  private syncSymbols() {
    if (this.ws?.readyState !== WebSocket.OPEN || Date.now() >= this.lease) return;
    for (const symbol of this.subscribed)
      if (!this.desired.has(symbol)) {
        this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
        this.subscribed.delete(symbol);
      }
    for (const symbol of this.desired)
      if (!this.subscribed.has(symbol)) {
        this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
        this.subscribed.add(symbol);
      }
  }
  private ensureSocket() {
    if (this.ws || Date.now() < this.nextConnect || !this.desired.size) return;
    const socket = this.io.socket();
    this.ws = socket;
    socket.on('error', () => {
      if (socket === this.ws) socket.terminate();
    });
    socket.on('unexpected-response', (_request, response) => {
      if (socket === this.ws) {
        const seconds = providerBackoff(response.statusCode, String(response.headers['retry-after'] ?? ''));
        this.backoffUntil = Math.max(this.backoffUntil, Date.now() + seconds * 1000);
        response.resume();
        socket.terminate();
      }
    });
    socket.on('open', () => {
      if (socket !== this.ws || Date.now() >= this.lease) {
        socket.terminate();
        return;
      }
      this.setStatus('streaming');
      this.syncSymbols();
    });
    socket.on('close', () => {
      if (socket !== this.ws) return;
      this.ws = undefined;
      this.subscribed.clear();
      this.nextConnect = Date.now() + this.retry;
      this.retry = Math.min(90_000, this.retry * 2);
      this.setStatus('fallback');
    });
    socket.on('message', (raw: RawData) => {
      const now = Date.now();
      if (socket !== this.ws || now >= this.lease) return;
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'error') {
          socket.terminate();
          return;
        }
        if (data.type !== 'trade' || !Array.isArray(data.data)) return;
        for (const trade of data.data) {
          if (!trade || !this.subscribed.has(trade.s) || (trade.v !== undefined && !(trade.v > 0))) continue;
          const tick = admissibleTick(trade.s, trade.p, trade.t, now, 'trade', trade.session === 'overnight');
          if (tick) {
            this.accept(tick, true);
            this.retry = 3000;
          }
        }
      } catch {
        /* Malformed vendor data has no effect on last valid marks. */
      }
    });
  }

  private async beat() {
    if (this.closed || this.busy) return;
    this.busy = true;
    const epoch = this.lifetime;
    const started = Date.now();
    try {
      const phase = getMarketClock(started).phase;
      if (phase === 'closed' || phase === 'unknown') {
        this.fence();
        this.setStatus('closed');
        return;
      }
      const demand = mergeDemand([...this.clients].map((c) => c.demand)).slice(0, MAX_STREAM_DEMAND);
      const published = this.staged;
      this.staged = {};
      const state = await this.io.step({
        node: this.id,
        demand,
        marks: published,
        status: this.status,
        release: false,
        backoff: Math.max(0, Math.ceil((this.backoffUntil - started) / 1000)),
        wantsSocket: !this.ws && started >= Math.max(this.nextConnect, this.backoffUntil),
      });
      if (this.closed || epoch !== this.lifetime) return;
      const now = Date.now();
      this.delay = heartbeatMs;
      for (const [symbol, tick] of this.last)
        if (now - tick.timestamp > 15 * 60_000) this.last.delete(symbol);
      for (const candidate of Object.values(state.marks)) {
        const tick = admissibleTick(
          candidate.symbol,
          candidate.price,
          candidate.timestamp,
          now,
          candidate.source,
          candidate.phase === 'overnight',
        );
        if (tick && tick.phase === candidate.phase) this.accept(tick, false);
      }
      if (!state.leader || now - started >= leaseSafetyMs) {
        this.fence();
        this.setStatus(state.leader ? 'unavailable' : state.status);
        return;
      }
      this.lease = started + leaseSafetyMs;
      clearTimeout(this.fenceTimer);
      this.fenceTimer = setTimeout(() => this.fence(), this.lease - now);
      this.desired = new Set(state.symbols ?? []);
      if (this.status === 'unavailable' || this.status === 'closed') this.setStatus('connecting');
      if (state.allowSocket) this.ensureSocket();
      if (!this.ws) this.setStatus('fallback');
      this.syncSymbols();
      if (state.restSymbol && phase === 'regular') {
        const symbol = state.restSymbol;
        void this.io
          .quote(symbol)
          .then((quote) => {
            const finished = Date.now();
            if (this.closed || epoch !== this.lifetime || finished >= this.lease) return;
            if (quote.backoff)
              this.backoffUntil = Math.max(this.backoffUntil, finished + quote.backoff * 1000);
            const tick = admissibleTick(symbol, quote.c, (quote.t ?? 0) * 1000, finished, 'quote');
            if (tick) this.accept(tick, true);
          })
          .catch(() => {});
      }
    } catch {
      this.fence();
      this.setStatus('unavailable');
      this.delay = Math.min(30_000, this.delay * 2);
    } finally {
      this.busy = false;
      if (this.closed) void this.release();
      else
        this.timer = setTimeout(() => {
          this.timer = undefined;
          void this.beat();
        }, this.delay);
    }
  }
}
