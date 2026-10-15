/**
 * enhanceProcessor — renders PDF pages and runs the enhance pipeline.
 *
 * Sequential, main-thread, with cooperative yielding between pages so the
 * mobile UI stays responsive. Cancellable via AbortSignal. All processing is
 * local (pdf.js render + typed-array kernels + canvas JPEG encode).
 */

import { getPdfjsLib } from '@/lib/optimizer/pdfjsLoader';
import { memoryManager } from '@/lib/optimizer/memoryManager';
import { enhanceImageData } from './enhanceKernels';
import { ENHANCE_DETAIL_DPI, type EnhancePageResult, type EnhanceSettings } from './types';
import { planRender, previewSize } from './renderPlan';
import type { UploadedPdfItem } from '@/lib/workflow/types';

const JPEG_QUALITY = 0.92;
const PREVIEW_JPEG_QUALITY = 0.85;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Processing cancelled.');
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number = JPEG_QUALITY): Promise<string> {
  return new Promise((res, rej) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size === 0) {
          rej(new Error('Failed to encode page image.'));
          return;
        }
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.onerror = () => rej(new Error('Failed to encode page image.'));
        fr.readAsDataURL(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

/** Turns pdf.js failures into messages a person can act on. */
export function friendlyPdfError(err: unknown, fileName: string): Error {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'PasswordException') {
    return new Error(`"${fileName}" is password-protected. Remove the password first, then enhance it.`);
  }
  if (name === 'InvalidPDFException' || name === 'FormatError') {
    return new Error(`"${fileName}" looks damaged or is not a valid PDF.`);
  }
  if (err instanceof Error && err.message) return err;
  return new Error(`Could not open "${fileName}".`);
}

export interface EnhanceJobProgress {
  current: number;
  total: number;
  phase: string;
}

export class EnhanceProcessor {
  /**
   * Processes every page of every uploaded file sequentially.
   * `onProgress` is invoked per page; `signal` cancels between pages.
   * Throws an Error (with a user-friendly message) on failure/cancel.
   */
  public static async process(
    items: UploadedPdfItem[],
    settings: EnhanceSettings,
    onProgress: (p: EnhanceJobProgress) => void,
    signal?: AbortSignal,
  ): Promise<EnhancePageResult[]> {
    const pdfjsLib = await getPdfjsLib();
    const results: EnhancePageResult[] = [];
    let totalPages = 0;

    const dpi = ENHANCE_DETAIL_DPI[settings.detail] ?? ENHANCE_DETAIL_DPI.standard;
    const docs: Array<{ item: UploadedPdfItem; doc: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']> }> = [];
    try {
      for (const item of items) {
        throwIfAborted(signal);
        // pdf.js transfers buffer ownership to its worker, detaching it on the
        // main thread. Slice a private copy per run so Apply & Re-Enhance can
        // safely reuse item.arrayBuffer (same guard as the main pipeline).
        try {
          const task = pdfjsLib.getDocument({ data: new Uint8Array(item.arrayBuffer.slice(0)) });
          const doc = await task.promise;
          docs.push({ item, doc });
          totalPages += doc.numPages;
        } catch (err) {
          throw friendlyPdfError(err, item.name);
        }
      }
    } catch (err) {
      for (const { doc } of docs) { try { await doc.destroy(); } catch { /* noop */ } }
      throw err;
    }

    if (totalPages === 0) {
      for (const { doc } of docs) {
        try { await doc.destroy(); } catch { /* noop */ }
      }
      throw new Error('No pages found in the selected PDFs.');
    }

    let done = 0;
    try {
      for (const { item, doc } of docs) {
        for (let p = 1; p <= doc.numPages; p++) {
          throwIfAborted(signal);
          onProgress({ current: done, total: totalPages, phase: `${item.name} · page ${p}/${doc.numPages}` });

          const page = await doc.getPage(p);
          throwIfAborted(signal);
          const base = page.getViewport({ scale: 1 });
          const plan = planRender(base.width, base.height, dpi);
          const viewport = page.getViewport({ scale: plan.scale });
          const vw = plan.width;
          const vh = plan.height;
          const canvas = memoryManager.acquireCanvas(vw, vh);
          let small: HTMLCanvasElement | null = null;
          let outCanvas: HTMLCanvasElement | null = null;
          let originalDataUrl = '';
          let dataUrl = '';

          // Always return temporary canvases to the bounded pool—even when
          // rendering, pixel processing, encoding, or cancellation throws.
          try {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error('Could not initialize the page canvas.');
            await page.render({ canvasContext: ctx, viewport }).promise;
            throwIfAborted(signal);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const enhanced = enhanceImageData(imageData, settings);
            throwIfAborted(signal);

            // Keep only a downscaled original in memory (before/after + live preview source).
            const ps = previewSize(vw, vh);
            if (ps.width === vw) {
              originalDataUrl = await canvasToDataUrl(canvas, PREVIEW_JPEG_QUALITY);
            } else {
              small = memoryManager.acquireCanvas(ps.width, ps.height);
              const sctx = small.getContext('2d');
              if (!sctx) throw new Error('Could not initialize the preview canvas.');
              sctx.imageSmoothingQuality = 'high';
              sctx.drawImage(canvas, 0, 0, ps.width, ps.height);
              originalDataUrl = await canvasToDataUrl(small, PREVIEW_JPEG_QUALITY);
            }
            throwIfAborted(signal);

            outCanvas = memoryManager.acquireCanvas(vw, vh);
            const outCtx = outCanvas.getContext('2d');
            if (!outCtx) throw new Error('Could not initialize the enhanced output canvas.');
            outCtx.putImageData(enhanced, 0, 0);
            dataUrl = await canvasToDataUrl(outCanvas);
            throwIfAborted(signal);
          } finally {
            memoryManager.disposeCanvas(small);
            memoryManager.disposeCanvas(outCanvas);
            memoryManager.disposeCanvas(canvas);
          }

          results.push({
            index: results.length,
            width: vw,
            height: vh,
            pdfWidth: plan.pdfWidth,
            pdfHeight: plan.pdfHeight,
            dataUrl,
            originalDataUrl,
          });
          done++;          await memoryManager.yieldToUI();
        }
        await doc.destroy();
      }
    } catch (err) {
      for (const { doc } of docs) { try { await doc.destroy(); } catch { /* noop */ } }
      throw err;
    }

    return results;
  }
}