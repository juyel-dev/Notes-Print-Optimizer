/**
 * blank — spots nearly empty pages from a small thumbnail.
 * "Ink" = pixels clearly different from the paper (the median brightness).
 */

export interface InkStats {
  /** Share (0–1) of pixels that differ clearly from the paper tone. */
  ratio: number;
  /** Median luma 0–255 (the paper). */
  paper: number;
}

/** Contrast (luma levels) a pixel needs against the paper to count as ink. */
export const INK_CONTRAST = 55;
/** Below this share of ink a page counts as blank. */
export const BLANK_INK_RATIO = 0.004;
/** Papers darker than this are never "blank" (a black page is content). */
export const MIN_PAPER_LUMA = 150;

export function measureInk(rgba: Uint8ClampedArray | Uint8Array, step = 2): InkStats {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4 * step) {
    hist[(rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8]++;
    n++;
  }
  if (n === 0) return { ratio: 1, paper: 0 };
  let acc = 0;
  let paper = 0;
  for (let l = 0; l < 256; l++) {
    acc += hist[l];
    if (acc >= n / 2) {
      paper = l;
      break;
    }
  }
  let ink = 0;
  for (let l = 0; l < 256; l++) if (Math.abs(l - paper) > INK_CONTRAST) ink += hist[l];
  return { ratio: ink / n, paper };
}

export function isNearlyBlank(s: InkStats): boolean {
  return s.paper >= MIN_PAPER_LUMA && s.ratio < BLANK_INK_RATIO;
}
