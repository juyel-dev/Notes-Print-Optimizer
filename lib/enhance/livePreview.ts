/**
 * livePreview — enhances ONE page from its in-memory original so slider changes
 * show up quickly, without re-rendering the whole PDF. The real export is still
 * produced by Apply. Preview encode is async (toBlob) and can be aborted while
 * the source is decoding or the encoded data is being read.
 */

import { enhanceImageData } from './enhanceKernels';
import type { EnhanceSettings } from './types';

export async function renderEnhancedPreview(
  originalDataUrl: string,
  settings: EnhanceSettings,
  signal?: AbortSignal,
): Promise<string> {
  const img = new Image();
  let canvas: HTMLCanvasElement | null = null;
  try {
    img.src = originalDataUrl;
    await img.decode();
    if (signal?.aborted) throw new Error('Preview cancelled.');

    canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0);

    // This per-pixel kernel remains synchronous; the cancel guard prevents
    // stale jobs from starting after decode, but cannot interrupt a kernel
    // already running on the main thread.
    const enhanced = enhanceImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), settings);
    if (signal?.aborted) throw new Error('Preview cancelled.');
    ctx.putImageData(enhanced, 0, 0);

    return await new Promise<string>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Preview cancelled.'));
        return;
      }
      const reader = new FileReader();
      const cleanup = () => signal?.removeEventListener('abort', handleAbort);
      const handleAbort = () => {
        try { reader.abort(); } catch { /* reader may not have started */ }
        cleanup();
        reject(new Error('Preview cancelled.'));
      };
      signal?.addEventListener('abort', handleAbort, { once: true });
      reader.onload = () => {
        cleanup();
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Failed to encode live preview.'));
      };
      reader.onerror = () => {
        cleanup();
        reject(new Error('Failed to encode live preview.'));
      };
      reader.onabort = () => {
        cleanup();
        reject(new Error('Preview cancelled.'));
      };
      canvas!.toBlob((blob) => {
        if (signal?.aborted) {
          handleAbort();
          return;
        }
        if (!blob || blob.size === 0) {
          cleanup();
          reject(new Error('Failed to encode live preview.'));
          return;
        }
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.85);
    });
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    img.src = '';
  }
}
