/**
 * CompressSession — one uploaded PDF: analysis, size predictions for all five
 * levels, and the final compression. Everything runs on-device.
 */

import { PDFDocument } from 'pdf-lib';
import type { ImageCodec } from './codec';
import { browserCodec } from './browserCodec';
import { analyzePdf, friendlyOpenError, type PdfAnalysis } from './analyze';
import { applyImageRecompression, estimateImageLevels } from './imageRecompress';
import { buildFlatPdf, encodeMaster, openPdfjs, renderMaster, yieldToUi, type FlatPage } from './flatten';
import { COMPRESS_LEVELS, MAX_COMPRESS_SAMPLE_PAGES, evenSample, levelSpec, type CompressLevel, type CompressMode } from './types';

export interface ProgressInfo {
  label: string;
  done: number;
  total: number;
}

export interface CompressOutcome {
  bytes: Uint8Array;
  size: number;
  mode: CompressMode;
  level: CompressLevel;
  /** True when we could not beat the original, so the original is returned untouched. */
  unchanged: boolean;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Processing cancelled.');
}

/** Predicted sizes must never grow with strength, nor exceed the original. */
export function monotonic(sizes: number[], cap: number): number[] {
  const out: number[] = [];
  let prev = cap;
  for (const s of sizes) {
    prev = Math.min(prev, Math.max(1, Math.round(s)));
    out.push(prev);
  }
  return out;
}

export class CompressSession {
  private doc: PDFDocument | null;

  private constructor(
    readonly name: string,
    readonly bytes: Uint8Array,
    readonly analysis: PdfAnalysis,
    doc: PDFDocument,
    private readonly codec: ImageCodec,
  ) {
    this.doc = doc;
  }

  static async open(name: string, bytes: Uint8Array, signal?: AbortSignal, codec: ImageCodec = browserCodec): Promise<CompressSession> {
    const { analysis, doc } = await analyzePdf(bytes, name, signal);
    return new CompressSession(name, bytes, analysis, doc, codec);
  }

  dispose(): void {
    this.doc = null;
  }

  /** Predicted output size (bytes) for levels 1..5 in the given mode. */
  async estimate(mode: CompressMode, onProgress?: (p: ProgressInfo) => void, signal?: AbortSignal): Promise<number[]> {
    const fileBytes = this.bytes.length;
    if (mode === 'smart') {
      if (!this.doc) throw new Error('Session closed.');
      const est = await estimateImageLevels(this.doc, this.codec, COMPRESS_LEVELS.map((l) => l.smart), {
        signal,
        onProgress: (p) => onProgress?.({ label: 'Sampling images', done: p.done, total: p.total }),
      });
      return monotonic(est.afterBytes.map((after) => fileBytes - est.eligibleBytes + after), fileBytes);
    }

    const pdfjs = await openPdfjs(this.bytes);
    try {
      const pages = evenSample(pdfjs.numPages, MAX_COMPRESS_SAMPLE_PAGES);
      const sums = COMPRESS_LEVELS.map(() => 0);
      let done = 0;
      for (const i of pages) {
        throwIfAborted(signal);
        const master = await renderMaster(pdfjs, i + 1, signal);
        const enc = await encodeMaster(this.codec, master, COMPRESS_LEVELS.map((l) => l.flatten));
        enc.forEach((e, k) => (sums[k] += e.bytes.length));
        onProgress?.({ label: 'Sampling pages', done: ++done, total: pages.length });
        await yieldToUi();
      }
      const k = pages.length > 0 ? pdfjs.numPages / pages.length : 1;
      // + per-page PDF overhead (xref, page dict) and a small fixed header.
      return monotonic(sums.map((s) => s * k + pdfjs.numPages * 900 + 2000), Number.MAX_SAFE_INTEGER);
    } finally {
      await pdfjs.destroy();
    }
  }

  async run(mode: CompressMode, level: CompressLevel, onProgress?: (p: ProgressInfo) => void, signal?: AbortSignal): Promise<CompressOutcome> {
    const spec = levelSpec(level);
    const original = this.bytes.length;
    let out: Uint8Array;

    if (mode === 'smart') {
      let doc: PDFDocument;
      try {
        doc = await PDFDocument.load(this.bytes.slice(0), { updateMetadata: false });
      } catch (err) {
        throw friendlyOpenError(err, this.name);
      }
      await applyImageRecompression(doc, this.codec, spec.smart, {
        signal,
        onProgress: (p) => onProgress?.({ label: 'Shrinking images', done: p.done, total: p.total }),
      });
      throwIfAborted(signal);
      onProgress?.({ label: 'Saving PDF', done: 1, total: 1 });
      out = await doc.save({ useObjectStreams: true });
    } else {
      const pdfjs = await openPdfjs(this.bytes);
      const pages: FlatPage[] = [];
      try {
        const total = pdfjs.numPages;
        for (let p = 1; p <= total; p++) {
          throwIfAborted(signal);
          onProgress?.({ label: `Page ${p} of ${total}`, done: p - 1, total });
          const master = await renderMaster(pdfjs, p, signal);
          const [enc] = await encodeMaster(this.codec, master, [spec.flatten]);
          pages.push({ bytes: enc.bytes, width: enc.width, height: enc.height, pdfWidth: master.pdfWidth, pdfHeight: master.pdfHeight });
          await yieldToUi();
        }
      } finally {
        await pdfjs.destroy();
      }
      onProgress?.({ label: 'Building PDF', done: 1, total: 1 });
      out = await buildFlatPdf(pages);
    }

    // Never hand back something bigger than what we were given.
    if (out.length >= original * 0.99) {
      return { bytes: this.bytes.slice(0), size: original, mode, level, unchanged: true };
    }
    return { bytes: out, size: out.length, mode, level, unchanged: false };
  }
}
