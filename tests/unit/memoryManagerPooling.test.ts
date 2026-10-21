import { describe, expect, it, vi } from 'vitest';
import { memoryManager } from '../../lib/optimizer/memoryManager';

function fakeCanvas(willReadFrequently: boolean | undefined) {
  const ctx = {
    clearRect: vi.fn(),
    getContextAttributes: willReadFrequently === undefined ? undefined : () => ({ willReadFrequently }),
  };
  const canvas = { width: 64, height: 64, getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
  return { canvas, ctx };
}

describe('memoryManager.releaseCanvas pooling', () => {
  it('pools a CPU-backed (willReadFrequently) canvas and clears it', () => {
    const { canvas, ctx } = fakeCanvas(true);
    memoryManager.releaseCanvas(canvas);
    expect(ctx.clearRect).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(64); // kept for reuse
    expect(memoryManager.acquireCanvas(64, 64)).toBe(canvas); // and handed back out
  });

  it('does NOT pool a canvas that already holds a GPU-backed context', () => {
    const { canvas, ctx } = fakeCanvas(false);
    memoryManager.releaseCanvas(canvas);
    expect(ctx.clearRect).not.toHaveBeenCalled();
    expect(canvas.width).toBe(0); // released, not pooled
    expect(canvas.height).toBe(0);
  });

  it('still pools when the browser cannot report context attributes', () => {
    const { canvas } = fakeCanvas(undefined);
    memoryManager.releaseCanvas(canvas);
    expect(canvas.width).toBe(64);
    expect(memoryManager.acquireCanvas(64, 64)).toBe(canvas);
  });
});
