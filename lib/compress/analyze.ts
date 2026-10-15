/**
 * analyze — a fast look inside a PDF to choose the best compression mode.
 */

import { PDFDocument } from 'pdf-lib';
import { collectImageCandidates } from './imageRecompress';
import { openPdfjs } from './flatten';
import { evenSample, type CompressMode } from './types';

export interface PdfAnalysis {
  fileBytes: number;
  pageCount: number;
  /** Share (0–1) of sampled pages that carry real selectable text. */
  textPageRatio: number;
  imageCount: number;
  /** Bytes of embedded images we can shrink while keeping the text. */
  eligibleBytes: number;
  eligibleShare: number;
  recommendedMode: CompressMode;
  /** One plain-language sentence explaining the recommendation. */
  reason: string;
}

export function friendlyOpenError(err: unknown, name: string): Error {
  const n = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  const msg = err instanceof Error ? err.message : '';
  if (n === 'PasswordException' || n === 'EncryptedPDFError' || /encrypt|password/i.test(msg)) {
    return new Error(`"${name}" is password-protected. Remove the password first, then compress it.`);
  }
  return new Error(`"${name}" looks damaged or is not a valid PDF.`);
}

export function recommend(fileBytes: number, eligibleBytes: number, textRatio: number): { mode: CompressMode; reason: string } {
  const share = fileBytes > 0 ? eligibleBytes / fileBytes : 0;
  if (share >= 0.4) {
    return {
      mode: 'smart',
      reason:
        textRatio < 0.3
          ? 'This looks like a scan or photo-based PDF. We can shrink the page images and keep everything else untouched.'
          : 'Most of the size is images. We can shrink them and keep every word selectable.',
    };
  }
  if (fileBytes < 300 * 1024) {
    return { mode: 'smart', reason: 'This file is already small. A light pass is all it needs.' };
  }
  return {
    mode: 'flatten',
    reason:
      'The size here is not mostly photos we can shrink in place. Flatten pages gives the biggest saving, but text stops being selectable.',
  };
}

export async function analyzePdf(bytes: Uint8Array, name: string, signal?: AbortSignal): Promise<{ analysis: PdfAnalysis; doc: PDFDocument }> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes.slice(0), { updateMetadata: false });
  } catch (err) {
    throw friendlyOpenError(err, name);
  }
  if (signal?.aborted) throw new Error('Processing cancelled.');

  const pageCount = doc.getPageCount();
  if (pageCount === 0) throw new Error(`"${name}" has no pages.`);
  const candidates = collectImageCandidates(doc);
  const eligibleBytes = candidates.reduce((n, c) => n + c.origBytes, 0);

  // Text sample: up to 6 evenly spaced pages. Failure here only weakens the recommendation.
  let textPageRatio = 0;
  try {
    const pdfjsDoc = await openPdfjs(bytes);
    try {
      const idx = evenSample(pdfjsDoc.numPages, 6);
      let withText = 0;
      for (const i of idx) {
        const page = await pdfjsDoc.getPage(i + 1);
        const tc = await page.getTextContent();
        const chars = tc.items.reduce((n: number, it) => n + ('str' in it ? it.str.trim().length : 0), 0);
        if (chars >= 25) withText++;
        page.cleanup();
      }
      textPageRatio = idx.length ? withText / idx.length : 0;
    } finally {
      await pdfjsDoc.destroy();
    }
  } catch {
    textPageRatio = 0;
  }

  const rec = recommend(bytes.length, eligibleBytes, textPageRatio);
  return {
    analysis: {
      fileBytes: bytes.length,
      pageCount,
      textPageRatio,
      imageCount: candidates.length,
      eligibleBytes,
      eligibleShare: bytes.length > 0 ? eligibleBytes / bytes.length : 0,
      recommendedMode: rec.mode,
      reason: rec.reason,
    },
    doc,
  };
}
