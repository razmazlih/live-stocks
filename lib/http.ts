export interface RetryOptions {
  retries?: number;
  delayMs?: number;
  shouldRetry?: (response: Response) => boolean;
}

export class HttpStatusError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(status: number, retryAfterSeconds?: number) {
    super(`HTTP ${status}`);
    this.name = 'HttpStatusError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 1000;
const DEFAULT_SHOULD_RETRY = (response: Response): boolean => {
  if (response.status === 429) {
    return true;
  }

  return response.status >= 500;
};

async function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: RetryOptions = {},
): Promise<Response> {
  const {
    retries = DEFAULT_RETRIES,
    delayMs = DEFAULT_DELAY_MS,
    shouldRetry = DEFAULT_SHOULD_RETRY,
  } = options;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url, init);

      if (response.ok) {
        return response;
      }

      const retryAfterRaw = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : Number.NaN;
      lastError = new HttpStatusError(
        response.status,
        Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      );

      if (!shouldRetry(response) || attempt === retries - 1) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;

      if (attempt === retries - 1) {
        throw error;
      }
    }

    const backoff = delayMs * Math.pow(2, attempt);
    await wait(backoff);
  }

  throw lastError ?? new Error('Max retries reached');
}
