import {
  calculatePortfolioSummary, calculatePositionMetrics, calculateRealizedPortfolioTotals,
  calculateRealizedTaxLiability, enrichPortfolioSummaryWithRealized,
} from '@/lib/calculations';
import { computeRealizedSalesWithFx, orderPositionLots, summarizeLots } from '@/lib/positions';
import { reconciliationQuality } from '@/lib/reconciliation-quality';
import { adjacentSession, getMarketClock, type MarketPhase, type TradingSession } from '@/lib/utils/trading-hours';
import type { HistoricalPoint, PortfolioSummary, Position, StockQuote } from '@/types';

export interface MarketContributor { symbol: string; amountUsd: number; amountIls: number | null }
export interface MarketMover { symbol: string; price: number; percent: number; asOf: number; delayed?: boolean }
export interface MarketOverview {
  phase: MarketPhase;
  sessionDate: string;
  closeDate: string;
  asOf: number | null;
  regularCloseAt: number | null;
  nextTransition: number | null;
  daily: {
    amountUsd: number | null;
    amountIls: number | null;
    fxDate: string | null;
    percent: number | null;
    contributors: MarketContributor[];
    sourceContributors: {sourceId: string; amountUsd: number; amountIls: number | null}[];
    coveredPositions: number;
    totalPositions: number;
    missingSymbols: string[];
    missingSources: string[];
    provisional: boolean;
    previousSession?: boolean;
    delayed?: boolean;
  };
  extended: MarketMover[];
  extendedEligible: number;
  extendedCovered: number;
  closeConfirmed: boolean;
  closingProvisional: boolean;
  closingFxDate?: string | null;
  closingSummary: PortfolioSummary | null;
}

export interface MarketMark { price: number; asOf: number }
export interface SymbolMarketData {
  regular?: MarketMark;
  closes: Record<string, MarketMark>;
  extended?: MarketMark;
}
export interface MarketAccounting {
  annualGrowthRate: number;
  usdToIls: number;
  fxHistoryPoints: HistoricalPoint[];
}
const good = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const tolerance = 1e-8;
const key = (symbol: string) => symbol.trim().toUpperCase();

// Lot execution values in PostgreSQL are civil dates, including date-only legacy rows.
function exposure(position: Position, session: TradingSession, prior: TradingSession | null) {
  const lots = orderPositionLots(position.lots ?? []);
  let opening = 0;
  let ending = 0;
  let salesLessBuys = 0;
  let traded = false;
  let unknown = false;
  if (!lots.length) {
    const entry = position.entryDate.slice(0, 10);
    if (entry > session.date) return null;
    opening = entry < session.date ? position.quantity : 0;
    ending = position.quantity;
    unknown = entry === session.date || !entry || !Number.isFinite(ending) || position.accountingIncomplete === true;
  } else {
    for (const lot of lots) {
      const date = lot.executedAt.slice(0, 10);
      if (date > session.date) continue;
      if (!date || !Number.isFinite(lot.quantity) || lot.quantity < 0) unknown = true;
      if (prior && date > prior.date && date < session.date) unknown = true;
      const quantity = lot.type === 'SELL' ? -lot.quantity : lot.quantity;
      ending = lot.type === 'RECONCILE' ? lot.quantity : ending + quantity;
      if (date < session.date) opening = ending;
      else {
        traded = true;
        if (lot.type === 'RECONCILE' || !good(lot.price)) unknown = true;
        salesLessBuys -= quantity * lot.price;
      }
    }
  }
  if (Math.abs(ending) < tolerance) ending = 0;
  if (Math.abs(opening) < tolerance) opening = 0;
  if (!opening && !ending && !traded && !unknown) return null;
  return { opening, ending, salesLessBuys, traded, unknown: unknown || opening < 0 || ending < 0 };
}

function positionsOnDate(positions: Position[], date: string): Position[] {
  return positions.flatMap(position => {
    if (!position.lots?.length) return position.entryDate.slice(0, 10) <= date ? [position] : [];
    const lots = position.lots.filter(lot => lot.executedAt.slice(0, 10) <= date);
    if (!lots.length) return [];
    const { averageEntryPrice, totalQuantity } = summarizeLots(lots);
    return [{ ...position, lots, quantity: totalQuantity, entryPrice: averageEntryPrice,
      accountingIncomplete: lots.some(lot => lot.type === 'RECONCILE') }];
  });
}

const DAY = 86_400_000;
const fxCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
});

function sessionFxResolver(points: HistoricalPoint[]) {
  const byDay = new Map<number, number>();
  for (const point of points) {
    if (!Number.isFinite(point.timestamp) || !good(point.close)) continue;
    // Yahoo timestamps FX daily candles at London midnight (23:00 UTC during BST).
    const date = Object.fromEntries(fxCalendar.formatToParts(point.timestamp).map(p => [p.type, p.value]));
    const day = Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day)) / DAY;
    byDay.set(day, point.close);
  }
  return (timestamp: number, lastAvailableDay = Infinity) => {
    const day = Math.floor(timestamp / DAY);
    for (let sessionDay = Math.min(lastAvailableDay, day); sessionDay >= day - 4; sessionDay--) {
      const rate = byDay.get(sessionDay);
      if (rate !== undefined) return { rate, date: new Date(sessionDay * DAY).toISOString().slice(0, 10) };
    }
    return { rate: Number.NaN, date: null };
  };
}

function summarizeClose(positions: Position[], marks: Record<string, SymbolMarketData>, close: TradingSession, accounting: MarketAccounting, fx: (timestamp: number) => number) {
  const quality = reconciliationQuality(positions);
  if (!quality.completeCommissionHistory || !quality.completeTransactionHistory) return null;
  const rate = fx(Date.parse(close.date));
  const metrics = positions.map(position => calculatePositionMetrics(position,
    position.quantity > tolerance ? marks[key(position.symbol)]?.closes[close.date]?.price ?? Number.NaN : 0,
    rate, accounting.annualGrowthRate, undefined, fx, new Date(close.close)));
  const summary = calculatePortfolioSummary(metrics, rate);
  const sales = positions.flatMap(position => computeRealizedSalesWithFx(position, fx))
    .sort((a, b) => Date.parse(a.sellDate) - Date.parse(b.sellDate));
  const realized = calculateRealizedPortfolioTotals(sales, accounting.annualGrowthRate, rate, fx);
  const tax = calculateRealizedTaxLiability(sales.map(sale => ({
    profitUsd: sale.profitUsd, profitIls: sale.profitIls ?? Number.NaN, timestamp: Date.parse(sale.sellDate),
  })));
  return enrichPortfolioSummaryWithRealized(summary, realized, tax);
}

function attributeSession(positions: Position[], marks: Record<string, SymbolMarketData>, day: TradingSession | null,
  regular: boolean, now: number, referenceFx: { rate: number; date: string | null }) {
  const prior = day ? adjacentSession(day.date, -1) : null;
  const fx = referenceFx.rate;
  const bySymbol = new Map<string, number>();
  const bySource = new Map<string, number>();
  const missing = new Set<string>();
  const missingSources = new Set<string>();
  let asOf: number | null = null;
  let missingRegularMarks = 0;
  let coveredPositions = 0;
  let totalPositions = 0;
  let profit = 0;
  let openingValue = 0;
  let traded = false;
  if (day) for (const position of positions) {
    const flow = exposure(position, day, prior);
    if (!flow) continue;
    totalPositions++;
    traded ||= flow.traded;
    const symbol = key(position.symbol);
    const stock = marks[symbol];
    const current = stock?.regular;
    const liveMark = current && current.asOf >= day.open && current.asOf <= now ? current : undefined;
    const endMark = regular ? liveMark : stock?.closes[day.date];
    if (regular && !flow.unknown && flow.ending > 0 && !good(endMark?.price)) missingRegularMarks++;
    const startMark = prior ? stock?.closes[prior.date] : undefined;
    if (flow.unknown || (flow.opening > 0 && !good(startMark?.price)) || (flow.ending > 0 && !good(endMark?.price))) {
      missing.add(symbol);
      missingSources.add(position.location);
      continue;
    }
    const opening = flow.opening ? flow.opening * startMark!.price : 0;
    const ending = flow.ending ? flow.ending * endMark!.price : 0;
    const amount = ending - opening + flow.salesLessBuys;
    coveredPositions++;
    profit += amount;
    openingValue += opening;
    if (flow.ending && endMark) asOf = Math.min(asOf ?? Infinity, endMark.asOf);
    bySymbol.set(symbol, (bySymbol.get(symbol) ?? 0) + amount);
    bySource.set(position.location, (bySource.get(position.location) ?? 0) + amount);
  }
  const complete = Boolean(day) && missing.size === 0;
  const available = complete || coveredPositions > 0;
  const contributors = (values: Map<string, number>) => [...values]
    .sort(([a, va], [b, vb]) => Math.abs(vb) - Math.abs(va) || a.localeCompare(b))
    .map(([id, amountUsd]) => ({ id, amountUsd, amountIls: good(fx) ? amountUsd * fx : null }));
  return {
    asOf, waitingForMarks: totalPositions > 0 && missingRegularMarks === totalPositions,
    daily: { fxDate: referenceFx.date, amountUsd: available ? profit : null, amountIls: available && good(fx) ? profit * fx : null,
      percent: complete && !traded && openingValue > 0 ? 100 * profit / openingValue : null,
      contributors: contributors(bySymbol).map(({id, ...amount}) => ({symbol: id, ...amount})),
      sourceContributors: contributors(bySource).map(({id, ...amount}) => ({sourceId: id, ...amount})),
      coveredPositions, totalPositions, missingSymbols: [...missing].sort(), missingSources: [...missingSources].sort(),
      provisional: traded, delayed: regular && asOf !== null && now - asOf > 15 * 60_000 },
  };
}

export function buildMarketOverview(positions: Position[], marks: Record<string, SymbolMarketData>, now: number, accounting: MarketAccounting): MarketOverview {
  const clock = getMarketClock(now);
  const regular = clock.phase === 'regular';
  const day = regular ? clock.session : clock.closing;
  const close = clock.closing;
  const heldAtClose = close ? positionsOnDate(positions, close.date) : [];
  const closeConfirmed = Boolean(close) && heldAtClose.every(position => position.quantity <= tolerance || good(marks[key(position.symbol)]?.closes[close!.date]?.price));
  const fxAt = sessionFxResolver(accounting.fxHistoryPoints);
  // The London daily FX candle for the same date is still forming at the US
  // regular close. Freeze conversion at the latest completed daily observation.
  const closeFxDay = close ? Date.parse(close.date) / DAY - 1 : -Infinity;
  const closingFx = (timestamp: number) => fxAt(timestamp, closeFxDay).rate;
  const referenceFx = day ? fxAt(Date.parse(day.date), regular ? Infinity : closeFxDay) : {rate: Number.NaN, date: null};
  const current = attributeSession(positions, marks, day, regular, now, referenceFx);
  let attribution = current;
  let sessionDate = day?.date ?? clock.date;
  const closeFx = close ? fxAt(Date.parse(close.date), closeFxDay) : null;
  if (regular && close && closeFx && closeConfirmed && current.waitingForMarks) {
    const previous = attributeSession(positions, marks, close, false, now, closeFx);
    if (previous.daily.totalPositions > 0 && previous.daily.missingSymbols.length === 0) {
      attribution = previous;
      sessionDate = close.date;
    }
  }
  const held = new Set(positionsOnDate(positions, clock.date).filter(p => p.quantity > tolerance).map(p => key(p.symbol)));
  const movers = [...held].flatMap(symbol => {
    if (clock.phase !== 'pre' && clock.phase !== 'post' && clock.phase !== 'overnight') return [];
    const extended = marks[symbol]?.extended;
    const reference = close && marks[symbol]?.closes[close.date];
    if (!extended || !good(extended.price) || !reference || !good(reference.price)) return [];
    return [{ symbol, price: extended.price, asOf: extended.asOf, delayed: now - extended.asOf > 15 * 60_000, percent: 100 * (extended.price - reference.price) / reference.price }];
  }).sort((a,b) => Math.abs(b.percent) - Math.abs(a.percent) || a.symbol.localeCompare(b.symbol));
  return {
    phase: clock.phase === 'overnight' && !movers.length ? 'closed' : clock.phase, sessionDate, closeDate: close?.date ?? clock.date,
    regularCloseAt: close?.close ?? null, nextTransition: clock.nextTransition, asOf: attribution.asOf,
    daily: { ...attribution.daily, previousSession: attribution !== current },
    closingFxDate: closeFx?.date ?? null,
    closeConfirmed, closingProvisional: Boolean(close && heldAtClose.some(p => p.lots?.some(lot => lot.executedAt.slice(0, 10) === close.date))),
    closingSummary: closeConfirmed && close ? summarizeClose(heldAtClose, marks, close, accounting, closingFx) : null,
    extended: movers.filter(mover => mover.percent !== 0), extendedCovered: movers.length, extendedEligible: held.size,
  };
}

export function demoMarketBasis(positions: Position[], quotes: Record<string, Pick<StockQuote, 'c' | 'd'>>, now: number, usdToIls = 3.65) {
  const clock = getMarketClock(now);
  const day = clock.phase === 'regular' ? clock.session : clock.closing;
  const prior = day && adjacentSession(day.date, -1);
  const marks: Record<string, SymbolMarketData> = {};
  for (const [symbol, quote] of Object.entries(quotes)) {
    const change = quote.d ?? 0;
    const price = quote.c;
    const stock: SymbolMarketData = { closes: {} };
    if (day) stock.closes[day.date] = { price, asOf: day.close };
    if (prior) stock.closes[prior.date] = { price: price - change, asOf: prior.close };
    if (clock.phase === 'regular') stock.regular = { price, asOf: now - 1000 };
    if (clock.phase === 'pre' || clock.phase === 'post') stock.extended = { price: price + change * 0.4, asOf: now - 60_000 };
    marks[symbol] = stock;
  }
  return { marks, fxHistoryPoints: [
    ...positions.flatMap(p => [p.entryDate, ...(p.lots ?? []).map(lot => lot.executedAt)].map(date => ({timestamp: Date.parse(date), close: usdToIls}))),
    {timestamp: Date.parse(day?.date ?? clock.date), close: usdToIls},
    ...(clock.closing ? [0, -1].map(offset => ({timestamp: Date.parse(clock.closing!.date) + offset * DAY, close: usdToIls})) : []),
  ] };
}

export function demoMarketOverview(positions: Position[], quotes: Record<string, Pick<StockQuote, 'c' | 'd'>>, now: number, annualGrowthRate = 0.05, usdToIls = 3.65) {
  const { marks, fxHistoryPoints } = demoMarketBasis(positions, quotes, now, usdToIls);
  return buildMarketOverview(positions, marks, now, { annualGrowthRate, usdToIls, fxHistoryPoints });
}
