import { describe, it, expect } from 'vitest';
import {
  assessPreservation,
  softenProcessingParameters,
} from '../../lib/kernels/preservationGuard';
import { processPageWithWhiteBoxHeal } from '../../lib/kernels/whiteBox';

function rgbaPage(w: number, h: number, fill: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill;
    data[i + 1] = fill;
    data[i + 2] = fill;
    data[i + 3] = 255;
  }
  return data;
}

function drawRect(
  data: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  lum: number,
): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      data[i] = lum;
      data[i + 1] = lum;
      data[i + 2] = lum;
    }
  }
}

describe('preservation guard', () => {
  it('accepts a polarity-preserving light page', () => {
    const w = 160, h = 120;
    const source = rgbaPage(w, h, 255);
    drawRect(source, w, 30, 25, 130, 28, 90);
    drawRect(source, w, 78, 25, 81, 95, 90);

    const assessment = assessPreservation(
      source,
      w,
      h,
      source,
      w,
      h,
      { classification: 'LIGHT_SLIDE', darkBackgroundRatio: 0.02 },
    );

    expect(assessment.likelyDamaged).toBe(false);
    expect(assessment.edgeRatio).toBeGreaterThan(0.8);
  });

  it('flags catastrophic foreground loss', () => {
    const w = 160, h = 120;
    const source = rgbaPage(w, h, 255);
    const processed = rgbaPage(w, h, 255);
    drawRect(source, w, 30, 25, 130, 28, 90);
    drawRect(source, w, 78, 25, 81, 95, 90);

    const assessment = assessPreservation(
      source,
      w,
      h,
      processed,
      w,
      h,
      { classification: 'LIGHT_SLIDE', darkBackgroundRatio: 0.02 },
    );

    expect(assessment.likelyDamaged).toBe(true);
    expect(assessment.coverageRatio).toBe(0);
    expect(assessment.edgeRatio).toBe(0);
  });

  it('does not mistake persistent scan texture for preserved foreground structure', () => {
    const w = 160, h = 120;
    const source = rgbaPage(w, h, 225);
    const processed = rgbaPage(w, h, 225);

    // Fine paper/scan texture stays in the processed page, but the actual
    // dark content is completely removed. The guard must not count the
    // background texture as preserved content.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const texture = ((x * 13 + y * 17) % 4) * 7;
        const value = 204 + texture;
        const idx = (y * w + x) * 4;
        source[idx] = value;
        source[idx + 1] = value;
        source[idx + 2] = value;
        processed[idx] = value;
        processed[idx + 1] = value;
        processed[idx + 2] = value;
      }
    }

    drawRect(source, w, 24, 28, 136, 31, 70);
    drawRect(source, w, 78, 28, 81, 96, 70);

    const assessment = assessPreservation(
      source,
      w,
      h,
      processed,
      w,
      h,
      { classification: 'LIGHT_SLIDE', darkBackgroundRatio: 0.01 },
    );

    expect(assessment.coverageRatio).toBe(0);
    expect(assessment.edgeRatio).toBe(0);
    expect(assessment.likelyDamaged).toBe(true);
  });

  it('softens high-impact print controls without changing page polarity', () => {
    const params = {
      preset: 'LIGHT_HANDWRITTEN' as const,
      invertMode: 'none' as const,
      smartColorMapping: true,
      backgroundWhiteningThreshold: 200,
      contrastEnhancement: 40,
      sharpenAmount: 50,
      denoiseAmount: 30,
      bannerCropTopPct: 0,
      bannerCropBottomPct: 0,
      autoTrimMargins: false,
      binaizationThreshold: 120,
      outputQuality: 0.88,
      strokeEnhancement: 'strong' as const,
      dilationKernelSize: 5,
      autoWhiteBoxFix: true,
    };

    const softened = softenProcessingParameters(params);
    expect(softened.invertMode).toBe('none');
    expect(softened.binaizationThreshold).toBe(0);
    expect(softened.dilationKernelSize).toBe(3);
    expect(softened.contrastEnhancement).toBe(22);
    expect(softened.sharpenAmount).toBe(28);
    expect(softened.denoiseAmount).toBe(15);
  });

  it('automatically retries a destructive recipe and restores thin content', () => {
    const w = 160, h = 120;
    const source = rgbaPage(w, h, 255);
    /* Mid-gray handwriting that an intentionally low binarization threshold
       would erase from the first pass. */
    drawRect(source, w, 30, 25, 130, 28, 120);
    drawRect(source, w, 78, 25, 81, 95, 120);

    const healed = processPageWithWhiteBoxHeal(
      source,
      w,
      h,
      {
        invertMode: 'none',
        bannerCropTopPct: 0,
        bannerCropBottomPct: 0,
        sharpenAmount: 0,
        binaizationThreshold: 80,
        autoWhiteBoxFix: false,
      },
      { classification: 'LIGHT_SLIDE', darkBackgroundRatio: 0.02 },
    );

    expect(healed.preservationGuardTriggered).toBe(true);
    const out = new Uint8ClampedArray(healed.buffer);
    const probe = (26 * w + 35) * 4;
    expect(out[probe]).toBe(120);
  });
});
