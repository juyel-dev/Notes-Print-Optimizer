/**
 * flatten — "Flatten pages" engine. Each page is rendered once to a 150-DPI
 * master JPEG (pdf.js), then re-encoded from that master at any level without
 * touching pdf.js again, and finally rebuilt into a PDF with pdf-lib.
 * Smallest possible output, at the price of selectable text.
 */

import { PDFDocument } from 'pdf-lib';
import { getPdfjsLib } from '@/lib/optimizer/pdfjsLoader';
import { memoryManager } from '@/lib/optimizer/memoryManager';
import { planRender } from '@/lib/enhance/renderPlan';
import type { EncodedImage, ImageCodec } from './codec';

export const MASTER_DPI = 150;
const MASTER_QUALITY = 0.9;

export interface FlatMaster {
  bytes: Uint8Array;
  width: number;
  height: number;
  /** Original page size in PDF points. */
  pdfWidth: number;
  pdfHeight: number;
}

export interface FlatPage {
  bytes: Uint8Array;
  width: number;
  height: number;
  pdfWidth: number;
  pdfHeight: number;
}

type PdfjsDoc = Awaited<ReturnType<Awaited<ReturnType<typeof getPdfjsLib>>['getDocument']>['promise']>;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Processing cancelled.');
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob || blob.size === 0) {
          reject(new Error('Failed to encode a page image.'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function openPdfjs(bytes: Uint8Array): Promise<PdfjsDoc> {
  const pdfjs = await getPdfjsLib();
  // pdf.js transfers the buffer to its worker — always hand it a private copy.
  return pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
}

/** Renders one 1-based page to a 150-DPI master JPEG (pixel-capped for huge pages). */
export async function renderMaster(doc: PdfjsDoc, pageNumber: number, signal?: AbortSignal): Promise<FlatMaster> {
  throwIfAborted(signal);
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const plan = planRender(base.width, base.height, MASTER_DPI);
  const viewport = page.getViewport({ scale: plan.scale });
  const canvas = memoryManager.acquireCanvas(plan.width, plan.height);
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize the page canvas.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, plan.width, plan.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    throwIfAborted(signal);
    const bytes = await canvasToJpeg(canvas, MASTER_QUALITY);
    return { bytes, width: plan.width, height: plan.height, pdfWidth: plan.pdfWidth, pdfHeight: plan.pdfHeight };
  } finally {
    memoryManager.disposeCanvas(canvas);
    page.cleanup();
  }
}

/** The master's real resolution (it may be below 150 DPI for very large pages). */
function effectiveDpi(m: FlatMaster): number {
  return (m.width / Math.max(1, m.pdfWidth)) * 72;
}

/** Re-encodes a master at several (dpi, quality) variants — decoded once. */
export function encodeMaster(
  codec: ImageCodec,
  m: FlatMaster,
  variants: Array<{ dpi: number; quality: number }>,
): Promise<EncodedImage[]> {
  const eff = effectiveDpi(m);
  const longest = Math.max(m.width, m.height);
  return codec.encode(
    { kind: 'jpeg', bytes: m.bytes },
    variants.map((v) => ({ maxEdge: Math.max(64, Math.round(longest * Math.min(1, v.dpi / eff))), quality: v.quality })),
  );
}

export async function buildFlatPdf(pages: FlatPage[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setProducer('Print Optimizer');
  for (const p of pages) {
    const img = await pdf.embedJpg(p.bytes);
    const page = pdf.addPage([p.pdfWidth, p.pdfHeight]);
    page.drawImage(img, { x: 0, y: 0, width: p.pdfWidth, height: p.pdfHeight });
  }
  return pdf.save({ useObjectStreams: true });
}

/** Renders one page to a JPEG data URL for the before/after viewer. */
export async function renderPageDataUrl(bytes: Uint8Array, pageNumber: number, width = 1000): Promise<{ url: string; pageCount: number }> {
  const doc = await openPdfjs(bytes);
  try {
    const n = Math.min(Math.max(1, pageNumber), doc.numPages);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = memoryManager.acquireCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize the preview canvas.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      return { url: canvas.toDataURL('image/jpeg', 0.9), pageCount: doc.numPages };
    } finally {
      memoryManager.disposeCanvas(canvas);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
}

export { yieldToUi };
