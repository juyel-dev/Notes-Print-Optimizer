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
import type { PageDensity, PageProfile, PageClassification, RasterSource } from './types';
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

type ForegroundPolarity = 'light-on-dark' | 'dark-on-light' | 'mixed';

interface ForegroundGeometry {
  coverage: number;
  bbox?: { xMin: number; yMin: number; xMax: number; yMax: number };
  margins?: { top: number; right: number; bottom: number; left: number };
  sparseContent: boolean;
}

const MIXED_BACKGROUND_RATIO = 0.40;
const LOCAL_TILE_MIN = 16;
const LOCAL_TILE_TARGETS = 48;

function inferForegroundPolarity(
  darkBgRatio: number,
  lightBgRatio: number,
  avgBrightness: number,
): { polarity: ForegroundPolarity; confidence: number } {
  if (darkBgRatio >= MIXED_BACKGROUND_RATIO && lightBgRatio >= MIXED_BACKGROUND_RATIO) {
    return {
      polarity: 'mixed',
      confidence: Number(Math.abs(darkBgRatio - lightBgRatio).toFixed(3)),
    };
  }

  const darkSource =
    darkBgRatio > DARK_BG_RATIO_THRESHOLD ||
    avgBrightness < 120;

  return darkSource
    ? {
        polarity: 'light-on-dark',
        confidence: Number(clamp01(darkBgRatio).toFixed(3)),
      }
    : {
        polarity: 'dark-on-light',
        confidence: Number(clamp01(lightBgRatio).toFixed(3)),
      };
}

function classifyDensity(foregroundCoverage: number, edgeDensity: number): PageDensity {
  if (foregroundCoverage >= 0.15 || edgeDensity >= 0.25) return 'dense';
  if (foregroundCoverage <= 0.03 && edgeDensity <= 0.10) return 'sparse';
  return 'medium';
}

function buildLocalPolarityMap(
  width: number,
  height: number,
  step: number,
  data: Uint8ClampedArray,
  pagePolarity: ForegroundPolarity,
): {
  tileSize: number;
  cols: number;
  polarity: Int8Array;
  thresholds: Float64Array;
} {
  const tileSize = Math.max(
    LOCAL_TILE_MIN,
    Math.floor(Math.min(width, height) / LOCAL_TILE_TARGETS),
  );
  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  const tileCount = cols * rows;
  const sampleCounts = new Float64Array(tileCount);
  const darkCounts = new Float64Array(tileCount);
  const lightCounts = new Float64Array(tileCount);
  const luminanceSums = new Float64Array(tileCount);

  for (let y = 0; y < height; y += step) {
    const tileY = Math.floor(y / tileSize);
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const lum = getLuminance(data[idx], data[idx + 1], data[idx + 2]);
      const tileIndex = tileY * cols + Math.floor(x / tileSize);
      sampleCounts[tileIndex]++;
      luminanceSums[tileIndex] += lum;
      if (lum < 60) darkCounts[tileIndex]++;
      if (lum > 200) lightCounts[tileIndex]++;
    }
  }

  const polarity = new Int8Array(tileCount);
  const thresholds = new Float64Array(tileCount);

  for (let tileIndex = 0; tileIndex < tileCount; tileIndex++) {
    const count = sampleCounts[tileIndex];
    if (count === 0) continue;

    const darkRatio = darkCounts[tileIndex] / count;
    const lightRatio = lightCounts[tileIndex] / count;
    let tilePolarity: ForegroundPolarity | null = null;

    if (pagePolarity !== 'mixed') {
      tilePolarity = pagePolarity;
    } else if (darkRatio >= 0.60 && lightRatio <= 0.30) {
      tilePolarity = 'light-on-dark';
    } else if (lightRatio >= 0.60 && darkRatio <= 0.30) {
      tilePolarity = 'dark-on-light';
    } else if (darkRatio - lightRatio >= 0.25) {
      tilePolarity = 'light-on-dark';
    } else if (lightRatio - darkRatio >= 0.25) {
      tilePolarity = 'dark-on-light';
    }

    if (!tilePolarity) continue;

    const mean = luminanceSums[tileIndex] / count;
    polarity[tileIndex] = tilePolarity === 'light-on-dark' ? 1 : -1;
    thresholds[tileIndex] = tilePolarity === 'light-on-dark'
      ? Math.min(245, Math.max(145, mean + 24))
      : Math.max(60, Math.min(185, mean - 24));
  }

  return { tileSize, cols, polarity, thresholds };
}

function createForegroundSampler(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  localMap: ReturnType<typeof buildLocalPolarityMap>,
): (x: number, y: number) => boolean {
  return (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;

    const tileIndex =
      Math.floor(y / localMap.tileSize) * localMap.cols +
      Math.floor(x / localMap.tileSize);
    const tilePolarity = localMap.polarity[tileIndex];
    if (tilePolarity === 0) return false;

    const idx = (y * width + x) * 4;
    const lum = getLuminance(data[idx], data[idx + 1], data[idx + 2]);
    return tilePolarity === 1
      ? lum >= localMap.thresholds[tileIndex]
      : lum <= localMap.thresholds[tileIndex];
  };
}

interface ForegroundStructure {
  longLineDensity: number;
  diagramEquationScore: number;
}

function measureForegroundStructure(
  width: number,
  height: number,
  step: number,
  sampleForeground: (x: number, y: number) => boolean,
  foregroundSamples: number,
  edgeDensity: number,
  contrast: number,
  colorfulPixelRatio: number,
  strokeThickness: number,
): ForegroundStructure {
  const minRun = 4;
  let horizontalLongSamples = 0;
  let verticalLongSamples = 0;

  for (let y = 0; y < height; y += step) {
    let run = 0;
    for (let x = 0; x <= width; x += step) {
      const foreground = x < width && sampleForeground(x, y);
      if (foreground) {
        run++;
      } else if (run >= minRun) {
        horizontalLongSamples += run;
        run = 0;
      } else {
        run = 0;
      }
    }
  }

  for (let x = 0; x < width; x += step) {
    let run = 0;
    for (let y = 0; y <= height; y += step) {
      const foreground = y < height && sampleForeground(x, y);
      if (foreground) {
        run++;
      } else if (run >= minRun) {
        verticalLongSamples += run;
        run = 0;
      } else {
        run = 0;
      }
    }
  }

  const longLineSamples = Math.min(
    Math.ceil(width / step) * Math.ceil(height / step),
    Math.max(horizontalLongSamples, verticalLongSamples),
  );
  const totalSamples = Math.ceil(width / step) * Math.ceil(height / step);
  const longLineDensity = totalSamples > 0
    ? Number((longLineSamples / totalSamples).toFixed(4))
    : 0;

  const edgeSignal = clamp01(edgeDensity / 0.08);
  const lineSignal = clamp01(longLineDensity / 0.06);
  const thinStrokeSignal = clamp01((2.8 - strokeThickness) / 1.4);
  const contrastSignal = clamp01((contrast - 25) / 45);

  let score =
    lineSignal * 0.45 +
    edgeSignal * 0.30 +
    thinStrokeSignal * 0.15 +
    contrastSignal * 0.10;

  /* Photographic/decorative color without straight-line structure is weak
     evidence for diagrams/equations; avoid letting covers dominate the score. */
  if (colorfulPixelRatio >= 0.50 && longLineDensity < 0.08) {
    score *= 0.45;
  }

  return {
    longLineDensity,
    diagramEquationScore: Number(clamp01(score).toFixed(3)),
  };
}

function measureForegroundGeometry(
  width: number,
  height: number,
  step: number,
  data: Uint8ClampedArray,
  localMap: ReturnType<typeof buildLocalPolarityMap>,
): ForegroundGeometry & {
  foregroundSamples: number;
  isolatedForegroundRatio: number;
  averageForegroundNeighbors: number;
} {
  let foregroundSamples = 0;
  let isolatedForeground = 0;
  let neighborSum = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  const sampleForeground = createForegroundSampler(width, height, data, localMap);

  const sampleCount = Math.ceil(height / step) * Math.ceil(width / step);
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (!sampleForeground(x, y)) continue;

      foregroundSamples++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const left = sampleForeground(x - step, y);
      const right = sampleForeground(x + step, y);
      const up = sampleForeground(x, y - step);
      const down = sampleForeground(x, y + step);
      const neighbors = Number(left) + Number(right) + Number(up) + Number(down);
      neighborSum += neighbors;
      if (neighbors <= 1) isolatedForeground++;
    }
  }

  const coverage = foregroundSamples / Math.max(sampleCount, 1);
  const bbox = foregroundSamples > 0
    ? {
        xMin: Number((minX / Math.max(width - 1, 1)).toFixed(3)),
        yMin: Number((minY / Math.max(height - 1, 1)).toFixed(3)),
        xMax: Number((maxX / Math.max(width - 1, 1)).toFixed(3)),
        yMax: Number((maxY / Math.max(height - 1, 1)).toFixed(3)),
      }
    : undefined;

  const margins = bbox
    ? {
        top: bbox.yMin,
        right: Number((1 - bbox.xMax).toFixed(3)),
        bottom: Number((1 - bbox.yMax).toFixed(3)),
        left: bbox.xMin,
      }
    : undefined;

  return {
    coverage: Number(clamp01(coverage).toFixed(4)),
    bbox,
    margins,
    sparseContent: coverage <= 0.03,
    foregroundSamples,
    isolatedForegroundRatio: foregroundSamples > 0
      ? isolatedForeground / foregroundSamples
      : 0,
    averageForegroundNeighbors: foregroundSamples > 0
      ? neighborSum / foregroundSamples
      : 0,
  };
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

  /*
   * Keep the existing dark/diagram/light behavior ahead of the new
   * screenshot/mixed heuristics. Screenshot classification is mainly intended
   * to distinguish non-dark, non-diagram raster pages from clean lecture pages;
   * recipeSelector currently maps it to the restrained light recipe.
   */
  const rasterScreenshotSignal =
    colorfulPixelRatio >= 0.02 &&
    edgeDensity >= 0.015 &&
    foregroundStructure.longLineDensity >= 0.04;

  /*
   * Source distinction is intentionally narrower than SCREENSHOT_HEAVY:
   * strong UI/card-like structure maps to "screenshot", while weaker
   * raster-heavy structure maps to the camera/photo-scan proxy branch.
   * We only emit this hint for pages already classified as raster-heavy;
   * ordinary scans and clean slides therefore keep their existing branches.
   */
  const screenshotSourceSignal =
    colorfulPixelRatio >= 0.08 &&
    edgeDensity >= 0.015 &&
    foregroundStructure.longLineDensity >= 0.05;

  const photoScanSourceSignal =
    colorfulPixelRatio >= 0.02 &&
    edgeDensity >= 0.012 &&
    foregroundStructure.longLineDensity >= 0.035;

  const screenshotHeavy =
    !isDarkSource &&
    contrast <= 65 &&
    inkDensity < 0.85 &&
    (
      (
        edgeDensity >= 0.08 &&
        (colorfulPixelRatio >= 0.02 || contrast >= 25)
      ) ||
      rasterScreenshotSignal
    );

  const diagramEquationSignal =
    isDarkSource &&
    pagePolarity.polarity !== 'mixed' &&
    foregroundCoverage >= 0.02 &&
    (
      (
        foregroundStructure.diagramEquationScore >= 0.72 &&
        foregroundStructure.longLineDensity >= 0.025
      ) ||
      (
        foregroundStructure.longLineDensity >= 0.035 &&
        edgeDensity >= 0.04
      )
    );

  const balancedMixedPage =
    pagePolarity.polarity === 'mixed' ||
    (
      darkBgRatio <= DARK_BG_RATIO_THRESHOLD &&
      lightBgRatio >= 0.35 &&
      lightBgRatio <= 0.65 &&
      contrast >= 20 &&
      inkDensity >= 0.25
    );

  let classification: PageClassification;
  let rasterSource: RasterSource | undefined;
  if (pagePolarity.polarity === 'mixed') {
    classification = 'MIXED';
  } else if (!isDarkSource && screenshotHeavy) {
    classification = 'SCREENSHOT_HEAVY';
    if (screenshotSourceSignal) rasterSource = 'screenshot';
    else if (photoScanSourceSignal) rasterSource = 'photo-scan';
  } else if ((!isDarkSource && contrast > 65) || diagramEquationSignal) {
    classification = 'DIAGRAM_EQUATION';
  } else if (darkBgRatio > DARK_BG_RATIO_THRESHOLD) {
    classification = 'DARK_SLIDE';
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
    rasterSource,
    classification,
  };
}
