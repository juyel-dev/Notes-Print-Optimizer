/**
 * Page embedding for the exported PDF: correct physical page size and
 * lossless 1-bit encoding for pure black/white pages.
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

/** Pack to 1 bit/pixel, rows padded to whole bytes, 1 = white (DeviceGray). */
export function packBilevel1bpp(img: PixelImage): Uint8Array {
  const rowBytes = (img.width + 7) >> 3;
  const out = new Uint8Array(rowBytes * img.height);
  for (let y = 0; y < img.height; y++) {
    const row = y * rowBytes;
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4] > 127) out[row + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
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
export function drawBilevelImage(pdfDoc: PDFDocument, page: PDFPage, img: PixelImage): void {
  const stream = pdfDoc.context.flateStream(packBilevel1bpp(img), {
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
