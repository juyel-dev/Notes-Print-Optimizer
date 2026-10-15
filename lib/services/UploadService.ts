import { memoryManager } from '../optimizer/memoryManager';
import type { UploadedPdfItem } from '../workflow/types';

/** @deprecated Use UploadedPdfItem from workflow/types.ts */
export type UploadedItem = UploadedPdfItem;

export const MAX_FILE_SIZE_MB = 100;
export const MAX_TOTAL_SIZE_MB = 500;

// Keep uploaded item keys unique when users append another batch with repeated filenames.
let uploadBatchSequence = 0;

/**
 * Sniffs the leading bytes of a File for the PDF magic marker (%PDF-).
 * The PDF spec allows up to 1024 bytes of leading garbage, so scan the
 * first kilobyte rather than only the first five bytes.
 */
export async function isLikelyPdfFile(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  for (let i = 0; i + 4 < head.length; i++) {
    if (
      head[i] === 0x25 && head[i + 1] === 0x50 &&
      head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}

export interface PdfValidationResult {
  validFiles: File[];
  skipped: string[];
  error: string | null;
}

/** What a dropzone accepts: dialog filter copy + the validator that gates uploads. */
export interface DropzoneAccept {
  /** `accept` attribute for the hidden file input, e.g. 'application/pdf,.pdf'. */
  input: string;
  /** Plural noun used in skip/error copy ('PDFs', 'images'). */
  noun: string;
  /** Same contract as validatePdfFiles. */
  validate: (files: File[], maxFiles: number) => Promise<PdfValidationResult>;
}

/** Default: the original PDF-only behavior every existing tool relies on. */
export const PDF_DROPZONE_ACCEPT: DropzoneAccept = {
  input: 'application/pdf,.pdf',
  noun: 'PDFs',
  validate: validatePdfFiles,
};

/**
 * Shared validator for PDF uploads — used by both the main UploadArea
 * and the Enhance tool. Keeps per-file / total-size / magic-byte checks
 * in one place so limits stay consistent.
 */
export async function validatePdfFiles(files: File[], maxFiles = 10): Promise<PdfValidationResult> {
  const validFiles: File[] = [];
  const skipped: string[] = [];
  let totalSize = 0;

  for (const file of files) {
    if (validFiles.length >= maxFiles) {
      skipped.push(`${file.name} (over ${maxFiles} file limit)`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      skipped.push(`${file.name} (over ${MAX_FILE_SIZE_MB} MB)`);
      continue;
    }
    const looksLikePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isPdf = looksLikePdf && (await isLikelyPdfFile(file));
    if (!isPdf) {
      skipped.push(file.name);
      continue;
    }
    validFiles.push(file);
    totalSize += file.size;
  }

  if (totalSize > MAX_TOTAL_SIZE_MB * 1024 * 1024) {
    return {
      validFiles: [],
      skipped,
      error: `Combined size exceeds the ${MAX_TOTAL_SIZE_MB} MB limit. Please upload fewer or smaller files.`,
    };
  }

  return { validFiles, skipped, error: null };
}

export class UploadService {
  static async readFiles(files: File[]): Promise<UploadedItem[]> {
    const batchId = ++uploadBatchSequence;
    let counter = 0;
    const items: UploadedItem[] = [];
    for (const file of files) {
      counter++;
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        throw new Error(`"${file.name}" exceeds the ${MAX_FILE_SIZE_MB} MB per-file limit.`);
      }
      const buffer = await file.arrayBuffer();
      items.push({
        id: `file-${batchId}-${counter}-${file.name.replace(/[^a-zA-Z0-9]/g, '')}`,
        file, name: file.name,
        sizeMB: (file.size / (1024 * 1024)).toFixed(2),
        arrayBuffer: buffer,
      });
    }
    return items;
  }

  static async mergeAndPreview(items: UploadedItem[]): Promise<{ pdfBlob: Blob; pdfBytes: Uint8Array; thumbnails: string[] } | null> {
    if (items.length === 0) return null;
    // Defer pdf-lib (via PdfExporter) until a merge is actually requested.
    const { PdfExporter } = await import('../optimizer/pdfExporter');
    const buffers = items.map(it => it.arrayBuffer);
    const { pdfBytes, pdfBlob } = await PdfExporter.mergePdfBuffers(buffers);
    const pdfjsLib = await PdfExporter.initPdfJs();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) });
    type LoadedPdf = Awaited<typeof loadingTask.promise>;

    let pdfDoc: LoadedPdf | null = null;
    let canvas: HTMLCanvasElement | null = null;
    const thumbnails: string[] = [];

    try {
      pdfDoc = await loadingTask.promise;
      const renderCount = Math.min(pdfDoc.numPages, 12);
      for (let i = 1; i <= renderCount; i++) {
        const page = await pdfDoc.getPage(i);
        try {
          const viewport = page.getViewport({ scale: 0.3 });
          canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not initialize a PDF preview canvas.');

          await page.render({ canvasContext: ctx, viewport }).promise;
          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas!.toBlob((encoded) => {
              if (encoded && encoded.size > 0) resolve(encoded);
              else reject(new Error('Could not encode a PDF preview thumbnail.'));
            }, 'image/jpeg', 0.6);
          });
          thumbnails.push(memoryManager.createTrackedBlobUrl(blob));
        } finally {
          try { page.cleanup(); } catch { /* page may already be cleaned up */ }
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
            canvas = null;
          }
        }
      }
      return { pdfBlob, pdfBytes, thumbnails };
    } catch (error) {
      thumbnails.forEach((url) => memoryManager.revokeBlobUrl(url));
      throw error;
    } finally {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      if (pdfDoc) {
        try { await pdfDoc.destroy(); } catch { /* best-effort PDF.js cleanup */ }
      }
    }
  }
}
