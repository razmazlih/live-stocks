import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ cache: vi.fn() }));
vi.mock('next/cache', () => ({ unstable_cache: mocks.cache }));
import { cachePortfolioAiSnapshot } from '@/lib/services/portfolio-ai-cache';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('portfolio AI server cache', () => {
  it('uses a fixed shared key and five-minute lifetime, preserving the snapshot timestamp', async () => {
    vi.useFakeTimers();
    // Model the framework Data Cache contract; production cache behavior is owned by Next.js.
    mocks.cache.mockImplementation((load, _keys, { revalidate }) => {
      let entry: { value: unknown; expires: number } | undefined;
      return async () => {
        if (entry && Date.now() < entry.expires) return entry.value;
        const value = await load();
        entry = { value, expires: Date.now() + revalidate * 1000 };
        return value;
      };
    });
    const load = vi.fn(async () => ({ generatedAt: new Date().toISOString() }));
    const read = cachePortfolioAiSnapshot(load);
    const first = await read();
    vi.advanceTimersByTime(299_999);
    expect(await read()).toEqual(first);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(await read()).not.toEqual(first);
    expect(load).toHaveBeenCalledTimes(2);
    expect(mocks.cache).toHaveBeenCalledWith(expect.any(Function), ['portfolio-ai-snapshot-v1'], { revalidate: 300 });
  });

  it('coalesces concurrent cold reads and concurrent background refreshes', async () => {
    let refresh!: () => Promise<unknown>;
    mocks.cache.mockImplementation(load => { refresh = load; return load; });
    let finish!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const read = cachePortfolioAiSnapshot(load);
    const requests = [read(), read(), read(), refresh(), refresh()];
    expect(load).toHaveBeenCalledTimes(1);
    finish('snapshot');
    expect(await Promise.all(requests)).toEqual(Array(5).fill('snapshot'));
  });

  it('backs off failed loads for 30 seconds and then recovers', async () => {
    vi.useFakeTimers();
    mocks.cache.mockImplementation(load => load);
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('recovered');
    const read = cachePortfolioAiSnapshot(load);
    await expect(read()).rejects.toThrow('offline');
    vi.advanceTimersByTime(29_999);
    await expect(read()).rejects.toThrow('offline');
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(await read()).toBe('recovered');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
