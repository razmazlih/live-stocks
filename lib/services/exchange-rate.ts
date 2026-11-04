import { fetchWithRetry, type RetryOptions } from '@/lib/http';
import { isFiniteNumber } from '@/lib/utils/numbers';
import { ExchangeRateResponse } from '@/types';

const DEFAULT_EXCHANGE_RATE_URL = process.env.EXCHANGE_RATE_URL ?? 'https://open.er-api.com/v6/latest/USD';
const FALLBACK_RATE = (() => {
  const parsed = Number.parseFloat(process.env.DEFAULT_USD_TO_ILS_RATE ?? '3.7');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3.7;
})();
const DEFAULT_FETCH_INIT: RequestInit = { cache: 'no-store' };

interface FetchExchangeRateOptions extends Partial<RetryOptions> {
  url?: string;
  init?: RequestInit;
}

export async function fetchExchangeRateResponse(
  options: FetchExchangeRateOptions = {},
): Promise<ExchangeRateResponse> {
  const { url = DEFAULT_EXCHANGE_RATE_URL, init, ...retry } = options;
  const response = await fetchWithRetry(url, init ?? DEFAULT_FETCH_INIT, retry);
  return response.json() as Promise<ExchangeRateResponse>;
}

export function extractExchangeRate(
  data: ExchangeRateResponse,
  targetCurrency: string,
): number | null {
  if (!data?.rates) {
    return null;
  }

  const value = data.rates[targetCurrency as keyof typeof data.rates];
  return isFiniteNumber(value) && value > 0 ? value : null;
}

interface UsdToIlsRateOptions extends Partial<RetryOptions> {
  init?: RequestInit;
  fallback?: number;
  allowFallback?: boolean;
}

export async function getUsdToIlsRate(options: UsdToIlsRateOptions = {}): Promise<number> {
  const { init, fallback: customFallback, allowFallback = true, ...retryOptions } = options;

  const fallback = isFiniteNumber(customFallback) && customFallback > 0
    ? customFallback
    : FALLBACK_RATE;

  try {
    const data = await fetchExchangeRateResponse({ init, ...retryOptions });
    const rate = extractExchangeRate(data, 'ILS');

    if (rate !== null) {
      return rate;
    }

    console.warn('ILS rate missing from exchange response');
  } catch (error) {
    console.error('Failed to fetch exchange rate:', error);
  }

  return allowFallback ? fallback : Number.NaN;
}
