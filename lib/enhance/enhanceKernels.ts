/**
 * enhanceKernels — pure, deterministic pixel pipeline for the
 * "Enhance Light PDF" tool.
 *
 * Target input: light-background pages with faint/light ink (handwritten
 * notebook scans, photographed module pages). Goal: push faint ink toward
 * black and the background toward pure white so the output survives
 * printing/photocopying.
 *
 * All functions are pure (input -> new output), operate on typed arrays,
 * and are deterministic: identical input + settings => identical output.
 */

import { applyUnsharpMask, applyUnsharpMaskBW } from '@/lib/kernels/sharpen';
import type { EnhanceSettings } from './types';

/**
 * Tunable constants for the enhance pipeline — extracted for testability
 * and future calibration. Values chosen to push faint pencil (luma ~150-180)
 * toward black while preserving dark ink (<40) and mapping paper tint
 * (≥ bg-12) to pure white.
 */
export const ENHANCE_TUNING = {
  /** Ink is considered anything below (bg - this) */
  INK_CEILING_OFFSET: 30,
  /** Pixels with luma ≥ (bg - this) are snapped to white when cleaning */
  BG_CLEAN_THRESHOLD: 12,
  /** Max lift (darken) applied at darken=100 */
  DARKEN_MAX_LIFT: 96,
  /** Contrast gain multiplier */
  CONTRAST_GAIN_FACTOR: 1.5,
  /** Max unsharp amount at sharpen=100 */
  SHARPEN_MAX_AMT: 0.55,
} as const;

/** Constants for the even-lighting (shadow flattening) step. */
export const LIGHTING_TUNING = {
  /** Grid resolution: the short page side is split into about this many blocks. */
  GRID_DIV: 24,
  MIN_BLOCK: 16,
  /** Paper brightness of a block = this percentile of its luma (ink is the dark minority). */
  PAPER_PERCENTILE: 0.9,
  /** Never brighten a region more than this factor. */
  MAX_GAIN: 2.2,
  /** Blocks darker than this are real dark content, not shadowed paper — left alone. */
  MIN_PAPER: 90,
  /** Skip the pass when the paper is already white (max gain − 1). */
  NOOP_EPS: 0.02,
} as const;

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Single-channel luminance from RGBA (Rec. 601 weights). */
export function lumaOf(r: number, g: number, b: number): number {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

interface LumaStats {
  /** 1st percentile luminance (darkest real content, immune to outliers). */
  p1: number;
  /** 95th percentile luminance (background estimate, immune to specks). */
  p95: number;
}

/**
 * Percentile stats over the luminance of every pixel. Uses a 256-bin
 * histogram (O(n), no sorting).
 */
export function computeLumaStats(data: Uint8ClampedArray): LumaStats {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const l = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    hist[clamp255(l) | 0]++;
  }
  const n = data.length / 4;
  const k1 = Math.max(1, Math.round(n * 0.01));
  const k95 = Math.min(n, Math.round(n * 0.95));
  let acc = 0;
  let p1 = 0;
  let p95 = 0;
  let seenP1 = false;
  let seenP95 = false;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (!seenP1 && acc >= k1) { p1 = v; seenP1 = true; }
    if (!seenP95 && acc >= k95) { p95 = v; seenP95 = true; }
    if (seenP1 && seenP95) break;
  }
  return { p1, p95: p95 === 0 ? 255 : p95 };
}

/**
 * Flattens uneven lighting IN PLACE: estimates the paper brightness on a coarse
 * block grid, smooths it, then scales every pixel so the paper under it becomes
 * white. Handwriting keeps its relative contrast, shadows and gradients disappear.
 * Pure + deterministic. Returns false when the page is already white (no-op).
 */
export function normalizeLighting(data: Uint8ClampedArray, w: number, h: number): boolean {
  if (w < 32 || h < 32) return false;
  const T = LIGHTING_TUNING;
  const block = Math.max(T.MIN_BLOCK, Math.round(Math.min(w, h) / T.GRID_DIV));
  const gw = Math.ceil(w / block);
  const gh = Math.ceil(h / block);
  const hist = new Uint32Array(gw * gh * 256);
  const counts = new Uint32Array(gw * gh);

  for (let y = 0; y < h; y++) {
    const rowBase = Math.floor(y / block) * gw;
    let o = y * w * 4;
    for (let x = 0; x < w; x++, o += 4) {
      const l = (data[o] * 77 + data[o + 1] * 150 + data[o + 2] * 29) >> 8;
      const b = rowBase + Math.floor(x / block);
      hist[b * 256 + l]++;
      counts[b]++;
    }
  }

  const paper = new Float32Array(gw * gh);
  for (let b = 0; b < gw * gh; b++) {
    const target = Math.max(1, Math.round(counts[b] * T.PAPER_PERCENTILE));
    let acc = 0;
    let v = 255;
    for (let i = 0; i < 256; i++) {
      acc += hist[b * 256 + i];
      if (acc >= target) { v = i; break; }
    }
    paper[b] = v;
  }

  // Every block's paper is scaled up to white (255): shadowed paper and lit paper end up the same.
  const gain = new Float32Array(gw * gh);
  let maxGain = 1;
  for (let b = 0; b < gw * gh; b++) {
    const g = paper[b] < T.MIN_PAPER ? 1 : Math.min(T.MAX_GAIN, Math.max(1, 255 / Math.max(1, paper[b])));
    gain[b] = g;
    if (g > maxGain) maxGain = g;
  }
  if (maxGain - 1 < T.NOOP_EPS) return false;

  // 3×3 box blur of the gain grid so block borders never show.
  const sm = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = gy + dy;
        if (yy < 0 || yy >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = gx + dx;
          if (xx < 0 || xx >= gw) continue;
          sum += gain[yy * gw + xx];
          n++;
        }
      }
      sm[gy * gw + gx] = sum / n;
    }
  }

  // Bilinear interpolation between block centres.
  const x0 = new Int32Array(w);
  const fx = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const gxf = Math.min(gw - 1, Math.max(0, (x + 0.5) / block - 0.5));
    const i0 = Math.floor(gxf);
    x0[x] = i0;
    fx[x] = gxf - i0;
  }
  for (let y = 0; y < h; y++) {
    const gyf = Math.min(gh - 1, Math.max(0, (y + 0.5) / block - 0.5));
    const y0 = Math.floor(gyf);
    const y1 = Math.min(gh - 1, y0 + 1);
    const fy = gyf - y0;
    let o = y * w * 4;
    for (let x = 0; x < w; x++, o += 4) {
      const i0 = x0[x];
      const i1 = Math.min(gw - 1, i0 + 1);
      const f = fx[x];
      const top = sm[y0 * gw + i0] * (1 - f) + sm[y0 * gw + i1] * f;
      const bot = sm[y1 * gw + i0] * (1 - f) + sm[y1 * gw + i1] * f;
      const g = top * (1 - fy) + bot * fy;
      const r = data[o] * g;
      const gg = data[o + 1] * g;
      const bb = data[o + 2] * g;
      data[o] = r > 255 ? 255 : r;
      data[o + 1] = gg > 255 ? 255 : gg;
      data[o + 2] = bb > 255 ? 255 : bb;
    }
  }
  return true;
}

/**
 * Main enhance pipeline. Pure: reads `input`, writes a NEW ImageData.
 *
 * Order (all steps deterministic):
 *  0. evenLighting — flatten camera shadows / gradients (optional)
 *  1. cleanBackground — pixels at/near background luminance become pure white
 *  2. contrast — luma-based histogram stretch from (p1, p95) onto (0, 255)
 *  3. darken — ink pixels (below the ink ceiling) get lifted toward black
 *  4. grayscale — collapse to luma (applied before sharpen so the fast
 *     B/W unsharp kernel can be used)
 *  5. sharpen — unsharp mask (strength from settings; skipped when 0)
 */
export function enhanceImageData(input: ImageData, settings: EnhanceSettings): ImageData {
  const { width, height } = input;
  // Work on a private copy: every later step reads and writes `out` in place (one pixel at a time).
  const out = new Uint8ClampedArray(input.data);
  const src = out;
  const n = width * height;

  if (settings.evenLighting) normalizeLighting(out, width, height);

  const { p1, p95 } = computeLumaStats(src);

  const bgCeiling = p95;
  const inkCeiling = Math.max(0, bgCeiling - ENHANCE_TUNING.INK_CEILING_OFFSET);
  const darkenLift = Math.round((settings.darken / 100) * ENHANCE_TUNING.DARKEN_MAX_LIFT);

  const contrast = settings.contrast / 100;
  const stretchLo = p1;
  const stretchRange = Math.max(1, p95 - p1);
  const contrastGain = 1 + contrast * ENHANCE_TUNING.CONTRAST_GAIN_FACTOR;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let r = src[o];
    let g = src[o + 1];
    let b = src[o + 2];
    const a = src[o + 3];

    let l = lumaOf(r, g, b);

    if (settings.cleanBackground && l >= bgCeiling - ENHANCE_TUNING.BG_CLEAN_THRESHOLD) {
      r = 255; g = 255; b = 255;
      l = 255;
    }

    if (contrast > 0) {
      const t = (l - stretchLo) / stretchRange;
      const stretched = 255 * (t < 0 ? 0 : t > 1 ? 1 : t);
      const boost = (stretched - l) * contrastGain;
      r = clamp255(r + boost);
      g = clamp255(g + boost);
      b = clamp255(b + boost);
      l = lumaOf(r, g, b);
    }

    if (darkenLift > 0 && l < inkCeiling) {
      const lift = Math.min(darkenLift, inkCeiling - l);
      r = clamp255(r - lift);
      g = clamp255(g - lift);
      b = clamp255(b - lift);
    }

    if (settings.grayscale) {
      l = lumaOf(r, g, b);
      r = l; g = l; b = l;
    }

    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  }

  if (settings.sharpen > 0) {
    const amt = (settings.sharpen / 100) * ENHANCE_TUNING.SHARPEN_MAX_AMT;
    if (settings.grayscale) {
      applyUnsharpMaskBW(out, width, height, amt);
    } else {
      applyUnsharpMask(out, width, height, amt);
    }
  }

  return new ImageData(out, width, height);
}