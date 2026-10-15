import { describe, expect, it } from 'vitest';
import { enhanceImageData, normalizeLighting } from '@/lib/enhance/enhanceKernels';
import { DEFAULT_ENHANCE_SETTINGS, ENHANCE_PRESETS, matchPreset, sameTone, type EnhanceSettings } from '@/lib/enhance/types';
import { MAX_RENDER_PIXELS, planRender, previewSize } from '@/lib/enhance/renderPlan';
import { friendlyPdfError } from '@/lib/enhance/enhanceProcessor';

const W = 240;
const H = 240;

/** Paper that fades from bright (left) to a heavy shadow (right), with a few dark ink dots. */
function shadowedPage(): ImageData {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const paper = Math.round(240 - (x / (W - 1)) * 110); // 240 → 130
      const o = (y * W + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = paper;
      d[o + 3] = 255;
    }
  }
  return new ImageData(d, W, H);
}

const lumaAt = (img: ImageData, x: number, y: number) => img.data[(y * W + x) * 4];

describe('normalizeLighting', () => {
  it('lifts shadowed paper to match the bright side (shadow gradient flattens)', () => {
    const page = shadowedPage();
    const copy = new Uint8ClampedArray(page.data);
    expect(normalizeLighting(copy, W, H)).toBe(true);
    const lit = new ImageData(copy, W, H);
    const before = lumaAt(page, 10, 120) - lumaAt(page, W - 10, 120);
    const after = lumaAt(lit, 10, 120) - lumaAt(lit, W - 10, 120);
    expect(before).toBeGreaterThan(90);
    expect(Math.abs(after)).toBeLessThan(25);
  });

  it('is a no-op on already white paper', () => {
    const d = new Uint8ClampedArray(W * H * 4).fill(255);
    const before = Array.from(d);
    expect(normalizeLighting(d, W, H)).toBe(false);
    expect(Array.from(d)).toEqual(before);
  });

  it('skips tiny images and never exceeds 255', () => {
    expect(normalizeLighting(new Uint8ClampedArray(16 * 16 * 4), 16, 16)).toBe(false);
    const page = shadowedPage();
    const copy = new Uint8ClampedArray(page.data);
    normalizeLighting(copy, W, H);
    expect(Math.max(...Array.from(copy))).toBeLessThanOrEqual(255);
  });

  it('is deterministic through the full pipeline and whitens the shadow with cleanBackground', () => {
    const s: EnhanceSettings = { ...DEFAULT_ENHANCE_SETTINGS, sharpen: 0 };
    const a = enhanceImageData(shadowedPage(), s);
    const b = enhanceImageData(shadowedPage(), s);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(lumaAt(a, W - 10, 120)).toBe(255);
    const noLight = enhanceImageData(shadowedPage(), { ...s, evenLighting: false });
    expect(lumaAt(noLight, W - 10, 120)).toBeLessThan(255); // without the pass the shadow survives
  });

  it('does not mutate its input', () => {
    const page = shadowedPage();
    const snap = Array.from(page.data);
    enhanceImageData(page, DEFAULT_ENHANCE_SETTINGS);
    expect(Array.from(page.data)).toEqual(snap);
  });
});

describe('presets', () => {
  it('every preset round-trips through matchPreset and keeps the detail level', () => {
    for (const p of ENHANCE_PRESETS) {
      const s: EnhanceSettings = { ...p.settings, detail: 'ultra' };
      expect(matchPreset(s)?.id).toBe(p.id);
    }
  });
  it('a custom mix matches no preset; sameTone ignores detail', () => {
    expect(matchPreset({ ...DEFAULT_ENHANCE_SETTINGS, darken: 51 })).toBeNull();
    expect(sameTone(DEFAULT_ENHANCE_SETTINGS, { ...DEFAULT_ENHANCE_SETTINGS, detail: 'ultra' })).toBe(true);
  });
  it('the default settings are the Balanced preset', () => {
    expect(matchPreset(DEFAULT_ENHANCE_SETTINGS)?.id).toBe('balanced');
  });
});

describe('planRender', () => {
  it('A4 at 120 DPI keeps the source page size in points', () => {
    const p = planRender(595.28, 841.89, 120);
    expect(p.capped).toBe(false);
    expect(p.width).toBe(Math.floor(595.28 * (120 / 72)));
    expect(p.pdfWidth).toBeCloseTo(595.28, 1);
    expect(p.pdfHeight).toBeCloseTo(841.89, 1);
  });
  it('caps huge pages so memory stays bounded', () => {
    const p = planRender(3000, 4000, 200); // poster-sized
    expect(p.capped).toBe(true);
    expect(p.width * p.height).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
  });
  it('previewSize only shrinks', () => {
    expect(previewSize(800, 1100)).toEqual({ width: 800, height: 1100 });
    expect(previewSize(2000, 3000)).toEqual({ width: 1000, height: 1500 });
  });
});

describe('friendlyPdfError', () => {
  it('explains password-protected and damaged files by name', () => {
    expect(friendlyPdfError({ name: 'PasswordException' }, 'a.pdf').message).toMatch(/"a\.pdf" is password-protected/);
    expect(friendlyPdfError({ name: 'InvalidPDFException' }, 'b.pdf').message).toMatch(/"b\.pdf" looks damaged/);
    expect(friendlyPdfError('???', 'c.pdf').message).toMatch(/Could not open "c\.pdf"/);
  });
});
