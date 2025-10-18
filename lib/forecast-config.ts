const DEFAULT_FORECAST_URL = 'http://localhost:8080';

const rawUrl = process.env.NEXT_PUBLIC_FORECAST_URL;
const trimmedUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
const candidateUrl =
  trimmedUrl === '1' ? DEFAULT_FORECAST_URL : trimmedUrl;

export const FORECAST_BASE_URL =
  candidateUrl.length > 0 ? candidateUrl.replace(/\/+$/, '') : null;

export const FORECAST_FEATURE_ENABLED = FORECAST_BASE_URL !== null;
