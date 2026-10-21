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
import type { PageProfile } from './types';
import { getLuminance, detectBanners } from '../kernels';
import { hasDarkFrame } from '../kernels/darkFrame';
import { HUE_BIN_COUNT, HUE_BIN_SIZE, clamp01, rgbToHueSat } from './profile/color';
import { buildLocalPolarityMap, inferForegroundPolarity } from './profile/polarity';
import {
  createForegroundSampler,
  measureForegroundGeometry,
  measureForegroundStructure,
} from './profile/foreground';
import { classifyDensity, classifyPage } from './profile/classify';

/** Pass 1 over the sampled grid: luminance statistics + colour histogram. */
function measureColorStats(width: number, height: number, data: Uint8ClampedArray, step: number) {
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

  return {
    avgBrightness,
    contrast,
    darkBgRatio,
    lightBgRatio,
    inkDensity,
    colorfulPixelRatio,
    dominantHue,
  };
}

/** Fraction of neighbouring sample pairs whose luminance differs sharply. */
function measureEdgeDensity(width: number, height: number, data: Uint8ClampedArray, step: number): number {
  let edgeComparisons = 0;
  let edgeCount = 0;

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
    }
  }

  const edgeDensity = edgeComparisons > 0 ? edgeCount / edgeComparisons : 0;

  return edgeDensity;
}

export function analyzeImageData(imageData: ImageData, pageIndex: number): PageProfile {
  const { width, height, data } = imageData;
  const totalPixels = width * height;

  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / 100000)));

  const {
    avgBrightness,
    contrast,
    darkBgRatio,
    lightBgRatio,
    inkDensity,
    colorfulPixelRatio,
    dominantHue,
  } = measureColorStats(width, height, data, step);

  /*
   * Second pass on the same sampled grid:
   * - edgeDensity: how much local structure is present
   * - foreground geometry: polarity-aware content coverage + bbox
   * - isolated foreground: retained as a legacy metric only; it is NOT treated
   *   as scan noise by the density classifier.
   */
  const pagePolarity = inferForegroundPolarity(
    darkBgRatio,
    lightBgRatio,
    avgBrightness,
  );
  const isDarkSource = pagePolarity.polarity === 'light-on-dark';
  const localPolarityMap = buildLocalPolarityMap(
    width,
    height,
    step,
    data,
    pagePolarity.polarity,
  );

  const edgeDensity = measureEdgeDensity(width, height, data, step);
  const foregroundGeometry = measureForegroundGeometry(
    width,
    height,
    step,
    data,
    localPolarityMap,
  );
  const {
    coverage: foregroundCoverage,
    bbox: contentBoundingBox,
    margins,
    sparseContent,
    foregroundSamples,
    isolatedForegroundRatio,
    averageForegroundNeighbors,
  } = foregroundGeometry;

  const foregroundStructure = measureForegroundStructure(
    width,
    height,
    step,
    createForegroundSampler(width, height, data, localPolarityMap),
    foregroundGeometry.foregroundSamples,
    edgeDensity,
    contrast,
    colorfulPixelRatio,
    Math.min(4, Math.max(1, 1 + foregroundGeometry.averageForegroundNeighbors * 0.65)),
  );

  const classification = classifyPage({
    colorfulPixelRatio,
    edgeDensity,
    foregroundStructure,
    isDarkSource,
    contrast,
    inkDensity,
    pagePolarity,
    foregroundCoverage,
    darkBgRatio,
    lightBgRatio,
    isolatedForegroundRatio,
  });

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

  const density = classifyDensity(foregroundCoverage, edgeDensity);
  const coloredAnnotationPresent = colorfulPixelRatio >= 0.005 && foregroundSamples > 0;
  const thinStrokeRisk =
    foregroundSamples > 0 &&
    (
      strokeThickness <= 2.4 ||
      foregroundCoverage <= 0.03
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
    darkFrame: hasDarkFrame(data, width, height),
    lightBackgroundRatio: Number(clamp01(lightBgRatio).toFixed(3)),
    dominantHue: Math.round(dominantHue),
    hasTopBanner: topBannerPct > 0.03,
    topBannerHeightPct: Number(topBannerPct.toFixed(3)),
    hasBottomBanner: bottomBannerPct > 0.03,
    bottomBannerHeightPct: Number(bottomBannerPct.toFixed(3)),
    estimatedNoise,
    strokeThickness: Number(strokeThickness.toFixed(2)),
    edgeDensity: Number(edgeDensity.toFixed(4)),
    colorfulPixelRatio: Number(colorfulPixelRatio.toFixed(4)),
    foregroundPolarity: pagePolarity.polarity,
    polarityConfidence: pagePolarity.confidence,
    foregroundCoverage,
    contentBoundingBox,
    margins,
    sparseContent,
    coloredAnnotationPresent,
    thinStrokeRisk,
    density,
    longLineDensity: foregroundStructure.longLineDensity,
    diagramEquationScore: foregroundStructure.diagramEquationScore,
    classification,
  };
}
