const MARKET_TIME_ZONE = 'America/New_York';

const marketTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIME_ZONE,
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
});

const marketDayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIME_ZONE,
  weekday: 'short',
});

function getMarketTime(date: Date) {
  const parts = marketTimeFormatter.formatToParts(date);
  const hour = parseInt(parts.find(part => part.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(part => part.type === 'minute')?.value || '0', 10);

  return { hour, minute };
}

function getMarketWeekday(date: Date) {
  return marketDayFormatter.format(date);
}

export function isNasdaqTradingHours(date: Date = new Date()): boolean {
  const weekday = getMarketWeekday(date);

  if (weekday === 'Sat' || weekday === 'Sun') {
    return false;
  }

  const { hour, minute } = getMarketTime(date);
  const totalMinutes = hour * 60 + minute;

  const marketOpenMinutes = 9 * 60 + 30;
  const marketCloseMinutes = 16 * 60;

  return totalMinutes >= marketOpenMinutes && totalMinutes < marketCloseMinutes;
}

export function getNasdaqRefreshInterval(date: Date = new Date()): number {
  return isNasdaqTradingHours(date) ? 1 : 60;
}
