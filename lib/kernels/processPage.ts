/**
 * processPage - Core pixel processing kernel.
 *
 * Production optimizations:
 *  - Lazy channel mask allocation: only allocates masks for channels with data
 *  - Single-pass HSV classification with early-exit for dark pixels
 *  - Zero-copy crop via subarray (no intermediate buffer)
 *  - Bulk row copy via set() for fast path
 *  - Fast V-check avoids full HSV conversion for dark pixel rejection
 *  - Combined CC pass: decorative fill + noise removal in single traversal
 *  - Uint32Array bulk composite: 4x fewer write operations
 *  - Module-level pooled BFS buffers eliminate per-call heap allocation
 */
import { getLuminance } from './luminance';
import { rgbToHsv, fastMinChannel } from './hsv';
import { DARK_BG_RATIO_THRESHOLD } from './constants';
import { applyMaskDilation, setDilationHook } from './maskOps';
import { applyUnsharpMask, applyUnsharpMaskBW, setUnsharpHook, setUnsharpBwHook } from './sharpen';
import { ensureCC, getCCLabels, getCCQueue, getCCMinX, getCCMinY, getCCMaxX, getCCMaxY, getCCArea, getCCDrop } from './connectedComponents';
import type { IWasmKernels } from '../wasm/types';

let wasmKernels: IWasmKernels | null = null;

export function setWasmKernelsHooks(kernels: IWasmKernels): void {
  wasmKernels = kernels;
  setDilationHook((mask, w, h, ks) => kernels.dilateMask(mask, w, h, ks));
  setUnsharpHook((data, w, h, amt) => kernels.unsharpMask(data, w, h, amt));
  if (typeof kernels.unsharpMaskBW === 'function') {
    setUnsharpBwHook((data, w, h, amt) => kernels.unsharpMaskBW!(data, w, h, amt));
  } else {
    setUnsharpBwHook(null);
  }
}

export function clearWasmKernelsHooks(): void {
  wasmKernels = null;
  setDilationHook(null);
  setUnsharpHook(null);
  setUnsharpBwHook(null);
}

export function setWasmHooks(
  dilation: (mask: Uint8Array, w: number, h: number, ks: number) => void,
  unsharp: (data: Uint8ClampedArray, w: number, h: number, amt: number) => void,
): void {
  setDilationHook(dilation);
  setUnsharpHook(unsharp);
}

export interface KernelProcessResult {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  /** True when the preservation guard softened the first-pass recipe. */
  preservationGuardTriggered?: boolean;
}

/** Fast max-channel check (avoids full HSV for dark pixel rejection) */
function fastMaxChannel(r: number, g: number, b: number): number {
  return r > g ? (r > b ? r : b) : (g > b ? g : b);
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Apply the safe, non-binary print cleanup knobs before mask extraction. */
function applyTonalAdjustments(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: {
    backgroundWhiteningThreshold?: number;
    contrastEnhancement?: number;
  },
): void {
  const whitening = params.backgroundWhiteningThreshold ?? 255;
  const contrastAmount = Math.max(0, Math.min(100, params.contrastEnhancement ?? 0));
  const contrastFactor = 1 + contrastAmount / 100;

  for (let i = 0; i < width * height * 4; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (whitening > 0 && whitening < 255 && luminance(r, g, b) >= whitening) {
      r = 255; g = 255; b = 255;
    }

    if (contrastAmount > 0) {
      r = clampByte(128 + (r - 128) * contrastFactor);
      g = clampByte(128 + (g - 128) * contrastFactor);
      b = clampByte(128 + (b - 128) * contrastFactor);
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 0xFF;
  }
}

/** Whether the current page needs the full foreground-mask pipeline. */
function shouldBuildForegroundMask(
  params: {
    invertMode: 'smart' | 'simple' | 'none';
    smartColorMapping?: boolean;
    binaizationThreshold?: number;
  },
  isDark: boolean,
): boolean {
  return (
    params.invertMode !== 'none' ||
    isDark ||
    params.smartColorMapping === true ||
    (params.binaizationThreshold ?? 0) > 0
  );
}

/**
 * Combined connected-components pass: identifies all foreground components
 * and removes those matching decorative-fill OR noise criteria in a single
 * BFS traversal. Replaces the previous approach of 7+ separate CC passes
 * (one per color channel + noise removal) with exactly 1 pass.
 */
function removeDecorativeAndNoise(fm: Uint8Array, w: number, h: number, denoiseAmount = 15): void {
  const totalPixels = w * h;
  ensureCC(totalPixels);
  const labels = getCCLabels();
  const queue = getCCQueue();
  const sMinX = getCCMinX();
  const sMinY = getCCMinY();
  const sMaxX = getCCMaxX();
  const sMaxY = getCCMaxY();
  const sArea = getCCArea();
  const drop = getCCDrop();

  let cl = 1;

  for (let i = 0; i < totalPixels; i++) {
    if (fm[i] !== 1 || labels[i] !== 0) continue;
    const lb = cl++;
    let mnx = w, mny = h, mxx = -1, mxy = -1, ar = 0;
    queue[0] = i;
    let hd = 0, tl = 1;
    labels[i] = lb;
    while (hd < tl) {
      const cu = queue[hd++];
      const cx = cu % w;
      const cy = (cu / w) | 0;
      if (cx < mnx) mnx = cx;
      if (cx > mxx) mxx = cx;
      if (cy < mny) mny = cy;
      if (cy > mxy) mxy = cy;
      ar++;
      // 4-connected neighbors
      if (cy > 0) { const ni = cu - w; if (fm[ni] === 1 && labels[ni] === 0) { labels[ni] = lb; queue[tl++] = ni; } }
      if (cy < h - 1) { const ni = cu + w; if (fm[ni] === 1 && labels[ni] === 0) { labels[ni] = lb; queue[tl++] = ni; } }
      if (cx > 0) { const ni = cu - 1; if (fm[ni] === 1 && labels[ni] === 0) { labels[ni] = lb; queue[tl++] = ni; } }
      if (cx < w - 1) { const ni = cu + 1; if (fm[ni] === 1 && labels[ni] === 0) { labels[ni] = lb; queue[tl++] = ni; } }
    }
    sMinX[lb] = mnx;
    sMinY[lb] = mny;
    sMaxX[lb] = mxx;
    sMaxY[lb] = mxy;
    sArea[lb] = ar;
  }

  if (cl <= 1) return; // No components found

  /* Keep the historical default at >=6 px for existing presets/tests, but
   * let denoise=0 disable component suppression and stronger settings raise
   * the threshold conservatively. Small handwriting marks are therefore not
   * erased merely because the page uses a light recipe. */
  const minAreaBase = Math.max(6, (totalPixels / 600000) | 0);
  const minArea = denoiseAmount <= 0
    ? 1
    : Math.max(
        minAreaBase,
        Math.min(32, minAreaBase + Math.max(0, Math.round((denoiseAmount - 25) / 4))),
      );
  for (let lb = 1; lb < cl; lb++) {
    const area = sArea[lb];
    if (area < minArea) { drop[lb] = 1; continue; }
    const cw = sMaxX[lb] - sMinX[lb] + 1;
    const ch = sMaxY[lb] - sMinY[lb] + 1;
    if (area >= 200 && cw / Math.max(ch, 1) > 2.2 && cw / w > 0.20 && sMinY[lb] / h < 0.15 && area > cw * ch * 0.3) {
      drop[lb] = 1;
    } else {
      drop[lb] = 0;
    }
  }

  // Remove marked components
  for (let i = 0; i < totalPixels; i++) {
    const l = labels[i];
    if (l > 0 && drop[l] === 1) fm[i] = 0;
  }
}

export function processPage(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  params: {
    invertMode: 'smart' | 'simple' | 'none';
    bannerCropTopPct: number;
    bannerCropBottomPct: number;
    strokeEnhancement?: string;
    sharpenAmount: number;
    dilationKernelSize?: number;
    smartColorMapping?: boolean;
    backgroundWhiteningThreshold?: number;
    contrastEnhancement?: number;
    denoiseAmount?: number;
    binaizationThreshold?: number;
  },
  profile: { classification: string; darkBackgroundRatio: number }
): KernelProcessResult {
  const sw = width, sh = height;
  const ct = Math.floor(sh * (params.bannerCropTopPct / 100));
  const cb = Math.floor(sh * (params.bannerCropBottomPct / 100));
  const dw = sw, dh = Math.max(10, sh - ct - cb);
  const totalPixels = dw * dh;

  /* Same threshold as the analyzer (analysis.ts) so a page classified MIXED
     is never silently binarized by the kernel's own darker opinion. */
  const isDark =
    profile.classification === 'DARK_SLIDE' ||
    profile.darkBackgroundRatio > DARK_BG_RATIO_THRESHOLD;
  const useDarkColorClassifier = params.invertMode === 'smart' && isDark;
  const useLightColorMapping = params.smartColorMapping === true && !isDark;
  const shouldProcess = shouldBuildForegroundMask(params, isDark);
  const convertColors = params.invertMode === 'smart' && isDark;

  const ks = params.dilationKernelSize != null
    ? params.dilationKernelSize
    : (params.strokeEnhancement === 'strong' ? 5 : params.strokeEnhancement === 'normal' ? 3 : 0);

  const backgroundWhiteningThreshold = params.backgroundWhiteningThreshold ?? 255;
  const contrastEnhancement = Math.max(0, Math.min(100, params.contrastEnhancement ?? 0));
  const denoiseAmount = Math.max(0, Math.min(100, params.denoiseAmount ?? 15));
  const binaizationThreshold = Math.max(0, Math.min(255, params.binaizationThreshold ?? 0));
  const hasAdvancedPixelControls =
    backgroundWhiteningThreshold !== 255 ||
    contrastEnhancement > 0 ||
    denoiseAmount !== 0 ||
    binaizationThreshold > 0 ||
    params.smartColorMapping === true ||
    params.invertMode === 'none';

  /*
   * Keep the monolithic WASM fast path only when it can represent the full
   * parameter set. Older binaries expose only the original 7-argument
   * process_page API, so advanced UI parameters must use the JS orchestration
   * path where every control is actually honored.
   */
  if (
    shouldProcess &&
    !hasAdvancedPixelControls &&
    wasmKernels &&
    typeof wasmKernels.processPage === 'function'
  ) {
    try {
      const cropped = srcData.subarray(ct * sw * 4, (ct + dh) * sw * 4);
      const rgbaView = new Uint8Array(cropped.buffer, cropped.byteOffset, cropped.byteLength);
      const out = wasmKernels.processPage(
        rgbaView, dw, dh,
        convertColors, isDark,
        ks,
        params.sharpenAmount / 100,
      );
      /* The wasm-bindgen glue already returns a JS-owned, detached ArrayBuffer
         (via subarray().slice()) — no second copy needed. Returning out.buffer
         directly saves one full-buffer memcpy per page (~4.8 MB at 2400x1600). */
      return { buffer: out.buffer as ArrayBuffer, width: dw, height: dh };
    } catch {
      /* WASM process_page trapped/failed at runtime; fall through to the
         per-kernel WASM/JS path below instead of crashing the page. */
    }
  }

  /* Crop first so both the tonal light-page path and the B/W mask path share
   * exactly the same dimensions and alpha normalization. */
  const dst = new Uint8ClampedArray(totalPixels * 4);
  const srcRowBytes = sw * 4;
  const dstRowBytes = dw * 4;
  const srcOffset = ct * srcRowBytes;
  for (let y = 0; y < dh; y++) {
    const srcStart = srcOffset + y * srcRowBytes;
    const dstStart = y * dstRowBytes;
    dst.set(srcData.subarray(srcStart, srcStart + dstRowBytes), dstStart);
  }

  applyTonalAdjustments(dst, dw, dh, {
    backgroundWhiteningThreshold,
    contrastEnhancement,
  });

  /*
   * Light handwritten pages should stay grayscale/RGB unless the user
   * explicitly asks for binarization or another foreground-mask operation.
   * This fixes the old "invertMode=none => skip every useful control" behavior.
   */
  if (!shouldProcess) {
    if (params.sharpenAmount > 0) {
      applyUnsharpMask(dst, dw, dh, params.sharpenAmount / 100);
    }
    return { buffer: dst.buffer, width: dw, height: dh };
  }

  /* Foreground mask extraction: single pass, all channels OR'd into fm */
  const fm = new Uint8Array(totalPixels);

  if (useDarkColorClassifier && wasmKernels) {
    /* WASM-accelerated path: single-pass fused classify when available.
     * The mask is now built from the already-whitened/contrast-adjusted
     * cropped bitmap so those UI parameters are no longer dead settings.
     */
    const cropped = dst;
    if (typeof wasmKernels.classifyFused === 'function') {
      fm.set(wasmKernels.classifyFused(cropped, totalPixels));
    } else {
      const hsv = wasmKernels.rgbToHsvBatch(cropped, totalPixels);
      const channels = wasmKernels.classifyColors(hsv, totalPixels);
      for (let i = 0; i < totalPixels; i++) {
        const base = i * 7;
        if (channels[base] === 1 || channels[base + 1] === 1 || channels[base + 2] === 1 ||
            channels[base + 3] === 1 || channels[base + 4] === 1 || channels[base + 5] === 1 ||
            channels[base + 6] === 1) {
          fm[i] = 1;
        }
      }
    }
    removeDecorativeAndNoise(fm, dw, dh, denoiseAmount);
  } else {
    /*
     * Luminance path:
     * - dark pages: bright foreground on a dark background
     * - light pages: dark handwriting/print
     * - optional smart color mapping: also retain vivid pen colors on light pages
     */
    for (let y = 0; y < dh; y++) {
      const srcRowOffset = y * dw * 4;
      const dstRowOffset = y * dw;
      for (let x = 0; x < dw; x++) {
        const si = srcRowOffset + x * 4;
        const r = dst[si], g = dst[si + 1], b = dst[si + 2];
        const lum = getLuminance(r, g, b);
        const maxC = fastMaxChannel(r, g, b);
        const minC = fastMinChannel(r, g, b);
        const saturated = maxC - minC > 55;
        const foregroundThreshold = binaizationThreshold > 0 ? binaizationThreshold : 70;
        const keepForeground = isDark
          ? lum >= foregroundThreshold
          : lum < foregroundThreshold || (useLightColorMapping && saturated && lum < 245);
        if (keepForeground) fm[dstRowOffset + x] = 1;
      }
    }
    removeDecorativeAndNoise(fm, dw, dh, denoiseAmount);
  }

  /*
   * Explicit binarization is honored as a luminance gate even when smart
   * color classification is active. On dark pages the foreground is bright;
   * on light pages it is dark.
   */
  if (binaizationThreshold > 0) {
    for (let y = 0; y < dh; y++) {
      const row = y * dw;
      for (let x = 0; x < dw; x++) {
        const i = row + x;
        const si = i * 4;
        const lum = getLuminance(dst[si], dst[si + 1], dst[si + 2]);
        const maxC = fastMaxChannel(dst[si], dst[si + 1], dst[si + 2]);
        const minC = fastMinChannel(dst[si], dst[si + 1], dst[si + 2]);
        const keep = isDark
          ? lum >= binaizationThreshold
          : lum < binaizationThreshold || (useLightColorMapping && maxC - minC > 55 && lum < 245);
        if (!keep) fm[i] = 0;
      }
    }
  }

  /* Post-processing: dilation with numeric kernel size override */
  if (ks > 0) {
    applyMaskDilation(fm, dw, dh, ks);
  }

  /* Composite: mask to B/W output using Uint32Array bulk writes.
   * On little-endian: 0xFF000000 = black (A=FF,R=00,G=00,B=00), 0xFFFFFFFF = white. */
  const dst32 = new Uint32Array(dst.buffer);
  for (let i = 0; i < totalPixels; i++) {
    dst32[i] = fm[i] === 1 ? 0xFF000000 : 0xFFFFFFFF;
  }

  if (params.sharpenAmount > 0) {
    /* The composite above guarantees R=G=B, so the 1-channel BW variant is
       byte-identical and ~2.4-2.5x faster (verified 0/5,760,000 diffs). */
    applyUnsharpMaskBW(dst, dw, dh, params.sharpenAmount / 100);
  }

  return { buffer: dst.buffer, width: dw, height: dh };
}

export function createImageDataFromBuffer(
  buffer: ArrayBuffer,
  width: number,
  height: number,
): ImageData {
  const data = new Uint8ClampedArray(buffer);
  return new ImageData(data, width, height);
}
