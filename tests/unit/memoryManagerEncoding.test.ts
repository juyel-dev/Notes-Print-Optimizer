import { describe, expect, it, vi } from 'vitest';
import { memoryManager } from '../../lib/optimizer/memoryManager';

describe('memoryManager.imageDataToBlob', () => {
  it('rejects when JPEG encoding returns null and releases the canvas', async () => {
    const context = { putImageData: vi.fn() } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 1,
      height: 1,
      getContext: vi.fn(() => context),
      toBlob: (callback: BlobCallback) => callback(null),
    } as unknown as HTMLCanvasElement;
    const acquire = vi.spyOn(memoryManager, 'acquireCanvas').mockReturnValue(canvas);
    const release = vi.spyOn(memoryManager, 'releaseCanvas').mockImplementation(() => {});

    try {
      const image = new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1);
      await expect(memoryManager.imageDataToBlob(image)).rejects.toThrow(
        'Could not encode the processed page as JPEG.',
      );
      expect(release).toHaveBeenCalledWith(canvas);
    } finally {
      acquire.mockRestore();
      release.mockRestore();
    }
  });

  it('rejects after a timeout — and releases the canvas — when toBlob never calls back', async () => {
    vi.useFakeTimers();
    try {
      const context = { putImageData: vi.fn() } as unknown as CanvasRenderingContext2D;
      const canvas = {
        width: 1,
        height: 1,
        getContext: vi.fn(() => context),
        toBlob: vi.fn(() => {}),
      } as unknown as HTMLCanvasElement;
      const acquire = vi.spyOn(memoryManager, 'acquireCanvas').mockReturnValue(canvas);
      const release = vi.spyOn(memoryManager, 'releaseCanvas').mockImplementation(() => {});

      try {
        const image = new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1);
        const pending = memoryManager.imageDataToBlob(image);
        const assertion = expect(pending).rejects.toThrow('Timed out while encoding');
        await vi.advanceTimersByTimeAsync(30_000);
        await assertion;
        expect(release).toHaveBeenCalledWith(canvas);
      } finally {
        acquire.mockRestore();
        release.mockRestore();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
