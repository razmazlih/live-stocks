const DEFAULT_FORECAST_URL = 'http://localhost:8080';

function normalizeForecastUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = trimmed === '1' ? DEFAULT_FORECAST_URL : trimmed;

  try {
    const parsed = new URL(candidate);
    parsed.search = '';
    parsed.hash = '';
    const normalized = parsed.toString().replace(/\/+$/, '');
    return normalized;
  } catch (error) {
    console.warn('Invalid NEXT_PUBLIC_FORECAST_URL value, disabling forecast feature:', error);
    return null;
  }
}

const normalizedForecastUrl = normalizeForecastUrl(process.env.NEXT_PUBLIC_FORECAST_URL);

export const FORECAST_BASE_URL = normalizedForecastUrl;

export const FORECAST_FEATURE_ENABLED = normalizedForecastUrl !== null;
