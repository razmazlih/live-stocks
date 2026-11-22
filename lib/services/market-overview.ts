import { type SymbolMarketData, type MarketMark } from '@/lib/market-overview';
import { easternDate, getMarketClock, tradingSession, type MarketClock, type TradingSession } from '@/lib/utils/trading-hours';
import type { Position, StockQuote } from '@/types';

type ProviderPeriod = { start?: number; end?: number };
interface YahooChart {
  meta?: {
    symbol?: string;
    currency?: string;
    exchangeName?: string;
    exchangeTimezoneName?: string;
    regularMarketTime?: number;
    regularMarketPrice?: number;
    tradingPeriods?: { pre?: ProviderPeriod[][]; post?: ProviderPeriod[][]; regular?: ProviderPeriod[][]; overnight?: ProviderPeriod[][] };
  };
  timestamp?: number[];
  indicators?: { quote?: { close?: (number | null)[] }[] };
}
const US_EQUITY_VENUES = new Set(['NMS', 'NGM', 'NCM', 'NYQ', 'NYS', 'ASE', 'PCX', 'BTS', 'BZX']);
const valid = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

function supportsUsRegularHours(chart: YahooChart | undefined, symbol: string): boolean {
  const meta = chart?.meta;
  return meta?.symbol?.toUpperCase() === symbol && meta.currency === 'USD'
    && meta.exchangeTimezoneName === 'America/New_York' && US_EQUITY_VENUES.has(meta.exchangeName ?? '');
}

function qualifiedTick(price: number | undefined, seconds: number | undefined, day: TradingSession, now: number): MarketMark | undefined {
  if (!valid(price) || !valid(seconds)) return undefined;
  const asOf = seconds * 1000;
  return asOf >= day.open && asOf <= Math.min(now, day.close) ? { price, asOf } : undefined;
}

export function normalizeMarketData(symbol: string, quote: Partial<StockQuote> | undefined, daily: YahooChart | undefined, intraday: YahooChart | undefined, clock: MarketClock, now: number): SymbolMarketData {
  const result: SymbolMarketData = { closes: {} };
  const confirmedDaily = supportsUsRegularHours(daily, symbol) ? daily : undefined;
  const confirmedIntraday = supportsUsRegularHours(intraday, symbol) ? intraday : undefined;
  const meta = confirmedDaily?.meta;
  const lastRegular = valid(meta?.regularMarketTime) ? meta.regularMarketTime * 1000 : 0;
  const times = confirmedDaily?.timestamp ?? [];
  const latestBar = times.reduce((latest, time) => valid(time) && time * 1000 <= now ? Math.max(latest, time * 1000) : latest, 0);
  const latestBarDate = latestBar > 0 ? easternDate(latestBar) : '';
  const latestPrintDate = lastRegular > 0 && lastRegular <= now ? easternDate(lastRegular) : '';
  const closes = confirmedDaily?.indicators?.quote?.[0]?.close ?? [];
  for (const [index, seconds] of times.entries()) {
    const price = closes[index];
    if (!valid(seconds) || !valid(price) || seconds * 1000 > now) continue;
    const date = easternDate(seconds * 1000);
    const day = tradingSession(date);
    if (!day || now < day.close) continue;
    // A daily OHLC bar exists as soon as a session opens. Its timestamp alone
    // cannot certify a close. Later session data, or agreement with the provider's
    // regular closing print, establish that this is a completed regular bar.
    const laterSession = latestBarDate > date || latestPrintDate > date;
    const confirmedPrint = lastRegular >= day.close && lastRegular <= now && easternDate(lastRegular) === date
      && valid(meta?.regularMarketPrice) && Math.abs(meta.regularMarketPrice - price) <= Math.max(0.00001, price * 0.000001);
    if (laterSession || confirmedPrint) result.closes[date] = {price, asOf: day.close};
  }
  if (clock.phase === 'regular' && clock.session && (confirmedDaily || confirmedIntraday)) {
    const regularQuote = qualifiedTick(quote?.c, quote?.t, clock.session, now);
    if (regularQuote && clock.previous && valid(quote?.pc) && !result.closes[clock.previous.date]) {
      result.closes[clock.previous.date] = {price: quote.pc, asOf: clock.previous.close};
    }
    const feeds = [regularQuote,
      qualifiedTick(meta?.regularMarketPrice, meta?.regularMarketTime, clock.session, now)]
      .filter((tick): tick is MarketMark => Boolean(tick)).sort((a,b) => b.asOf - a.asOf);
    result.regular = feeds[0];
  }
  if ((clock.phase !== 'pre' && clock.phase !== 'post' && clock.phase !== 'overnight') || !confirmedIntraday) return result;
  const from = clock.phase === 'overnight' ? clock.overnight?.start : clock.phase === 'pre' ? clock.session?.pre : clock.session?.close;
  const to = clock.phase === 'overnight' ? clock.overnight?.end : clock.phase === 'pre' ? clock.session?.open : clock.session?.postEnd;
  if (from === undefined || to === undefined) return result;
  const periods = confirmedIntraday.meta?.tradingPeriods?.[clock.phase]?.flat() ?? [];
  const period = periods.find(p => valid(p.start) && valid(p.end)
    && p.start * 1000 <= now && now < p.end * 1000 && p.start * 1000 < to && p.end * 1000 > from);
  if (!period?.start || !period.end) return result;
  const boundsStart = Math.max(from, period.start * 1000);
  const boundsEnd = Math.min(now, to, period.end * 1000);
  const extendedPrices = confirmedIntraday.indicators?.quote?.[0]?.close ?? [];
  for (const [index, seconds] of (confirmedIntraday.timestamp ?? []).entries()) {
    const price = extendedPrices[index];
    const start = seconds * 1000;
    const end = start + 5 * 60_000;
    if (!valid(price) || !valid(seconds) || start < boundsStart || end > boundsEnd) continue;
    if (!result.extended || end > result.extended.asOf) result.extended = { price, asOf: end };
  }
  return result;
}

async function fetchChart(symbol: string, extended: boolean): Promise<YahooChart | undefined> {
  const query = extended ? 'range=5d&interval=5m&includePrePost=true' : 'range=1mo&interval=1d&includePrePost=false';
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?' + query;
  try {
    const response = await fetch(url, {cache: 'no-store', headers: { 'User-Agent': 'LiveStocks/1.0 (public market data)' }, signal: AbortSignal.timeout(6000)});
    if (!response.ok) return undefined;
    const data: {chart?: {result?: YahooChart[]}} = await response.json();
    return data.chart?.result?.[0];
  } catch {
    return undefined;
  }
}

export async function fetchMarketMarks(positions: Position[], quotes: Record<string, Partial<StockQuote>>, now: number) {
  const clock = getMarketClock(now);
  const marks: Record<string, SymbolMarketData> = {};
  if (clock.phase !== 'unknown') {
    const baseline = (clock.phase === 'regular' ? clock.previous : clock.closing)?.date ?? clock.date;
    const relevant = positions.filter(p => p.quantity > 0 || p.lots?.some(lot => lot.executedAt.slice(0, 10) >= baseline));
    const symbols = [...new Set(relevant.map(p => p.symbol.trim().toUpperCase()).filter(Boolean))];
    const held = new Set(positions.filter(p => p.quantity > 0).map(p => p.symbol.trim().toUpperCase()));
    // Limit upstream concurrency independently of the number of stocks in an account.
    async function worker() {
      for (let symbol = symbols.pop(); symbol; symbol = symbols.pop()) {
        const needsExtended = (clock.phase === 'post' || clock.phase === 'pre' || clock.phase === 'overnight') && held.has(symbol);
        const [daily, intraday] = await Promise.all([fetchChart(symbol, false), needsExtended ? fetchChart(symbol, true) : undefined]);
        marks[symbol] = normalizeMarketData(symbol, quotes[symbol], daily, intraday, clock, now);
      }
    }
    await Promise.all(Array.from({length: Math.min(5, symbols.length)}, worker));
  }
  return marks;
}
