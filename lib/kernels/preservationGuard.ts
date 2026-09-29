/**
 * preservationGuard - deterministic content-preservation safety net.
 *
 * The print recipes intentionally change page polarity and tone. This guard
 * checks whether the processed raster still contains the page's fine content
 * signature before accepting an aggressive result.
 *
 * It does not judge visual style. It only looks for strong evidence of
 * destructive loss: simultaneous collapse of foreground coverage and local
 * edge/thin-stroke structure. When that happens callers can retry once with a
 * softened recipe. All measurements are sampled to keep the guard cheap.
 */

import type { PageProfile, ProcessingParameters } from '../optimizer/types';
import { getLuminance } from './luminance';

export interface PreservationAssessment {
  /** 0..1, conservative lower-bound style score. */
  score: number;
  coverageRatio: number;
  edgeRatio: number;
  thinStrokeRatio: number;
  likelyDamaged: boolean;
}

export interface PreservationGuardResult {
  parameters: ProcessingParameters;
  assessment: PreservationAssessment;
  retried: boolean;
}

interface MaskStats {
  foreground: number;
  edges: number;
  thin: number;
}

const DEFAULT_POLICY = {
  minForegroundSamples: 48,
  coverageFloor: 0.35,
  edgeFloor: 0.48,
  thinStrokeFloor: 0.40,
} as const;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function readLuma(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const i = (y * width + x) * 4;
  return getLuminance(data[i], data[i + 1], data[i + 2]);
}

function buildStats(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  isDarkSource: boolean,
  before: boolean,
): MaskStats {
  const total = width * height;
  const stride = Math.max(1, Math.floor(Math.sqrt(total / 120000)));

  // First sampled pass for a local page mean. This keeps thresholds relative
  // to the actual source instead of assuming a fixed scan/pen brightness.
  let mean = 0;
  let count = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const lum = readLuma(data, width, x, y);
      count++;
      mean += (lum - mean) / count;
    }
  }

  const spread = isDarkSource ? 22 : 24;
  const darkThreshold = Math.max(70, Math.min(190, mean - spread));
  const lightThreshold = Math.min(245, Math.max(150, mean + spread));

  let foreground = 0;
  let edges = 0;
  let thin = 0;
  let fgSamples = 0;

  const isForeground = (lum: number): boolean => {
    if (before) return isDarkSource ? lum >= lightThreshold : lum <= darkThreshold;
    // Processed pages are normally white-backed with dark foreground, including
    // pages that started as dark slides and were inverted.
    return lum <= 150;
  };

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const lum = readLuma(data, width, x, y);
      const fg = isForeground(lum);
      if (fg) {
        foreground++;
        const left = x > 0 ? isForeground(readLuma(data, width, x - 1, y)) : false;
        const right = x + 1 < width ? isForeground(readLuma(data, width, x + 1, y)) : false;
        const up = y > 0 ? isForeground(readLuma(data, width, x, y - 1)) : false;
        const down = y + 1 < height ? isForeground(readLuma(data, width, x, y + 1)) : false;
        const neighbors = Number(left) + Number(right) + Number(up) + Number(down);
        if (neighbors <= 2) thin++;
        fgSamples++;
      }

      const rightLum = x + stride < width ? readLuma(data, width, x + stride, y) : lum;
      const downLum = y + stride < height ? readLuma(data, width, x, y + stride) : lum;
      if (Math.abs(lum - rightLum) >= 22 || Math.abs(lum - downLum) >= 22) edges++;
    }
  }

  return { foreground, edges, thin };
}

export function assessPreservation(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  processed: Uint8ClampedArray,
  processedWidth: number,
  processedHeight: number,
  profile: Pick<PageProfile, 'classification' | 'darkBackgroundRatio'>,
  cropTopPx = 0,
): PreservationAssessment {
  const isDarkSource =
    profile.classification === 'DARK_SLIDE' ||
    profile.darkBackgroundRatio > 0.55;

  const croppedSource = new Uint8ClampedArray(processedWidth * processedHeight * 4);
  const srcRowBytes = sourceWidth * 4;
  const dstRowBytes = processedWidth * 4;
  const maxRows = Math.min(processedHeight, sourceHeight - cropTopPx);
  for (let y = 0; y < maxRows; y++) {
    const srcStart = (y + cropTopPx) * srcRowBytes;
    const dstStart = y * dstRowBytes;
    croppedSource.set(
      source.subarray(srcStart, srcStart + dstRowBytes),
      dstStart,
    );
  }

  const before = buildStats(croppedSource, processedWidth, processedHeight, isDarkSource, true);
  const after = buildStats(processed, processedWidth, processedHeight, isDarkSource, false);

  if (before.foreground < DEFAULT_POLICY.minForegroundSamples) {
    return {
      score: 1,
      coverageRatio: 1,
      edgeRatio: 1,
      thinStrokeRatio: 1,
      likelyDamaged: false,
    };
  }

  const coverageRatio = after.foreground / Math.max(before.foreground, 1);
  const edgeRatio = after.edges / Math.max(before.edges, 1);
  const thinStrokeRatio = after.thin / Math.max(before.thin, 1);

  const catastrophicCoverage = coverageRatio < DEFAULT_POLICY.coverageFloor && edgeRatio < DEFAULT_POLICY.edgeFloor;
  const fineDetailLoss =
    edgeRatio < DEFAULT_POLICY.edgeFloor &&
    thinStrokeRatio < DEFAULT_POLICY.thinStrokeFloor;
  const likelyDamaged = catastrophicCoverage || fineDetailLoss;

  // Score is intentionally dominated by the two structural signals so a
  // legitimate reduction in total foreground area does not trigger rollback.
  const score = clamp01(
    0.45 * Math.min(1, coverageRatio) +
    0.35 * Math.min(1, edgeRatio) +
    0.20 * Math.min(1, thinStrokeRatio),
  );

  return {
    score: Number(score.toFixed(3)),
    coverageRatio: Number(coverageRatio.toFixed(3)),
    edgeRatio: Number(edgeRatio.toFixed(3)),
    thinStrokeRatio: Number(thinStrokeRatio.toFixed(3)),
    likelyDamaged,
  };
}

/** Create a single conservative fallback recipe. Never changes page polarity. */
export function softenProcessingParameters(params: ProcessingParameters): ProcessingParameters {
  const nextDilation =
    params.dilationKernelSize == null
      ? params.dilationKernelSize
      : Math.max(0, params.dilationKernelSize - 2);

  return {
    ...params,
    backgroundWhiteningThreshold: Math.min(255, params.backgroundWhiteningThreshold + 15),
    contrastEnhancement: Math.round(params.contrastEnhancement * 0.55),
    sharpenAmount: Math.round(params.sharpenAmount * 0.55),
    denoiseAmount: Math.round(params.denoiseAmount * 0.50),
    binaizationThreshold: 0,
    dilationKernelSize: nextDilation,
    strokeEnhancement:
      nextDilation === undefined
        ? params.strokeEnhancement
        : nextDilation >= 5
          ? 'strong'
          : nextDilation >= 3
            ? 'normal'
            : 'none',
  };
}
