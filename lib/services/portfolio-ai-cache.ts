import { unstable_cache } from 'next/cache';

const SNAPSHOT_TTL_SECONDS = 300;
const FAILURE_BACKOFF_MS = 30_000;

/** Server Data Cache plus per-instance request coalescing and failure backoff. */
export function cachePortfolioAiSnapshot<T>(load: () => Promise<T>) {
  let loading: Promise<T> | undefined;
  let reading: Promise<T> | undefined;
  let retryAfter = 0;
  let lastError: unknown;

  const loadOnce = async () => {
    if (Date.now() < retryAfter) throw lastError;
    if (!loading) {
      loading = load().catch(error => {
        lastError = error;
        retryAfter = Date.now() + FAILURE_BACKOFF_MS;
        throw error;
      }).finally(() => { loading = undefined; });
    }
    return loading;
  };

  // Fixed, versioned key: query strings and request headers cannot bypass this cache.
  // Scope is the application's existing shared portfolio, never an individual user.
  const read = unstable_cache(loadOnce, ['portfolio-ai-snapshot-v2'], {
    revalidate: SNAPSHOT_TTL_SECONDS,
  });

  return async () => {
    if (!reading) reading = read().finally(() => { reading = undefined; });
    return reading;
  };
}
