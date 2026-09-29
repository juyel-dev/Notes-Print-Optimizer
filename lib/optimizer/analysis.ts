/**
 * analyzeImageData - Page profile analyzer.
 *
 * Production optimizations:
 *  - Welford's online algorithm for variance (eliminates Float64Array allocation)
 *  - Adaptive sampling stride based on page dimensions
 *  - Deterministic color, edge, noise and stroke estimates from the same sample grid
 *  - Conservative classification ordering so recipe behavior stays stable while
 *    the profile becomes more informative.
 */
import type { PageProfile, PageClassification } from './types';
import { getLuminance } from '../kernels';
import { detectBanners } from '../kernels';
import { DARK_BG_RATIO_THRESHOLD } from '../kernels/constants';

const HUE_BIN_COUNT = 18;
const HUE_BIN_SIZE = 360 / HUE_BIN_COUNT;

function rgbToHueSat(r: number, g: number, b: number): { hue: number; saturation: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0 || max === 0) return { hue: 0, saturation: 0 };

  let hue = 0;
  if (max === r) hue = ((g - b) * 60 / delta + 360) % 360;
  else if (max === g) hue = (b - r) * 60 / delta + 120;
  else hue = (r - g) * 60 / delta + 240;

  return {
    hue,
    saturation: (delta / max) * 255,
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function analyzeImageData(imageData: ImageData, pageIndex: number): PageProfile {
  const { width, height, data } = imageData;
  const totalPixels = width * height;

  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / 100000)));

  // Welford's online algorithm + color histogram on the same sample grid.
  let count = 0;
  let mean = 0;
  let m2 = 0;
  let darkPixelCount = 0;
  let lightPixelCount = 0;
  let saturatedPixelCount = 0;
  const hueHistogram = new Float64Array(HUE_BIN_COUNT);

  for (let y = 0; y < height; y += step) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += step) {
      const idx = rowOffset + x * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const lum = getLuminance(r, g, b);

      count++;
      const delta = lum - mean;
      mean += delta / count;
      const delta2 = lum - mean;
      m2 += delta * delta2;

      if (lum < 60) darkPixelCount++;
      else if (lum > 200) lightPixelCount++;

      const { hue, saturation } = rgbToHueSat(r, g, b);
      if (saturation >= 45) {
        saturatedPixelCount++;
        const bin = Math.min(HUE_BIN_COUNT - 1, Math.floor(hue / HUE_BIN_SIZE));
        hueHistogram[bin] += saturation / 255;
      }
    }
  }

  const avgBrightness = mean;
  const contrast = count > 1 ? Math.sqrt(m2 / count) : 0;
  const darkBgRatio = darkPixelCount / Math.max(count, 1);
  const lightBgRatio = lightPixelCount / Math.max(count, 1);
  const inkDensity = 1 - lightBgRatio;
  const colorfulPixelRatio = saturatedPixelCount / Math.max(count, 1);

  let dominantHue = 0;
  let dominantHueWeight = 0;
  for (let i = 0; i < HUE_BIN_COUNT; i++) {
    if (hueHistogram[i] > dominantHueWeight) {
      dominantHueWeight = hueHistogram[i];
      dominantHue = i * HUE_BIN_SIZE + HUE_BIN_SIZE / 2;
    }
  }

  /*
   * Second pass on the same sampled grid:
   * - edgeDensity: how much local structure is present
   * - isolatedForegroundRatio: sparse one-off foreground samples, a cheap
   *   proxy for scan noise / dust / isolated dots
   * - meanForegroundNeighbors: local thickness proxy for strokes/lines
   */
  const isDarkSource =
    darkBgRatio > DARK_BG_RATIO_THRESHOLD ||
    avgBrightness < 120;
  const foregroundThreshold = isDarkSource
    ? Math.min(245, Math.max(145, avgBrightness + 24))
    : Math.max(60, Math.min(185, avgBrightness - 24));

  let edgeComparisons = 0;
  let edgeCount = 0;
  let foregroundSamples = 0;
  let isolatedForeground = 0;
  let neighborSum = 0;

  const sampleForeground = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const idx = (y * width + x) * 4;
    const lum = getLuminance(data[idx], data[idx + 1], data[idx + 2]);
    return isDarkSource ? lum >= foregroundThreshold : lum <= foregroundThreshold;
  };

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const lum = getLuminance(data[idx], data[idx + 1], data[idx + 2]);

      if (x + step < width) {
        const rightIdx = (y * width + x + step) * 4;
        const rightLum = getLuminance(data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]);
        edgeComparisons++;
        if (Math.abs(lum - rightLum) >= 22) edgeCount++;
      }
      if (y + step < height) {
        const downIdx = ((y + step) * width + x) * 4;
        const downLum = getLuminance(data[downIdx], data[downIdx + 1], data[downIdx + 2]);
        edgeComparisons++;
        if (Math.abs(lum - downLum) >= 22) edgeCount++;
      }

      if (sampleForeground(x, y)) {
        foregroundSamples++;
        const left = sampleForeground(x - step, y);
        const right = sampleForeground(x + step, y);
        const up = sampleForeground(x, y - step);
        const down = sampleForeground(x, y + step);
        const neighbors = Number(left) + Number(right) + Number(up) + Number(down);
        neighborSum += neighbors;
        if (neighbors <= 1) isolatedForeground++;
      }
    }
  }

  const edgeDensity = edgeComparisons > 0 ? edgeCount / edgeComparisons : 0;
  const isolatedForegroundRatio = foregroundSamples > 0
    ? isolatedForeground / foregroundSamples
    : 0;
  const averageForegroundNeighbors = foregroundSamples > 0
    ? neighborSum / foregroundSamples
    : 0;

  /*
   * Keep the existing dark/diagram/light behavior ahead of the new
   * screenshot/mixed heuristics. Screenshot classification is mainly intended
   * to distinguish non-dark, non-diagram raster pages from clean lecture pages;
   * recipeSelector currently maps it to the restrained light recipe.
   */
  const screenshotHeavy =
    !isDarkSource &&
    contrast <= 65 &&
    edgeDensity >= 0.16 &&
    (colorfulPixelRatio >= 0.025 || contrast >= 35) &&
    inkDensity < 0.85;

  const balancedMixedPage =
    lightBgRatio >= 0.35 &&
    lightBgRatio <= 0.65 &&
    contrast >= 20 &&
    inkDensity >= 0.25;

  let classification: PageClassification;
  if (darkBgRatio > DARK_BG_RATIO_THRESHOLD) {
    classification = 'DARK_SLIDE';
  } else if (contrast > 65) {
    classification = 'DIAGRAM_EQUATION';
  } else if (screenshotHeavy) {
    classification = 'SCREENSHOT_HEAVY';
  } else if (darkBgRatio < 0.15 && lightBgRatio > 0.65) {
    classification = 'LIGHT_SLIDE';
  } else if (
    balancedMixedPage ||
    (inkDensity > 0.35 && (colorfulPixelRatio > 0.08 || edgeDensity > 0.20))
  ) {
    classification = 'MIXED';
  } else if (
    inkDensity > 0.35 &&
    colorfulPixelRatio < 0.08 &&
    isolatedForegroundRatio < 0.45 &&
    edgeDensity < 0.20
  ) {
    classification = 'HANDWRITTEN_NOTES';
  } else {
    classification = 'MIXED';
  }

  const strokeThickness = foregroundSamples === 0
    ? 1
    : Math.min(4, Math.max(1, 1 + averageForegroundNeighbors * 0.65));

  /*
   * Isolated foreground is intentionally the primary noise signal. A dense
   * handwritten line should not be called "noise" simply because it has many
   * edges; isolated dots, dust, and scan speckle are what the denoiser needs.
   */
  const estimatedNoise = Math.round(
    Math.min(100, isolatedForegroundRatio * 100),
  );

  const { topBannerPct, bottomBannerPct } = detectBanners(data, width, height);

  return {
    pageIndex,
    width,
    height,
    averageBrightness: Math.round(avgBrightness),
    contrast: Math.round(contrast),
    inkDensity: Number(clamp01(inkDensity).toFixed(3)),
    darkBackgroundRatio: Number(clamp01(darkBgRatio).toFixed(3)),
    lightBackgroundRatio: Number(clamp01(lightBgRatio).toFixed(3)),
    dominantHue: Math.round(dominantHue),
    hasTopBanner: topBannerPct > 0.03,
    topBannerHeightPct: Number(topBannerPct.toFixed(3)),
    hasBottomBanner: bottomBannerPct > 0.03,
    bottomBannerHeightPct: Number(bottomBannerPct.toFixed(3)),
    estimatedNoise,
    strokeThickness: Number(strokeThickness.toFixed(2)),
    classification,
  };
}
