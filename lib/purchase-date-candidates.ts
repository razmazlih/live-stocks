import 'server-only';
import { z } from 'zod';
import { fetchYahooCandlesData } from '@/lib/services/yahoo-candles';

export const purchaseDateCandidatesInputSchema = z.object({
  symbol: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9.^=:-]*$/).transform(value => value.toUpperCase()),
  priceUsd: z.number().finite().positive().max(1_000_000_000),
  lookbackDays: z.number().int().min(1).max(1825).default(365),
  throughDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10) && Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  }, 'A real date at or before today is required').optional(),
}).strict();
export interface PurchaseDateCandidate {
  date: string;
  lowUsd: number;
  highUsd: number;
  closeUsd: number;
  rangeContainsPrice: boolean;
  distanceToRangePercent: number;
}
export interface PurchaseDateCandidatesResult {
  status: 'matched' | 'no_match' | 'unavailable';
  symbol: string;
  priceUsd: number;
  source: 'Yahoo Finance daily OHLC';
  retrievedAt: string;
  method: 'daily_range_with_0.5_percent_tolerance';
  tolerancePercent: 0.5;
  searchedFrom: string;
  searchedThrough: string;
  latestCandidateDate: string | null;
  candidates: PurchaseDateCandidate[];
  estimated: true;
  canVerifyAcquisition: false;
  warnings: string[];
}

/** A price-range search suggests possible dates; it never establishes a purchase or changes accounting. */
export async function findPurchaseDateCandidates(raw: unknown): Promise<PurchaseDateCandidatesResult> {
  const { symbol, priceUsd, lookbackDays, throughDate } = purchaseDateCandidatesInputSchema.parse(raw);
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = Date.parse(`${today}T00:00:00.000Z`);
  const endExclusive = throughDate ? Math.min(Date.parse(`${throughDate}T00:00:00.000Z`) + 86400_000, todayStart) : todayStart;
  const from = endExclusive - lookbackDays * 86400_000;
  const result: PurchaseDateCandidatesResult = {
    status: 'unavailable', symbol, priceUsd, source: 'Yahoo Finance daily OHLC', retrievedAt: new Date().toISOString(),
    method: 'daily_range_with_0.5_percent_tolerance', tolerancePercent: 0.5,
    searchedFrom: new Date(from).toISOString().slice(0, 10),
    searchedThrough: new Date(endExclusive - 1).toISOString().slice(0, 10),
    latestCandidateDate: null, candidates: [], estimated: true, canVerifyAcquisition: false,
    warnings: [
      'These are possible price-match dates, not evidence of when you purchased. Confirm using your transaction record or explicitly identify any chosen date as an estimate.',
      'Average acquisition cost, commissions, multiple purchases and currency conversions may differ from the quoted stock price.',
      'Stock splits and provider price adjustments can change historical comparisons. Verify the exchange, USD currency and instrument identity; a ticker alone does not prove them.',
      'Only completed prior UTC calendar days are searched. A daily high/low range does not show the time or prove an execution at your exact price; no match does not rule out a purchase.',
    ],
  };
  try {
    // The provider receives the public symbol and date bounds only, never the private cost basis.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const candles = await Promise.race([
      fetchYahooCandlesData(symbol, from / 1000, (endExclusive - 1000) / 1000, 'D'),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('History lookup deadline exceeded')), 8000); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    if (candles.s !== 'ok' || !Array.isArray(candles.t) || candles.t.length === 0) return result;
    const dates = new Map<string, PurchaseDateCandidate>();
    let validBars = 0;
    for (let index = 0; index < candles.t.length; index += 1) {
      const timestamp = candles.t[index] * 1000;
      const lowUsd = candles.l?.[index], highUsd = candles.h?.[index], closeUsd = candles.c?.[index];
      if (!Number.isFinite(timestamp) || timestamp < from || timestamp >= endExclusive
        || !Number.isFinite(lowUsd) || !Number.isFinite(highUsd) || !Number.isFinite(closeUsd)
        || lowUsd <= 0 || highUsd < lowUsd || closeUsd <= 0 || closeUsd < lowUsd || closeUsd > highUsd) continue;
      validBars += 1;
      const distance = priceUsd < lowUsd ? lowUsd - priceUsd : priceUsd > highUsd ? priceUsd - highUsd : 0;
      if (distance > priceUsd * 0.005 + Number.EPSILON * priceUsd * 8) continue;
      const date = new Date(timestamp).toISOString().slice(0, 10);
      const candidate = { date, lowUsd, highUsd, closeUsd, rangeContainsPrice: distance === 0, distanceToRangePercent: distance / priceUsd * 100 };
      const prior = dates.get(date);
      if (!prior || candidate.distanceToRangePercent < prior.distanceToRangePercent) dates.set(date, candidate);
    }
    result.candidates = [...dates.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    result.latestCandidateDate = result.candidates[0]?.date ?? null;
    result.status = result.candidates.length > 0 ? 'matched' : validBars > 0 ? 'no_match' : 'unavailable';
    return result;
  } catch {
    return result;
  }
}
