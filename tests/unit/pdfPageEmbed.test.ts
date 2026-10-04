import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  drawBilevelImage,
  isBilevelRgba,
  packBilevel1bpp,
  pageSizeFromSource,
  readSourceWidthsPt,
} from '../../lib/optimizer/pdfPageEmbed';

function img(w: number, h: number, fn: (x: number, y: number) => number): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

describe('isBilevelRgba', () => {
  it('accepts pure black/white', () => {
    expect(isBilevelRgba(img(8, 8, (x) => (x % 2 ? 255 : 0)).data)).toBe(true);
  });
  it('rejects any grey or coloured pixel', () => {
    expect(isBilevelRgba(img(8, 8, (x) => (x === 3 ? 254 : 255)).data)).toBe(false);
    const c = img(4, 4, () => 255);
    c.data[1] = 200;
    expect(isBilevelRgba(c.data)).toBe(false);
  });
});

describe('packBilevel1bpp', () => {
  it('packs MSB-first with 1 = white and pads rows to whole bytes', () => {
    // 10 px wide -> 2 bytes/row. Row 0: first pixel white, rest black.
    const p = packBilevel1bpp(img(10, 2, (x, y) => (y === 0 && x === 0 ? 255 : 0)));
    expect(p.length).toBe(4);
    expect(p[0]).toBe(0b10000000);
    expect(p[1]).toBe(0);
    expect(p[2]).toBe(0);
  });
});

describe('pageSizeFromSource', () => {
  it('uses the source width and keeps aspect (render 1920x1080 of a 1280pt slide)', () => {
    const s = pageSizeFromSource({ width: 1920, height: 1080 }, 1280);
    expect(s.width).toBe(1280);
    expect(s.height).toBe(720);
  });
  it('banner crop (fewer rows) keeps a uniform scale', () => {
    const s = pageSizeFromSource({ width: 1920, height: 1000 }, 1280);
    expect(s.height).toBeCloseTo(1000 * (1280 / 1920), 6);
  });
  it('falls back to 1 px = 1 pt when the source width is unknown', () => {
    expect(pageSizeFromSource({ width: 800, height: 600 }, undefined)).toEqual({ width: 800, height: 600 });
    expect(pageSizeFromSource({ width: 800, height: 600 }, 0)).toEqual({ width: 800, height: 600 });
  });
});

describe('readSourceWidthsPt', () => {
  it('reads widths in points and swaps for rotated pages', async () => {
    const d = await PDFDocument.create();
    d.addPage([1280, 720]);
    const rot = d.addPage([600, 800]);
    rot.setRotation({ type: 'degrees' as never, angle: 90 } as never);
    const w = await readSourceWidthsPt(await d.save());
    expect(w[0]).toBe(1280);
    expect(w[1]).toBe(800);
  });
  it('returns [] for missing or garbage input', async () => {
    expect(await readSourceWidthsPt(null)).toEqual([]);
    expect(await readSourceWidthsPt(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe('drawBilevelImage', () => {
  it('writes a 1-bit DeviceGray image that is far smaller than raw RGBA and round-trips', async () => {
    const w = 1920, h = 1080;
    const src = img(w, h, (x, y) => ((x >> 5) + (y >> 5)) % 7 === 0 ? 0 : 255);
    const doc = await PDFDocument.create();
    const page = doc.addPage([1280, 720]);
    drawBilevelImage(doc, page, src);
    const bytes = await doc.save();
    expect(bytes.length).toBeLessThan(w * h * 4 * 0.02);

    const re = await PDFDocument.load(bytes);
    const p0 = re.getPage(0);
    expect(p0.getSize()).toEqual({ width: 1280, height: 720 });
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).toContain('/BitsPerComponent 1');
    expect(text).toContain('/DeviceGray');
    expect(text).toContain('/FlateDecode');
    expect(text).toContain(`/Width ${w}`);
  });
});
