/**
 * renderPlan — pure sizing maths for rendering one PDF page.
 * Keeps the raster at the requested DPI but caps the pixel count so huge
 * pages (posters, 100+ MP scans) cannot exhaust phone memory.
 */

/** Hard ceiling on rendered pixels per page (≈ A4 @ 240 DPI). */
export const MAX_RENDER_PIXELS = 8_000_000;
/** Longest preview/original thumbnail edge kept in memory for before/after + live preview. */
export const PREVIEW_MAX_WIDTH = 1000;

export interface RenderPlan {
  scale: number;
  width: number;
  height: number;
  /** Page size in PDF points (scale 1). */
  pdfWidth: number;
  pdfHeight: number;
  capped: boolean;
}

export function planRender(pageWidthPt: number, pageHeightPt: number, dpi: number): RenderPlan {
  const w1 = Math.max(1, pageWidthPt);
  const h1 = Math.max(1, pageHeightPt);
  let scale = dpi / 72;
  let capped = false;
  const pixels = w1 * scale * (h1 * scale);
  if (pixels > MAX_RENDER_PIXELS) {
    scale = Math.sqrt(MAX_RENDER_PIXELS / (w1 * h1));
    capped = true;
  }
  return {
    scale,
    width: Math.max(1, Math.floor(w1 * scale)),
    height: Math.max(1, Math.floor(h1 * scale)),
    pdfWidth: Math.round(w1 * 100) / 100,
    pdfHeight: Math.round(h1 * 100) / 100,
    capped,
  };
}

/** Target size for the in-memory "original" preview image. */
export function previewSize(width: number, height: number): { width: number; height: number } {
  if (width <= PREVIEW_MAX_WIDTH) return { width, height };
  const k = PREVIEW_MAX_WIDTH / width;
  return { width: PREVIEW_MAX_WIDTH, height: Math.max(1, Math.round(height * k)) };
}
