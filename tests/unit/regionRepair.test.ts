import { describe, it, expect } from 'vitest';
import { processPage } from '../../lib/kernels/processPage';
import { resolveEffectiveInvertMode, isDarkSourcePage } from '../../lib/optimizer/engine/v2/resolveInvertMode';

type RGB = [number, number, number];

function makePage(w: number, h: number, bg: RGB): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = bg[0]; d[i * 4 + 1] = bg[1]; d[i * 4 + 2] = bg[2]; d[i * 4 + 3] = 255;
  }
  return d;
}

function rect(d: Uint8ClampedArray, w: number, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
  }
}

const W = 640;
const H = 360;
const DARK_PROFILE = { classification: 'DIAGRAM_EQUATION', darkBackgroundRatio: 0.6, darkFrame: true };
const SMART = {
  invertMode: 'smart' as const,
  bannerCropTopPct: 0,
  bannerCropBottomPct: 0,
  sharpenAmount: 0,
  dilationKernelSize: 0,
  denoiseAmount: 0,
};
const px = (out: Uint8ClampedArray, x: number, y: number): number => out[(y * W + x) * 4];

describe('dark-source polarity (resolveEffectiveInvertMode)', () => {
  it('keeps smart for a dark slide mislabelled DIAGRAM_EQUATION (dark frame)', () => {
    expect(resolveEffectiveInvertMode('smart', 'DIAGRAM_EQUATION', { darkFrame: true })).toBe('smart');
  });

  it('keeps smart for a light-on-dark page with a dark majority', () => {
    expect(
      resolveEffectiveInvertMode('smart', 'DIAGRAM_EQUATION', {
        darkBackgroundRatio: 0.58,
        foregroundPolarity: 'light-on-dark',
      }),
    ).toBe('smart');
  });

  it('still downgrades a genuinely light page (white-page guard)', () => {
    expect(
      resolveEffectiveInvertMode('smart', 'DIAGRAM_EQUATION', {
        darkBackgroundRatio: 0.2,
        foregroundPolarity: 'dark-on-light',
        darkFrame: false,
      }),
    ).toBe('none');
    expect(resolveEffectiveInvertMode('smart', 'MIXED', undefined)).toBe('none');
  });

  it('a dark ratio without light-on-dark polarity is not enough', () => {
    expect(isDarkSourcePage('MIXED', { darkBackgroundRatio: 0.7, foregroundPolarity: 'mixed' })).toBe(false);
  });
});

describe('region repair on dark-source pages', () => {
  it('turns a light text panel into dark text on white paper (not a black slab)', () => {
    const d = makePage(W, H, [14, 14, 14]);
    rect(d, W, 40, 60, 400, 300, [250, 250, 250]); // paper
    for (let k = 0; k < 6; k++) rect(d, W, 60, 80 + k * 30, 340, 86 + k * 30, [20, 20, 20]); // text rows
    const out = new Uint8ClampedArray(processPage(d, W, H, SMART, DARK_PROFILE).buffer);
    expect(px(out, 200, 100)).toBe(255); // paper between rows -> white
    expect(px(out, 200, 83)).toBe(0); // text row -> black
    expect(px(out, 500, 200)).toBe(255); // dark board outside -> white
  });

  it('respects autoWhiteBoxFix=false (legacy: panel inverts)', () => {
    const d = makePage(W, H, [14, 14, 14]);
    rect(d, W, 40, 60, 400, 300, [250, 250, 250]);
    rect(d, W, 60, 80, 340, 86, [20, 20, 20]);
    const out = new Uint8ClampedArray(
      processPage(d, W, H, { ...SMART, autoWhiteBoxFix: false }, DARK_PROFILE).buffer,
    );
    expect(px(out, 200, 150)).toBe(0); // paper printed as ink, as before
  });

  it('hollows a coloured title band but keeps the title text and an outline', () => {
    const d = makePage(W, H, [14, 14, 14]);
    rect(d, W, 0, 20, W, 72, [200, 90, 20]); // orange band
    rect(d, W, 40, 36, 220, 56, [255, 255, 255]); // white title on it
    const out = new Uint8ClampedArray(processPage(d, W, H, SMART, DARK_PROFILE).buffer);
    expect(px(out, 400, 46)).toBe(255); // band fill is gone
    expect(px(out, 100, 46)).toBe(0); // title text is ink
    expect(px(out, 400, 20)).toBe(0); // outline rim kept
  });

  it('does not erase tiny solid coloured blobs in the notes column as number markers', () => {
    const d = makePage(W, H, [14, 14, 14]);
    rect(d, W, 30, 200, 39, 209, [64, 128, 160]); // 9x9 steel-blue handwriting dot
    rect(d, W, 31, 201, 32, 202, [240, 240, 240]); // one bright anti-alias pixel
    const out = new Uint8ClampedArray(processPage(d, W, H, SMART, DARK_PROFILE).buffer);
    expect(px(out, 35, 205)).toBe(0);
  });

  it('is a no-op on a pure chalkboard slide (no panels / fills)', () => {
    const d = makePage(W, H, [10, 10, 10]);
    rect(d, W, 100, 100, 300, 104, [240, 240, 240]); // thin white stroke
    const on = new Uint8ClampedArray(processPage(d, W, H, SMART, DARK_PROFILE).buffer);
    const off = new Uint8ClampedArray(
      processPage(d, W, H, { ...SMART, autoWhiteBoxFix: false }, DARK_PROFILE).buffer,
    );
    expect(Buffer.from(on).equals(Buffer.from(off))).toBe(true);
  });
});

describe('light page stays tonal under smartColorMapping', () => {
  const LIGHT = { classification: 'DIAGRAM_EQUATION', darkBackgroundRatio: 0.1, darkFrame: false };
  const params = {
    invertMode: 'none' as const,
    bannerCropTopPct: 0,
    bannerCropBottomPct: 0,
    sharpenAmount: 0,
    smartColorMapping: true,
    denoiseAmount: 0,
  };

  it('keeps anti-aliased grey text instead of dropping it (lum > 70)', () => {
    const d = makePage(W, H, [255, 255, 255]);
    rect(d, W, 100, 100, 300, 108, [120, 120, 120]);
    const out = new Uint8ClampedArray(processPage(d, W, H, params, LIGHT).buffer);
    expect(px(out, 200, 104)).toBe(120); // not hard-thresholded to 255/0
  });

  it('darkens vivid pen ink so teacher marks survive a mono printer', () => {
    const d = makePage(W, H, [255, 255, 255]);
    rect(d, W, 100, 100, 140, 108, [230, 40, 120]); // magenta tick
    const out = new Uint8ClampedArray(processPage(d, W, H, params, LIGHT).buffer);
    expect(px(out, 120, 104)).toBeLessThan(90);
  });
});
