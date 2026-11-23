import { demoAsset, demoQuote } from '@/lib/demo/assets';
import type { LiveQuoteTick } from '@/lib/live-quotes';
import { getMarketClock } from '@/lib/utils/trading-hours';
import type { StockQuote } from '@/types';

export function quoteTimestamp(quote?: StockQuote | null) {
  return quote?.t && Number.isFinite(quote.t) && quote.t > 0 ? quote.t * 1000 : null;
}

/** A newer print can change price. Percent change needs an independently dated reference. */
export function displayedQuote(symbol: string, snapshot?: StockQuote | null, tick?: LiveQuoteTick) {
  const snapshotTime = quoteTimestamp(snapshot);
  if (!tick || tick.symbol !== symbol || !Number.isFinite(tick.timestamp) || tick.price <= 0 || !Number.isFinite(tick.price)
    || (snapshotTime !== null && tick.timestamp < snapshotTime)) {
    return {quote: snapshot ?? null, timestamp: snapshotTime, extended: false, stale: false};
  }
  const clock = getMarketClock(tick.timestamp);
  const extended = tick.phase !== 'regular';
  let reference: number | undefined;
  if (tick.source === 'demo' && demoAsset(symbol)) {
    const demo = demoQuote(symbol);
    reference = extended ? demo.c : demo.pc;
  } else if (snapshot && snapshotTime !== null) {
    if (!extended && clock.session && snapshotTime >= clock.session.open && snapshotTime < clock.session.close) {
      reference = snapshot.pc ?? (snapshot.d !== undefined ? snapshot.c - snapshot.d : undefined);
    } else if (snapshotTime === clock.closing?.close) {
      reference = snapshot.c;
    }
  }
  const change = reference && reference > 0 ? tick.price - reference : undefined;
  const quote: StockQuote = {c: tick.price, t: tick.timestamp / 1000, d: change,
    dp: change !== undefined && reference ? 100 * change / reference : undefined};
  return {quote, timestamp: tick.timestamp, extended, stale: Boolean(tick.stale)};
}
