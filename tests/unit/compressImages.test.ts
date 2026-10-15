import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  StandardFonts,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib';
import {
  applyImageRecompression,
  collectImageCandidates,
  estimateImageLevels,
  undoPngPredictor,
} from '@/lib/compress/imageRecompress';
import { COMPRESS_LEVELS } from '@/lib/compress/types';
import { makeNoisyJpeg, makeNoisyRgb, nodeImageCodec } from '../helpers/nodeImageCodec';

const variants = COMPRESS_LEVELS.map((l) => l.smart);

async function pdfWithJpeg(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 500]);
  page.drawText('Selectable notes text', { x: 20, y: 470, size: 14, font });
  const img = await doc.embedJpg(makeNoisyJpeg(1400, 1000));
  page.drawImage(img, { x: 20, y: 40, width: 360, height: 400 });
  return doc.save();
}

/** Flate RGB image with PNG "Up" predictor (filter 2, Predictor 15) — the common real-world form. */
async function pdfWithPredictedFlate(w: number, h: number): Promise<{ bytes: Uint8Array; raw: Uint8Array }> {
  const raw = makeNoisyRgb(w, h);
  const rowBytes = w * 3;
  const filtered = new Uint8Array(h * (rowBytes + 1));
  for (let r = 0; r < h; r++) {
    filtered[r * (rowBytes + 1)] = 2;
    for (let i = 0; i < rowBytes; i++) {
      const up = r > 0 ? raw[(r - 1) * rowBytes + i] : 0;
      filtered[r * (rowBytes + 1) + 1 + i] = (raw[r * rowBytes + i] - up) & 255;
    }
  }
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  const dict = doc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: w,
    Height: h,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'FlateDecode',
    DecodeParms: { Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: w },
  });
  const ref = doc.context.register(PDFRawStream.of(dict, deflateSync(Buffer.from(filtered))));
  page.node.newXObject('Im1', ref);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(380, 0, 0, 380, 10, 10), drawObject('Im1'), popGraphicsState());
  return { bytes: await doc.save(), raw };
}

describe('undoPngPredictor', () => {
  it('reverses Sub, Up, Average and Paeth rows back to the original pixels', () => {
    const w = 7;
    const colors = 3;
    const h = 5;
    const rowBytes = w * colors;
    const raw = new Uint8Array(h * rowBytes).map((_, i) => (i * 37 + (i >> 3) * 11) & 255);
    const bpp = colors;
    const filters = [1, 2, 3, 4, 0];
    const enc = new Uint8Array(h * (rowBytes + 1));
    for (let r = 0; r < h; r++) {
      const f = filters[r];
      enc[r * (rowBytes + 1)] = f;
      for (let i = 0; i < rowBytes; i++) {
        const x = raw[r * rowBytes + i];
        const a = i >= bpp ? raw[r * rowBytes + i - bpp] : 0;
        const b = r > 0 ? raw[(r - 1) * rowBytes + i] : 0;
        const c = r > 0 && i >= bpp ? raw[(r - 1) * rowBytes + i - bpp] : 0;
        let pred = 0;
        if (f === 1) pred = a;
        else if (f === 2) pred = b;
        else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        enc[r * (rowBytes + 1) + 1 + i] = (x - pred) & 255;
      }
    }
    expect(Array.from(undoPngPredictor(enc, w, colors, 8))).toEqual(Array.from(raw));
  });
});

describe('collectImageCandidates', () => {
  it('finds a DCT image and ignores tiny ones', async () => {
    const doc = await PDFDocument.load(await pdfWithJpeg());
    const c = collectImageCandidates(doc);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe('jpeg');
    expect(c[0].width).toBe(1400);
    expect(collectImageCandidates(doc, 10 * 1024 * 1024)).toHaveLength(0);
  });

  it('understands predictor-15 Flate RGB images', async () => {
    const { bytes } = await pdfWithPredictedFlate(300, 200);
    const [c] = collectImageCandidates(await PDFDocument.load(bytes), 1);
    expect(c.kind).toBe('flate');
    expect(c.predictor).toBe(15);
    expect(c.channels).toBe(3);
  });
});

describe('estimate + apply (Keep text)', () => {
  it('predicts shrinking sizes that get smaller with every level', async () => {
    const doc = await PDFDocument.load(await pdfWithJpeg());
    const est = await estimateImageLevels(doc, nodeImageCodec, variants);
    expect(est.imageCount).toBe(1);
    expect(est.afterBytes).toHaveLength(5);
    for (let i = 1; i < 5; i++) expect(est.afterBytes[i]).toBeLessThanOrEqual(est.afterBytes[i - 1]);
    expect(est.afterBytes[4]).toBeLessThan(est.eligibleBytes * 0.5);
  });

  it('rewrites the image stream, keeps the PDF valid and the text intact, and matches the estimate', async () => {
    const original = await pdfWithJpeg();
    const est = await estimateImageLevels(await PDFDocument.load(original), nodeImageCodec, variants);

    const doc = await PDFDocument.load(original);
    const r = await applyImageRecompression(doc, nodeImageCodec, variants[2]);
    expect(r.replaced).toBe(1);
    const out = await doc.save({ useObjectStreams: true });
    expect(out.length).toBeLessThan(original.length * 0.7);

    const reread = await PDFDocument.load(out);
    const [c] = collectImageCandidates(reread, 1);
    expect(c.width).toBeLessThanOrEqual(1400);
    expect(c.stream.dict.get(PDFName.of('Filter'))).toBe(PDFName.of('DCTDecode'));
    expect(reread.getPageCount()).toBe(1);
    // text content stream is untouched
    const before = (await PDFDocument.load(original)).getPage(0).node.Contents()?.toString();
    const after = reread.getPage(0).node.Contents()?.toString();
    expect(after).toBe(before);
    // the level-3 prediction is close to what we really got (within 15%)
    const predicted = est.afterBytes[2];
    const actual = out.length - (original.length - est.eligibleBytes);
    expect(Math.abs(actual - predicted) / predicted).toBeLessThan(0.15);
  });

  it('converts predictor Flate RGB to JPEG and the pixels survive', async () => {
    const { bytes } = await pdfWithPredictedFlate(320, 240);
    const doc = await PDFDocument.load(bytes);
    const r = await applyImageRecompression(doc, nodeImageCodec, COMPRESS_LEVELS[1].smart);
    expect(r.replaced).toBe(1);
    const out = await doc.save();
    expect(out.length).toBeLessThan(bytes.length);
    const [c] = collectImageCandidates(await PDFDocument.load(out), 1);
    expect(c.kind).toBe('jpeg');
    expect(c.stream.dict.get(PDFName.of('DecodeParms'))).toBeUndefined();
    expect(c.stream.dict.get(PDFName.of('Width'))).toEqual(PDFNumber.of(c.width));
  });

  it('keeps an image when recompression would not make it meaningfully smaller', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const img = await doc.embedJpg(makeNoisyJpeg(500, 500, 0.3)); // already heavily compressed
    page.drawImage(img, { x: 0, y: 0, width: 200, height: 200 });
    const loaded = await PDFDocument.load(await doc.save());
    const r = await applyImageRecompression(loaded, nodeImageCodec, { maxEdge: 2400, quality: 0.85 });
    expect(r.replaced).toBe(0);
  });
});
