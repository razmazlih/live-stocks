import { describe, expect, it, vi } from 'vitest';
import { cachePortfolioAiSnapshot } from '@/lib/services/portfolio-ai-cache';

describe('uncached personal snapshot compatibility wrapper', () => {
  it('does not reuse one account result for a later or concurrent request', async () => {
    const load = vi.fn().mockResolvedValueOnce({ user: 'a' }).mockResolvedValueOnce({ user: 'b' }).mockResolvedValueOnce({ user: 'c' });
    const read = cachePortfolioAiSnapshot(load);
    expect(await Promise.all([read(), read()])).toEqual([{ user: 'a' }, { user: 'b' }]);
    expect(await read()).toEqual({ user: 'c' });
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('does not share a previous account failure with the next request', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce('next account');
    const read = cachePortfolioAiSnapshot(load);
    await expect(read()).rejects.toThrow('unavailable');
    expect(await read()).toBe('next account');
  });
});
