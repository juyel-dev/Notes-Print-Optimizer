import { describe, it, expect } from 'vitest';
import { hasDarkFrame } from '../../lib/kernels/darkFrame';
import { selectPresetForPage } from '../../lib/optimizer/recipeSelector';
import { normalizeTemplateElements } from '../../lib/kernels/templateElements';
import type { PageProfile } from '../../lib/optimizer/types';

function canvas(w: number, h: number, bg: [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = 255;
  }
  return data;
}
function rect(data: Uint8ClampedArray, w: number, x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
  }
}

describe('dark frame detection', () => {
  it('is true for a dark slide with a big light panel in the middle', () => {
    const w = 400, h = 225, d = canvas(w, h, [0, 0, 0]);
    rect(d, w, 40, 30, 360, 200, [255, 255, 255]);
    expect(hasDarkFrame(d, w, h)).toBe(true);
  });

  it('is false for a light page', () => {
    const w = 400, h = 225, d = canvas(w, h, [250, 250, 250]);
    rect(d, w, 40, 30, 360, 60, [10, 10, 10]);
    expect(hasDarkFrame(d, w, h)).toBe(false);
  });

  it('forces the dark-slide preset even when the global dark ratio is low', () => {
    const profile = {
      classification: 'MIXED',
      foregroundPolarity: 'mixed',
      darkBackgroundRatio: 0.3,
      darkFrame: true,
    } as unknown as PageProfile;
    expect(selectPresetForPage(profile)).toBe('PW_DARK_SLIDE');
  });
});

describe('short capsule header', () => {
  it('is detected when the title is short (narrow capsule)', () => {
    const w = 800, h = 450, d = canvas(w, h, [0, 0, 0]);
    const mask = new Uint8Array(w * h);
    // Capsule: green body from x=60..260 (about 25% of page width), rounded ends.
    for (let y = 30; y <= 80; y++) {
      const cap = y < 34 || y > 76;
      rect(d, w, 60, y, cap ? 250 : 262, y + 1, [46, 139, 71]);
    }
    // White title letters inside.
    rect(d, w, 110, 48, 200, 62, [250, 250, 250]);
    for (let i = 0; i < w * h; i++) {
      const lum = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      mask[i] = lum >= 70 ? 1 : 0;
    }
    const stats = normalizeTemplateElements(d, mask, w, h);
    expect(stats.headerDetected).toBe(true);
    expect(mask[40 * w + 80]).toBe(0);   // green fill removed
    expect(mask[55 * w + 150]).toBe(1);  // title letters kept
  });
});
