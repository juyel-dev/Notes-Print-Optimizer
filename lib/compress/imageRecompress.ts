/**
 * imageRecompress — "Keep text" engine.
 *
 * Walks a pdf-lib document, finds the embedded raster images we can safely
 * re-encode (8-bit RGB/gray JPEG or Flate), and swaps their streams for smaller
 * JPEGs. Text, fonts and vector graphics are never touched, so everything stays
 * selectable and sharp. Anything unusual (masks, palettes, CMYK, 16-bit …) is
 * skipped rather than risked.
 */

import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
  type PDFDocument,
} from 'pdf-lib';
import type { EncodeVariant, ImageCodec, ImageSource } from './codec';
import { MAX_COMPRESS_SAMPLE_IMAGES, evenSample } from './types';

/** Images smaller than this are not worth the decode/encode round trip. */
export const MIN_IMAGE_BYTES = 12 * 1024;
/** A replacement must be at least this much smaller, otherwise the original is kept. */
export const KEEP_ORIGINAL_ABOVE = 0.92;

export interface ImageCandidate {
  ref: PDFRef;
  stream: PDFRawStream;
  kind: 'jpeg' | 'flate';
  width: number;
  height: number;
  /** Components in the stored samples (1 gray, 3 RGB). */
  channels: 1 | 3;
  origBytes: number;
  /** True when the existing /ColorSpace is already a valid 3-component space. */
  keepColorSpace: boolean;
  /** PNG predictor parameters for Flate images (1 = none). */
  predictor: number;
}

const N = (s: string) => PDFName.of(s);

function nameOf(obj: unknown): string | null {
  return obj instanceof PDFName ? obj.asString().replace(/^\//, '') : null;
}

function numberOf(obj: unknown): number | null {
  return obj instanceof PDFNumber ? obj.asNumber() : null;
}

function filterNames(dict: PDFDict): string[] | null {
  const f = dict.lookup(N('Filter'));
  if (f instanceof PDFName) return [nameOf(f)!];
  if (f instanceof PDFArray) {
    const names: string[] = [];
    for (let i = 0; i < f.size(); i++) {
      const n = nameOf(f.lookup(i));
      if (!n) return null;
      names.push(n);
    }
    return names;
  }
  return f === undefined ? [] : null;
}

/** 1 / 3 when the colour space is a plain gray/RGB we can reproduce, else null. */
function colorChannels(dict: PDFDict): { channels: 1 | 3; keep: boolean } | null {
  const cs = dict.lookup(N('ColorSpace'));
  const n = nameOf(cs);
  if (n === 'DeviceRGB' || n === 'CalRGB') return { channels: 3, keep: true };
  if (n === 'DeviceGray' || n === 'CalGray') return { channels: 1, keep: false };
  if (cs instanceof PDFArray && nameOf(cs.lookup(0)) === 'ICCBased') {
    const prof = cs.lookup(1);
    const comps = prof instanceof PDFStream ? numberOf(prof.dict.lookup(N('N'))) : null;
    if (comps === 3) return { channels: 3, keep: true };
    if (comps === 1) return { channels: 1, keep: false };
  }
  return null;
}

function predictorOf(dict: PDFDict): { predictor: number; colors: number; bpc: number; columns: number } {
  let p = dict.lookup(N('DecodeParms'));
  if (p instanceof PDFArray) p = p.lookup(0);
  if (!(p instanceof PDFDict)) return { predictor: 1, colors: 1, bpc: 8, columns: 1 };
  return {
    predictor: numberOf(p.lookup(N('Predictor'))) ?? 1,
    colors: numberOf(p.lookup(N('Colors'))) ?? 1,
    bpc: numberOf(p.lookup(N('BitsPerComponent'))) ?? 8,
    columns: numberOf(p.lookup(N('Columns'))) ?? 1,
  };
}

/** Finds every image we can safely re-encode. Pure read — nothing is modified. */
export function collectImageCandidates(doc: PDFDocument, minBytes: number = MIN_IMAGE_BYTES): ImageCandidate[] {
  const out: ImageCandidate[] = [];
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (nameOf(dict.lookup(N('Subtype'))) !== 'Image') continue;

    const origBytes = obj.getContentsSize();
    if (origBytes < minBytes) continue;
    if (dict.has(N('Mask')) || dict.has(N('Decode'))) continue;
    const imageMask = dict.lookup(N('ImageMask'));
    if (imageMask && String(imageMask) === 'true') continue;
    if ((numberOf(dict.lookup(N('BitsPerComponent'))) ?? 8) !== 8) continue;

    const filters = filterNames(dict);
    if (!filters || filters.length !== 1) continue;
    const kind = filters[0] === 'DCTDecode' ? 'jpeg' : filters[0] === 'FlateDecode' ? 'flate' : null;
    if (!kind) continue;

    const width = numberOf(dict.lookup(N('Width')));
    const height = numberOf(dict.lookup(N('Height')));
    if (!width || !height) continue;
    const cc = colorChannels(dict);
    if (!cc) continue;

    let predictor = 1;
    if (kind === 'flate') {
      const p = predictorOf(dict);
      // Only PNG predictors (10–15) and "none" are understood; TIFF predictor 2 is skipped.
      if (p.predictor !== 1 && (p.predictor < 10 || p.predictor > 15)) continue;
      if (p.predictor >= 10 && (p.colors !== cc.channels || p.bpc !== 8 || p.columns !== width)) continue;
      predictor = p.predictor;
    }
    out.push({ ref, stream: obj, kind, width, height, channels: cc.channels, origBytes, keepColorSpace: cc.keep, predictor });
  }
  return out;
}

/** Reverses PNG row filters (None/Sub/Up/Average/Paeth) used by Flate predictors 10–15. */
export function undoPngPredictor(data: Uint8Array, columns: number, colors: number, bpc: number): Uint8Array {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowBytes = Math.ceil((columns * colors * bpc) / 8);
  const rows = Math.floor(data.length / (rowBytes + 1));
  const out = new Uint8Array(rows * rowBytes);
  for (let r = 0; r < rows; r++) {
    const src = r * (rowBytes + 1);
    const filter = data[src];
    const dst = r * rowBytes;
    const prev = dst - rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const x = data[src + 1 + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = r > 0 ? out[prev + i] : 0;
      const c = r > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let v: number;
      switch (filter) {
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: v = x;
      }
      out[dst + i] = v & 255;
    }
  }
  return out;
}

/** Reads the pixels (or the JPEG bytes) of a candidate; null when it cannot be decoded safely. */
export function readSource(c: ImageCandidate): ImageSource | null {
  if (c.kind === 'jpeg') return { kind: 'jpeg', bytes: c.stream.getContents() };
  try {
    let data = decodePDFRawStream(c.stream).decode();
    if (c.predictor >= 10) data = undoPngPredictor(data, c.width, c.channels, 8);
    if (data.length < c.width * c.height * c.channels) return null;
    return { kind: 'raw', width: c.width, height: c.height, channels: c.channels, data };
  } catch {
    return null;
  }
}

export interface RecompressProgress {
  done: number;
  total: number;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Processing cancelled.');
}

/** Lets the UI breathe between images (cooperative multitasking on the main thread). */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export interface LevelEstimate {
  /** Total bytes of ALL eligible images before recompression. */
  eligibleBytes: number;
  /** Predicted total bytes of those images after, per variant (same order as the input variants). */
  afterBytes: number[];
  imageCount: number;
  sampled: number;
}

/**
 * Predicts what the eligible images would weigh at each variant by actually
 * encoding a sample (≤ 40 images, evenly spaced) and scaling by byte share.
 * An image is only counted as shrunk when we would really replace it.
 */
export async function estimateImageLevels(
  doc: PDFDocument,
  codec: ImageCodec,
  variants: EncodeVariant[],
  opts: { signal?: AbortSignal; onProgress?: (p: RecompressProgress) => void; maxImages?: number } = {},
): Promise<LevelEstimate> {
  const all = collectImageCandidates(doc);
  const eligibleBytes = all.reduce((n, c) => n + c.origBytes, 0);
  const picks = evenSample(all.length, opts.maxImages ?? MAX_COMPRESS_SAMPLE_IMAGES).map((i) => all[i]);
  const sampleOrig = picks.reduce((n, c) => n + c.origBytes, 0);
  const sums = variants.map(() => 0);

  let done = 0;
  for (const c of picks) {
    throwIfAborted(opts.signal);
    const src = readSource(c);
    if (!src) {
      variants.forEach((_, i) => (sums[i] += c.origBytes));
    } else {
      const enc = await codec.encode(src, variants);
      enc.forEach((e, i) => (sums[i] += e.bytes.length <= c.origBytes * KEEP_ORIGINAL_ABOVE ? e.bytes.length : c.origBytes));
    }
    opts.onProgress?.({ done: ++done, total: picks.length });
    await yieldToUi();
  }

  const k = sampleOrig > 0 ? eligibleBytes / sampleOrig : 1;
  return { eligibleBytes, afterBytes: sums.map((s) => Math.round(s * k)), imageCount: all.length, sampled: picks.length };
}

/** Re-encodes every eligible image at one variant, in place. Returns what changed. */
export async function applyImageRecompression(
  doc: PDFDocument,
  codec: ImageCodec,
  variant: EncodeVariant,
  opts: { signal?: AbortSignal; onProgress?: (p: RecompressProgress) => void } = {},
): Promise<{ replaced: number; total: number; savedBytes: number }> {
  const all = collectImageCandidates(doc);
  let replaced = 0;
  let savedBytes = 0;
  let done = 0;

  for (const c of all) {
    throwIfAborted(opts.signal);
    const src = readSource(c);
    if (src) {
      const [enc] = await codec.encode(src, [variant]);
      if (enc.bytes.length <= c.origBytes * KEEP_ORIGINAL_ABOVE) {
        const dict = c.stream.dict.clone(doc.context);
        dict.set(N('Filter'), N('DCTDecode'));
        dict.delete(N('DecodeParms'));
        dict.set(N('Width'), PDFNumber.of(enc.width));
        dict.set(N('Height'), PDFNumber.of(enc.height));
        dict.set(N('BitsPerComponent'), PDFNumber.of(8));
        if (!c.keepColorSpace) dict.set(N('ColorSpace'), N('DeviceRGB')); // output JPEG is always 3-component
        dict.set(N('Length'), PDFNumber.of(enc.bytes.length));
        doc.context.assign(c.ref, PDFRawStream.of(dict, enc.bytes));
        replaced++;
        savedBytes += c.origBytes - enc.bytes.length;
      }
    }
    opts.onProgress?.({ done: ++done, total: all.length });
    await yieldToUi();
  }
  return { replaced, total: all.length, savedBytes };
}
