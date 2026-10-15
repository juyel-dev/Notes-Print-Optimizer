/**
 * livePreview — enhances ONE page from its in-memory original so slider changes
 * show up instantly, without re-rendering the whole PDF. Output is a small JPEG
 * data URL (≈1000 px wide). The real export is still produced by Apply.
 */

import { enhanceImageData } from './enhanceKernels';
import type { EnhanceSettings } from './types';

export async function renderEnhancedPreview(originalDataUrl: string, settings: EnhanceSettings): Promise<string> {
  const img = new Image();
  img.src = originalDataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(img, 0, 0);
  const enhanced = enhanceImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), settings);
  ctx.putImageData(enhanced, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}
