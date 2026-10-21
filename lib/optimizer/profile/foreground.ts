// Foreground sampling, geometry and structure measurements (moved verbatim from analysis.ts).
import { getLuminance } from '../../kernels';
import { clamp01 } from './color';
import type { buildLocalPolarityMap } from './polarity';

export interface ForegroundGeometry {
  coverage: number;
  bbox?: { xMin: number; yMin: number; xMax: number; yMax: number };
  margins?: { top: number; right: number; bottom: number; left: number };
  sparseContent: boolean;
}

export function createForegroundSampler(
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

export interface ForegroundStructure {
  longLineDensity: number;
  diagramEquationScore: number;
}

export function measureForegroundStructure(
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

export function measureForegroundGeometry(
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
