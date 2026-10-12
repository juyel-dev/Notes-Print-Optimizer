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

/* ------------------------------------------------------------------ */
/* Tolerant tile planning + hybrid pages                               */
/* ------------------------------------------------------------------ */
import { PDFDocument as PDFDoc } from 'pdf-lib';
import {
  TILE,
  drawHybridPage,
  isBilevelLikeTile,
  mergeRects,
  planPage,
} from '../../lib/optimizer/pdfPageEmbed';

const TINY_JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6poA//9k=', 'base64'));

/** Page of w x h, white background, filled by fn(x,y) -> [r,g,b]. */
function rgbPage(w: number, h: number, fn: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

const W2 = TILE * 4;
const H2 = TILE * 3;
const text = (x: number, y: number): [number, number, number] => ((x >> 3) + (y >> 3)) % 5 === 0 ? [0, 0, 0] : [255, 255, 255];

describe('isBilevelLikeTile', () => {
  it('accepts exact black/white and JPEG-style ringing (a few off-by-some pixels)', () => {
    const exact = rgbPage(W2, H2, text);
    expect(isBilevelLikeTile(exact, 0, 0)).toBe(true);
    const ringing = rgbPage(W2, H2, (x, y) => {
      const [v] = text(x, y);
      // sparse ringing: ~0.2% of pixels land mid-tone, the rest are within 30 of the extreme
      if (x === 5 && y % 8 === 0) return [128, 128, 128];
      return v === 0 ? [20, 20, 20] : [248, 248, 248];
    });
    expect(isBilevelLikeTile(ringing, 0, 0)).toBe(true);
  });
  it('rejects a coloured pixel, a tint, and real tonal content', () => {
    const colored = rgbPage(W2, H2, (x, y) => (x === 10 && y === 10 ? [165, 116, 55] : text(x, y)));
    expect(isBilevelLikeTile(colored, 0, 0)).toBe(false);
    const tint = rgbPage(W2, H2, () => [230, 230, 230]);
    expect(isBilevelLikeTile(tint, 0, 0)).toBe(false);
    const photo = rgbPage(W2, H2, (x, y) => [((x * 7 + y * 3) % 200) + 20, ((x * 7 + y * 3) % 200) + 20, ((x * 7 + y * 3) % 200) + 20]);
    expect(isBilevelLikeTile(photo, 0, 0)).toBe(false);
  });
});

describe('planPage', () => {
  it('whole page bilevel -> bilevel', () => {
    expect(planPage(rgbPage(W2, H2, text))).toEqual({ kind: 'bilevel' });
  });
  it('one coloured region -> hybrid with a tile-aligned rect around it', () => {
    const img = rgbPage(W2, H2, (x, y) => (x >= TILE && x < 2 * TILE && y >= TILE && y < 2 * TILE ? [220, 40, 40] : text(x, y)));
    const plan = planPage(img);
    expect(plan.kind).toBe('hybrid');
    if (plan.kind === 'hybrid') {
      expect(plan.rects).toEqual([{ x: TILE, y: TILE, w: TILE, h: TILE }]);
    }
  });
  it('a single stray coloured pixel is still kept (never snapped to grey)', () => {
    const plan = planPage(rgbPage(W2, H2, (x, y) => (x === 70 && y === 70 ? [165, 116, 55] : text(x, y))));
    expect(plan.kind).toBe('hybrid');
  });
  it('mostly tonal page -> photo (one JPEG, previous behaviour)', () => {
    expect(planPage(rgbPage(W2, H2, (x, y) => [((x + y) % 180) + 30, ((x + y) % 180) + 30, 90])).kind).toBe('photo');
  });
});

describe('mergeRects', () => {
  it('merges overlapping and touching rects, keeps separated ones', () => {
    const out = mergeRects([
      { x: 0, y: 0, w: 64, h: 64 },
      { x: 64, y: 0, w: 64, h: 64 },
      { x: 300, y: 300, w: 64, h: 64 },
    ]);
    expect(out).toHaveLength(2);
    expect(out).toContainEqual({ x: 0, y: 0, w: 128, h: 64 });
  });
});

describe('packBilevel1bpp (luma + whiteRects)', () => {
  it('thresholds JPEG-ish near-black / near-white at 127 and whitens rects', () => {
    const img = rgbPage(16, 2, (x) => (x < 8 ? [30, 30, 30] : [240, 240, 240]));
    const p = packBilevel1bpp(img);
    expect(p[0]).toBe(0b00000000);
    expect(p[1]).toBe(0b11111111);
    const q = packBilevel1bpp(img, [{ x: 0, y: 0, w: 8, h: 1 }]);
    expect(q[0]).toBe(0b11111111); // first row whitened
    expect(q[2]).toBe(0b00000000); // second row untouched
  });
});

describe('drawHybridPage', () => {
  it('draws the 1-bit layer plus one JPEG patch per rect', async () => {
    const doc = await PDFDoc.create();
    const page = doc.addPage([W2, H2]);
    const img = rgbPage(W2, H2, text);
    const rects = [{ x: 0, y: 0, w: TILE, h: TILE }, { x: 2 * TILE, y: TILE, w: TILE, h: TILE }];
    const ok = await drawHybridPage(doc, page, img, rects, async () => TINY_JPEG);
    expect(ok).toBe(true);
    const t = Buffer.from(await doc.save()).toString('latin1');
    expect(t).toContain('/BitsPerComponent 1');
    expect((t.match(/\/DCTDecode/g) ?? []).length).toBe(2);
  });
  it('returns false and draws nothing when a patch cannot be encoded', async () => {
    const doc = await PDFDoc.create();
    const page = doc.addPage([W2, H2]);
    const ok = await drawHybridPage(doc, page, rgbPage(W2, H2, text), [{ x: 0, y: 0, w: TILE, h: TILE }], async () => null);
    expect(ok).toBe(false);
    const t = Buffer.from(await doc.save()).toString('latin1');
    expect(t).not.toContain('/DCTDecode');
    expect(t).not.toContain('/BitsPerComponent 1');
  });
});
