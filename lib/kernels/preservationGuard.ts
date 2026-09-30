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

export type PreservationParameters =
  Pick<
    ProcessingParameters,
    'invertMode' | 'bannerCropTopPct' | 'bannerCropBottomPct' | 'strokeEnhancement' |
    'sharpenAmount' | 'dilationKernelSize'
  > &
  Partial<
    Pick<
      ProcessingParameters,
      'smartColorMapping' | 'backgroundWhiteningThreshold' | 'contrastEnhancement' |
      'denoiseAmount' | 'binaizationThreshold' | 'autoWhiteBoxFix'
    >
  >;

export interface PreservationPolicy {
  minForegroundSamples: number;
  coverageFloor: number;
  edgeFloor: number;
  thinStrokeFloor: number;
}

const DEFAULT_POLICY: PreservationPolicy = {
  minForegroundSamples: 48,
  coverageFloor: 0.35,
  edgeFloor: 0.48,
  thinStrokeFloor: 0.40,
};

export type PreservationProfile = Pick<
  PageProfile,
  | 'classification'
  | 'darkBackgroundRatio'
  | 'density'
  | 'foregroundCoverage'
  | 'foregroundPolarity'
  | 'thinStrokeRisk'
>;

/**
 * Resolve conservative guard floors from the analyzer profile.
 *
 * Sparse/thin pages keep stronger structural floors because losing a small
 * amount of geometry can erase an entire handwritten stroke. Dense and
 * screenshot-heavy pages get slightly lower floors because legitimate
 * tonal/area changes are more common there. Dark-slide and diagram pages
 * retain stronger edge/detail requirements.
 */
export function resolvePreservationPolicy(profile: PreservationProfile): PreservationPolicy {
  const policy = { ...DEFAULT_POLICY };

  if (profile.density === 'sparse') {
    policy.coverageFloor = 0.30;
    policy.edgeFloor = 0.50;
    policy.thinStrokeFloor = 0.45;
  } else if (profile.density === 'dense') {
    policy.coverageFloor = 0.28;
    policy.edgeFloor = 0.44;
    policy.thinStrokeFloor = 0.34;
  }

  switch (profile.classification) {
    case 'DARK_SLIDE':
      policy.coverageFloor = Math.min(policy.coverageFloor, 0.33);
      policy.edgeFloor = Math.max(policy.edgeFloor, 0.50);
      policy.thinStrokeFloor = Math.max(policy.thinStrokeFloor, 0.45);
      break;
    case 'DIAGRAM_EQUATION':
      policy.coverageFloor = Math.min(policy.coverageFloor, 0.30);
      policy.edgeFloor = Math.max(policy.edgeFloor, 0.52);
      policy.thinStrokeFloor = Math.max(policy.thinStrokeFloor, 0.48);
      break;
    case 'SCREENSHOT_HEAVY':
      policy.coverageFloor = Math.min(policy.coverageFloor, 0.25);
      policy.edgeFloor = Math.min(policy.edgeFloor, 0.40);
      policy.thinStrokeFloor = Math.min(policy.thinStrokeFloor, 0.30);
      break;
    case 'MIXED':
      policy.coverageFloor = Math.min(policy.coverageFloor, 0.28);
      policy.edgeFloor = Math.min(policy.edgeFloor, 0.42);
      policy.thinStrokeFloor = Math.min(policy.thinStrokeFloor, 0.34);
      break;
    default:
      break;
  }

  if (profile.thinStrokeRisk) {
    policy.edgeFloor = Math.max(policy.edgeFloor, 0.45);
    policy.thinStrokeFloor = Math.max(policy.thinStrokeFloor, 0.48);
  }

  if (profile.foregroundCoverage != null && profile.foregroundCoverage <= 0.02) {
    policy.coverageFloor = Math.min(policy.coverageFloor, 0.25);
  }

  if (profile.foregroundPolarity === 'mixed') {
    policy.coverageFloor = Math.min(policy.coverageFloor, 0.28);
    policy.edgeFloor = Math.min(policy.edgeFloor, 0.43);
  }

  return policy;
}

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
  yOffset = 0,
): MaskStats {
  const total = width * height;
  const stride = Math.max(1, Math.floor(Math.sqrt(total / 120000)));

  // First sampled pass for a local page mean. This keeps thresholds relative
  // to the actual source instead of assuming a fixed scan/pen brightness.
  let mean = 0;
  let count = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const lum = readLuma(data, width, x, y + yOffset);
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

  const isForeground = (lum: number): boolean => {
    if (before) return isDarkSource ? lum >= lightThreshold : lum <= darkThreshold;
    // Processed pages are normally white-backed with dark foreground, including
    // pages that started as dark slides and were inverted.
    return lum <= 150;
  };

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const lum = readLuma(data, width, x, y + yOffset);
      const fg = isForeground(lum);
      if (fg) {
        foreground++;
        const sampleY = y + yOffset;
        const left = x > 0 ? isForeground(readLuma(data, width, x - 1, sampleY)) : false;
        const right = x + 1 < width ? isForeground(readLuma(data, width, x + 1, sampleY)) : false;
        const up = y > 0 ? isForeground(readLuma(data, width, x, sampleY - 1)) : false;
        const down = y + 1 < height ? isForeground(readLuma(data, width, x, sampleY + 1)) : false;
        const neighbors = Number(left) + Number(right) + Number(up) + Number(down);
        if (neighbors <= 2) thin++;
      }

      /*
       * Count structural edges only when they touch detected foreground.
       * Raw page-wide edge counts are easily dominated by scan/photo texture,
       * JPEG blocks, shadows, or paper grain and can hide real foreground loss.
       */
      const sampleY = y + yOffset;
      const rightX = x + stride < width ? x + stride : x;
      const downY = y + stride < height ? sampleY + stride : sampleY;
      const rightLum = readLuma(data, width, rightX, sampleY);
      const downLum = readLuma(data, width, x, downY);
      const currentForeground = fg;
      const rightForeground = x + stride < width
        ? isForeground(rightLum)
        : false;
      const downForeground = y + stride < height
        ? isForeground(downLum)
        : false;
      const rightEdge =
        (currentForeground || rightForeground) &&
        Math.abs(lum - rightLum) >= 22;
      const downEdge =
        (currentForeground || downForeground) &&
        Math.abs(lum - downLum) >= 22;
      if (rightEdge) edges++;
      if (downEdge) edges++;
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
  profile: PreservationProfile,
  cropTopPx = 0,
): PreservationAssessment {
  const policy = resolvePreservationPolicy(profile);
  const isDarkSource =
    profile.classification === 'DARK_SLIDE' ||
    profile.darkBackgroundRatio > 0.55;

  const beforeHeight = Math.min(processedHeight, sourceHeight - cropTopPx);
  const compareHeight = Math.max(0, beforeHeight);
  const before = buildStats(source, processedWidth, compareHeight, isDarkSource, true, cropTopPx);
  const after = buildStats(processed, processedWidth, processedHeight, isDarkSource, false);

  if (before.foreground < policy.minForegroundSamples) {
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

  const catastrophicCoverage =
    coverageRatio < policy.coverageFloor &&
    edgeRatio < policy.edgeFloor;
  const fineDetailLoss =
    edgeRatio < policy.edgeFloor &&
    thinStrokeRatio < policy.thinStrokeFloor;
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
export function softenProcessingParameters(params: PreservationParameters): PreservationParameters {
  const nextDilation =
    params.dilationKernelSize == null
      ? params.dilationKernelSize
      : Math.max(0, params.dilationKernelSize - 2);

  return {
    ...params,
    backgroundWhiteningThreshold: Math.min(255, (params.backgroundWhiteningThreshold ?? 255) + 15),
    contrastEnhancement: Math.round((params.contrastEnhancement ?? 0) * 0.55),
    sharpenAmount: Math.round(params.sharpenAmount * 0.55),
    denoiseAmount: Math.round((params.denoiseAmount ?? 0) * 0.50),
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
