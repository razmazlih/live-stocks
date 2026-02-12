import { CandleData, HistoricalPoint } from '@/types';
import { mapCandleDataToPoints } from '@/lib/calculations';

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeToUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function buildUsdIlsRateResolver(
  points: HistoricalPoint[],
  fallbackRate: number,
): (timestamp: number) => number {
  const validPoints = points
    .map((point) => ({
      day: normalizeToUtcDay(point.timestamp),
      rate: point.close,
    }))
    .filter((point) => Number.isFinite(point.day) && Number.isFinite(point.rate) && point.rate > 0)
    .sort((a, b) => a.day - b.day);

  const dayToRate = new Map<number, number>();
  validPoints.forEach((point) => {
    dayToRate.set(point.day, point.rate);
  });

  return (timestamp: number): number => {
    if (!Number.isFinite(timestamp)) {
      return fallbackRate;
    }

    const targetDay = normalizeToUtcDay(timestamp);
    const exact = dayToRate.get(targetDay);
    if (typeof exact === 'number' && exact > 0) {
      return exact;
    }

    for (let day = targetDay - DAY_MS; day >= targetDay - DAY_MS * 7; day -= DAY_MS) {
      const prev = dayToRate.get(day);
      if (typeof prev === 'number' && prev > 0) {
        return prev;
      }
    }

    let left = 0;
    let right = validPoints.length - 1;
    let candidate: number | null = null;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const value = validPoints[mid];
      if (value.day <= targetDay) {
        candidate = value.rate;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return candidate ?? fallbackRate;
  };
}

export async function fetchUsdIlsHistoricalPoints(
  from: number,
  to: number,
): Promise<HistoricalPoint[]> {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return [];
  }

  const response = await fetch(
    `/api/candles?symbol=${encodeURIComponent('ILS=X')}&resolution=D&from=${from}&to=${to}`,
  );
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as CandleData & { error?: string };
  if (payload?.error) {
    return [];
  }

  return mapCandleDataToPoints(payload);
}
