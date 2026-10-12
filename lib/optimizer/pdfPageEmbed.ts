/**
 * Page embedding for the exported PDF: correct physical page size, lossless
 * 1-bit encoding for black/white content, JPEG only where a page really has
 * tones or colour (hybrid pages).
 *
 * Why this exists (found by comparing real input/output PDFs):
 *  - Pages were embedded with `addPage([canvas.width, canvas.height])`, i.e.
 *    1 render pixel = 1 PDF point. A 1280x720 pt slide rendered at ~1.5x came
 *    out as a 1920x1080 pt (26.7 x 15 in) page. "Same as original" therefore
 *    handed the printer a poster-size page that it shrank, and every
 *    downstream size/scale calculation was off by the render factor.
 *  - The processed page is pure black/white by construction, yet it was
 *    JPEG-encoded twice (q0.88 when cached, q0.9 at export). JPEG on a
 *    bilevel image rings around every stroke and is several times larger than
 *    a 1-bit Flate image of the same pixels.
 */
import {
  PDFDocument,
  PDFName,
  PDFPage,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';

export { isBilevelRgba } from './bilevel';

export interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Rec.601 luma, integer. */
function lumaAt(d: Uint8ClampedArray, i: number): number {
  return (299 * d[i] + 587 * d[i + 1] + 114 * d[i + 2]) / 1000;
}

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Pack to 1 bit/pixel, rows padded to whole bytes, 1 = white (DeviceGray).
 * Threshold at luma 127: exact for a pure B/W page and it also recovers the
 * original bilevel pixels from a JPEG-decoded copy (ringing never crosses 127
 * on a hard black/white edge). Pixels inside `whiteRects` are written white:
 * they are covered by a JPEG patch anyway and white compresses best.
 */
export function packBilevel1bpp(img: PixelImage, whiteRects: Rect[] = []): Uint8Array {
  const rowBytes = (img.width + 7) >> 3;
  const out = new Uint8Array(rowBytes * img.height);
  for (let y = 0; y < img.height; y++) {
    const row = y * rowBytes;
    for (let x = 0; x < img.width; x++) {
      if (lumaAt(img.data, (y * img.width + x) * 4) > 127) out[row + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  for (const r of whiteRects) {
    for (let y = r.y; y < Math.min(img.height, r.y + r.h); y++) {
      const row = y * rowBytes;
      for (let x = r.x; x < Math.min(img.width, r.x + r.w); x++) out[row + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * Tolerant page planning
 *
 * The export no longer sees exact pixels: processed pages are cached as JPEG,
 * so even a pure black/white page arrives with ringing and isBilevelRgba()
 * is false for it. Instead we classify 64px tiles:
 *   - "bilevel-like": no coloured pixel and <= 0.6% mid-tone pixels (luma
 *     70..240). Measured on 76 real pages after a q85 JPEG round trip: 0
 *     true-bilevel tiles missed; the few non-bilevel tiles that still qualify
 *     differ from the original in 0.0001% of pixels (isolated pixels).
 *   - anything else (restored white boxes with highlights, photos, tints) is
 *     kept as JPEG, exactly as before.
 * ------------------------------------------------------------------------- */
export const TILE = 64;
const DARK_MAX = 70;
const LIGHT_MIN = 240;
const MID_BUDGET = 0.006;
const CHROMA_MAX = 16;

export function isBilevelLikeTile(img: PixelImage, tx: number, ty: number): boolean {
  const x0 = tx * TILE, y0 = ty * TILE;
  const x1 = Math.min(img.width, x0 + TILE), y1 = Math.min(img.height, y0 + TILE);
  let n = 0, mid = 0, colored = 0;
  for (let y = y0; y < y1; y++) {
    let i = (y * img.width + x0) * 4;
    for (let x = x0; x < x1; x++, i += 4) {
      n++;
      const l = lumaAt(img.data, i);
      if (l > DARK_MAX && l < LIGHT_MIN) mid++;
      if (Math.abs(img.data[i] - img.data[i + 1]) > CHROMA_MAX || Math.abs(img.data[i + 1] - img.data[i + 2]) > CHROMA_MAX) colored++;
    }
  }
  /* Zero colour tolerance: one stray coloured pixel (a 1px dotted divider, a
     highlight edge) keeps the tile as JPEG instead of being snapped to grey. */
  return n > 0 && mid <= n * MID_BUDGET && colored === 0;
}

export type PagePlan =
  | { kind: 'bilevel' }
  | { kind: 'hybrid'; rects: Rect[] }
  | { kind: 'photo' };

/** Merge rectangles that overlap or touch until none do. */
export function mergeRects(rects: Rect[]): Rect[] {
  const out = rects.map((r) => ({ ...r }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        if (a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h) {
          const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
          out[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
          out.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Decide how to encode a page. 'bilevel': whole page as 1-bit. 'hybrid': 1-bit
 * page plus a few JPEG patches over the non-bilevel regions. 'photo': mostly
 * non-bilevel, one JPEG for the whole page (the previous behaviour).
 */
export function planPage(img: PixelImage): PagePlan {
  const tw = Math.ceil(img.width / TILE), th = Math.ceil(img.height / TILE);
  const mixed = new Uint8Array(tw * th);
  let mixedCount = 0;
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      if (!isBilevelLikeTile(img, tx, ty)) { mixed[ty * tw + tx] = 1; mixedCount++; }
    }
  }
  if (mixedCount === 0) return { kind: 'bilevel' };
  if (mixedCount > tw * th * 0.6) return { kind: 'photo' };

  // 4-connected components of mixed tiles -> bounding boxes -> merged.
  const seen = new Uint8Array(tw * th);
  const boxes: Rect[] = [];
  const stack: number[] = [];
  for (let s = 0; s < mixed.length; s++) {
    if (!mixed[s] || seen[s]) continue;
    let minX = tw, minY = th, maxX = -1, maxY = -1;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const c = stack.pop() as number;
      const cx = c % tw, cy = (c / tw) | 0;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      if (cx > 0 && mixed[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; stack.push(c - 1); }
      if (cx < tw - 1 && mixed[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; stack.push(c + 1); }
      if (cy > 0 && mixed[c - tw] && !seen[c - tw]) { seen[c - tw] = 1; stack.push(c - tw); }
      if (cy < th - 1 && mixed[c + tw] && !seen[c + tw]) { seen[c + tw] = 1; stack.push(c + tw); }
    }
    boxes.push({ x: minX * TILE, y: minY * TILE, w: (maxX - minX + 1) * TILE, h: (maxY - minY + 1) * TILE });
  }
  const rects = mergeRects(boxes).map((r) => ({
    x: r.x, y: r.y, w: Math.min(r.w, img.width - r.x), h: Math.min(r.h, img.height - r.y),
  }));
  const area = rects.reduce((a, r) => a + r.w * r.h, 0);
  if (rects.length > 12 || area > img.width * img.height * 0.65) return { kind: 'photo' };
  return { kind: 'hybrid', rects };
}

/**
 * Page size in PDF points for an image rendered from a source page.
 * Width follows the source page; height follows the image aspect, so banner
 * cropping (which only removes rows) keeps the scale uniform.
 */
export function pageSizeFromSource(
  img: { width: number; height: number },
  sourceWidthPt: number | undefined,
): { width: number; height: number } {
  if (!sourceWidthPt || !Number.isFinite(sourceWidthPt) || sourceWidthPt <= 0 || img.width <= 0) {
    return { width: img.width, height: img.height }; // legacy: 1 px = 1 pt
  }
  return { width: sourceWidthPt, height: (img.height * sourceWidthPt) / img.width };
}

/** Width (pt, rotation-aware) of every page of a source PDF; [] if unreadable. */
export async function readSourceWidthsPt(bytes: Uint8Array | null | undefined): Promise<number[]> {
  if (!bytes) return [];
  try {
    const doc = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true, updateMetadata: false });
    return doc.getPages().map((p) => {
      const { width, height } = p.getSize();
      const rot = ((p.getRotation().angle % 360) + 360) % 360;
      return rot === 90 || rot === 270 ? height : width;
    });
  } catch {
    return [];
  }
}

/**
 * Draw a pure black/white image as a 1-bit Flate DeviceGray XObject filling
 * the page. Lossless and typically 10-30x smaller than the JPEG of the same page.
 */
export function drawBilevelImage(pdfDoc: PDFDocument, page: PDFPage, img: PixelImage, whiteRects: Rect[] = []): void {
  const stream = pdfDoc.context.flateStream(packBilevel1bpp(img, whiteRects), {
    Type: 'XObject',
    Subtype: 'Image',
    Width: img.width,
    Height: img.height,
    ColorSpace: 'DeviceGray',
    BitsPerComponent: 1,
  });
  const ref = pdfDoc.context.register(stream);
  const name = page.node.newXObject('BiLvl', ref);
  const { width, height } = page.getSize();
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(width, 0, 0, height, 0, 0),
    drawObject(name as PDFName),
    popGraphicsState(),
  );
}

/** JPEG-encodes one rectangle of the page; null on failure. */
export type RectJpegEncoder = (rect: Rect) => Promise<Uint8Array | null>;

/**
 * Compose a hybrid page on `page`: the 1-bit layer first, then one JPEG patch
 * per mixed region on top. Returns false (page left untouched in content) if a
 * patch could not be encoded, so the caller can fall back to a full JPEG.
 */
export async function drawHybridPage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  img: PixelImage,
  rects: Rect[],
  encode: RectJpegEncoder,
): Promise<boolean> {
  const jpegs: Uint8Array[] = [];
  for (const r of rects) {
    const bytes = await encode(r);
    if (!bytes || bytes.length === 0) return false;
    jpegs.push(bytes);
  }
  drawBilevelImage(pdfDoc, page, img, rects);
  const { width, height } = page.getSize();
  const sx = width / img.width;
  const sy = height / img.height;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const embedded = await pdfDoc.embedJpg(jpegs[i]);
    // PDF origin is bottom-left; image rows run top-down.
    page.drawImage(embedded, { x: r.x * sx, y: height - (r.y + r.h) * sy, width: r.w * sx, height: r.h * sy });
  }
  return true;
}
