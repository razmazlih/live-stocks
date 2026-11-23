import { getMarketClock, type MarketPhase } from '@/lib/utils/trading-hours';

export type LiveQuotePhase = Exclude<MarketPhase, 'closed' | 'unknown'>;
export type LiveQuoteStatus = 'idle' | 'connecting' | 'streaming' | 'fallback' | 'unavailable' | 'closed';
export type LiveQuotePriority = 'selected' | 'holding' | 'watchlist';
export interface LiveQuoteTick {
  symbol: string;
  price: number;
  timestamp: number;
  phase: LiveQuotePhase;
  source: 'trade' | 'quote' | 'demo';
  /** A previously accepted observation retained while waiting for a new print. */
  stale?: boolean;
}
export type StreamDemand = { symbol: string; priority: number };
export const MAX_LIVE_SYMBOLS = 50;
export const MAX_STREAM_DEMAND = 150;
export const PRIORITY = { selected: 0, holding: 1, watchlist: 2 } as const;
export interface LiveQuoteFrame {
  status: LiveQuoteStatus;
  ticks: LiveQuoteTick[];
}

export function liveSymbol(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const symbol = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9]{0,9}(-[A-Z0-9]{1,4}|\.[AB])?$/.test(symbol) ? symbol : null;
}

export function mergeDemand(groups: Iterable<StreamDemand[]>): StreamDemand[] {
  const priorities = new Map<string, number>();
  for (const group of groups)
    for (const { symbol, priority } of group) {
      const name = liveSymbol(symbol);
      if (name && Number.isInteger(priority) && priority >= 0 && priority <= 2) {
        priorities.set(name, Math.min(priorities.get(name) ?? 2, priority));
      }
    }
  return [...priorities]
    .map(([symbol, priority]) => ({ symbol, priority }))
    .sort((a, b) => a.priority - b.priority || a.symbol.localeCompare(b.symbol));
}

const minuteClocks = new Map<number, ReturnType<typeof getMarketClock>>();
function tradingMinute(timestamp: number) {
  // All published session boundaries fall on a minute. Share calendar
  // calculations across the many trade prints in the same provider batch.
  const minute = Math.floor(timestamp / 60_000);
  let value = minuteClocks.get(minute);
  if (!value) {
    value = getMarketClock(minute * 60_000);
    if (minuteClocks.size >= 32) minuteClocks.delete(minuteClocks.keys().next().value!);
    minuteClocks.set(minute, value);
  }
  return value;
}

export function admissibleTick(
  symbol: string,
  price: unknown,
  timestamp: unknown,
  now: number,
  source: LiveQuoteTick['source'],
  explicitOvernight = false,
): LiveQuoteTick | null {
  if (
    !liveSymbol(symbol) ||
    typeof price !== 'number' ||
    !Number.isFinite(price) ||
    price <= 0 ||
    typeof timestamp !== 'number' ||
    !Number.isSafeInteger(timestamp) ||
    timestamp > now ||
    now - timestamp > 15 * 60_000
  )
    return null;
  const clock = tradingMinute(now);
  if (clock.phase === 'closed' || clock.phase === 'unknown') return null;
  const printed = tradingMinute(timestamp);
  if (printed.phase !== clock.phase || (printed.date !== clock.date && clock.phase !== 'overnight'))
    return null;
  if (
    clock.phase === 'overnight' &&
    (!explicitOvernight || printed.overnight?.start !== clock.overnight?.start)
  )
    return null;
  if (source === 'quote' && clock.phase !== 'regular') return null;
  return { symbol, price, timestamp, phase: clock.phase, source };
}

export function newerTick(prior: LiveQuoteTick | undefined, next: LiveQuoteTick) {
  return (
    !prior ||
    next.timestamp > prior.timestamp ||
    (next.timestamp === prior.timestamp && prior.source === 'quote' && next.source === 'trade')
  );
}
