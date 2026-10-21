// Page / local foreground polarity detection (moved verbatim from analysis.ts).
import { getLuminance } from '../../kernels';
import { DARK_BG_RATIO_THRESHOLD } from '../../kernels/constants';
import { clamp01 } from './color';

export type ForegroundPolarity = 'light-on-dark' | 'dark-on-light' | 'mixed';

export const MIXED_BACKGROUND_RATIO = 0.40;
export const LOCAL_TILE_MIN = 16;
export const LOCAL_TILE_TARGETS = 48;

export function inferForegroundPolarity(
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

export function buildLocalPolarityMap(
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
