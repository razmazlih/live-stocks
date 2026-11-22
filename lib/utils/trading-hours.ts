const DAY = 86_400_000;
const tz = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export type MarketPhase = 'pre' | 'regular' | 'post' | 'overnight' | 'closed' | 'unknown';
export interface TradingSession {
  date: string;
  pre: number;
  open: number;
  close: number;
  postEnd: number;
}
export interface MarketClock {
  phase: MarketPhase;
  date: string;
  session: TradingSession | null;
  previous: TradingSession | null;
  closing: TradingSession | null;
  nextTransition: number | null;
  overnight?: { start: number; end: number };
}

function easternParts(time: number) {
  return Object.fromEntries(tz.formatToParts(time).map(part => [part.type, part.value]));
}

export function easternDate(time: number): string {
  const parts = easternParts(time);
  return [parts.year, parts.month, parts.day].join('-');
}

// Published US equities calendars. Do not extrapolate market hours outside coverage.
// https://www.nyse.com/markets/hours-calendars  https://www.nasdaqtrader.com/Trader.aspx?id=Calendar
const holidays = new Set([
  '2024-01-01','2024-01-15','2024-02-19','2024-03-29','2024-05-27','2024-06-19','2024-07-04','2024-09-02','2024-11-28','2024-12-25',
  '2025-01-01','2025-01-09','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
  '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25',
]);
const earlyCloses = new Set([
  '2024-07-03','2024-11-29','2024-12-24','2025-07-03','2025-11-28','2025-12-24',
  '2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24',
]);

function supported(date: string) {
  return date >= '2024-01-01' && date <= '2028-12-31';
}

export function tradingSession(date: string): TradingSession | null {
  const midnight = Date.parse(date + 'T00:00:00Z');
  const day = new Date(midnight).getUTCDay();
  if (!Number.isFinite(midnight) || !supported(date) || day === 0 || day === 6 || holidays.has(date)) return null;
  // US DST changes on Sundays. Noon UTC gives the applicable offset for every session.
  const offsetHours = 12 - Number(easternParts(midnight + 12 * 3_600_000).hour);
  const at = (hour: number) => midnight + (offsetHours + hour) * 3_600_000;
  const short = earlyCloses.has(date);
  return { date, pre: at(4), open: at(9.5), close: at(short ? 13 : 16), postEnd: at(short ? 17 : 20) };
}

export function adjacentSession(date: string, direction: -1 | 1) {
  const midnight = Date.parse(date + 'T00:00:00Z');
  for (let days = 1; days <= 10; days++) {
    const key = new Date(midnight + direction * days * DAY).toISOString().slice(0, 10);
    const session = tradingSession(key);
    if (session) return session;
  }
  return null;
}

export function getMarketClock(time: number = Date.now()): MarketClock {
  const date = easternDate(time);
  const session = tradingSession(date);
  if (!supported(date)) return { date, phase: 'unknown', session: null, previous: null, closing: null, nextTransition: null };
  const previous = adjacentSession(date, -1);
  const closing = session && time >= session.close ? session : previous;
  // ETA2026-72 supersedes the initially announced 04:00 end. The night belongs
  // to the next business day and starts on the preceding calendar evening.
  const next = adjacentSession(date, 1);
  const nightFor = (trading: TradingSession | null) => trading && trading.date >= '2026-12-07'
    ? { start: trading.pre - 7 * 3_600_000, end: trading.pre - 5 * 60_000 } : null;
  const nights = [nightFor(session), nightFor(next)].filter((n): n is {start: number; end: number} => n !== null);
  const overnight = nights.find(night => time >= night.start && time < night.end);
  if (overnight) return { date, phase: 'overnight', session, previous, closing, overnight, nextTransition: overnight.end };
  const nextOpening = [...nights.map(n => n.start), session?.pre, next?.pre]
    .filter((t): t is number => t !== undefined && t > time).sort((a,b) => a-b)[0] ?? null;
  if (session) {
    if (time < session.pre) return { date, phase: 'closed', session, previous, closing, nextTransition: nextOpening };
    if (time < session.open) return { date, phase: 'pre', session, previous, closing, nextTransition: session.open };
    if (time < session.close) return { date, phase: 'regular', session, previous, closing, nextTransition: session.close };
    if (time < session.postEnd) return { date, phase: 'post', session, previous, closing, nextTransition: session.postEnd };
  }
  return { date, phase: 'closed', session, previous, closing, nextTransition: nextOpening };
}

export function isNasdaqTradingHours(date: Date = new Date()): boolean {
  return getMarketClock(date.getTime()).phase === 'regular';
}

export function getNasdaqRefreshInterval(date: Date = new Date()): number {
  const { phase } = getMarketClock(date.getTime());
  return phase === 'regular' || phase === 'pre' || phase === 'post' || phase === 'overnight' ? 1 : 60;
}
