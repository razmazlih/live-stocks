import { ExchangeRateResponse } from '@/types';

const DEFAULT_USD_TO_ILS_RATE = Number.parseFloat(process.env.DEFAULT_USD_TO_ILS_RATE ?? '3.7');
const EXCHANGE_RATE_URL = process.env.EXCHANGE_RATE_URL ?? 'https://open.er-api.com/v6/latest/USD';

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        return response;
      }

      if (response.status === 429 && attempt < retries - 1) {
        const backoff = delay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === retries - 1) {
        throw error;
      }
      const backoff = delay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }

  throw new Error('Max retries reached');
}

export async function fetchUsdToIlsRate(): Promise<number> {
  const fallback = DEFAULT_USD_TO_ILS_RATE;
  const url = EXCHANGE_RATE_URL;

  try {
    const response = await fetchWithRetry(url);
    const data = await response.json() as ExchangeRateResponse;
    const rate = data?.rates?.ILS;

    if (isPositiveFiniteNumber(rate)) {
      return rate;
    }

    console.warn('ILS rate missing from exchange response, falling back to default');
    return fallback;
  } catch (error) {
    console.error('Failed to fetch exchange rate, using fallback:', error);
    return fallback;
  }
}
