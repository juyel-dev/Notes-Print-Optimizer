import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAppCaches } from '../../lib/menu/actions';
import { pwOptimizerStorage } from '../../lib/optimizer/storage';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clearAppCaches', () => {
  it('reports failure when IndexedDB cleanup fails instead of announcing success', async () => {
    vi.spyOn(pwOptimizerStorage, 'clearCache').mockResolvedValue(false);

    const result = await clearAppCaches();

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Some cached data could not be cleared');
  });

  it('waits for IndexedDB cleanup to finish before returning', async () => {
    let release!: (success: boolean) => void;
    const pendingClear = new Promise<boolean>((resolve) => { release = resolve; });
    const clearSpy = vi.spyOn(pwOptimizerStorage, 'clearCache').mockReturnValue(pendingClear);

    let settled = false;
    const resultPromise = clearAppCaches().then((result) => {
      settled = true;
      return result;
    });

    // Wait until the dynamic import has reached the mocked IndexedDB action.
    await vi.waitFor(() => expect(clearSpy).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(settled).toBe(false);

    release(true);
    const result = await resultPromise;
    expect(result.ok).toBe(true);
  });
});
