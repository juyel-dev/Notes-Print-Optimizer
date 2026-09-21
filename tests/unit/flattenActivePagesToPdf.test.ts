import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PdfExporter } from '../../lib/optimizer/pdfExporter';
import { memoryManager } from '../../lib/optimizer/memoryManager';
import type { ProcessedPage } from '../../lib/optimizer/types';

function makeProcessedPage(pageIndex: number, overrides: Partial<ProcessedPage> = {}): ProcessedPage {
  return {
    pageIndex,
    thumbnailDataUrl: '',
    width: 40,
    height: 30,
    inkCoverageBeforePct: 50,
    inkCoverageAfterPct: 10,
    profile: {} as ProcessedPage['profile'],
    parameters: {} as ProcessedPage['parameters'],
    ...overrides,
  };
}

/** A real, minimal, valid 2x2 white JPEG — pdf-lib's embedJpg parses real
 *  JPEG segments (SOF marker, quantization tables), so a hand-rolled fake
 *  header isn't enough; this is an actual encoded image. */
const FAKE_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==';

function fakeJpegBytes(): Uint8Array {
  const bin = atob(FAKE_JPEG_BASE64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PdfExporter.flattenActivePagesToPdf', () => {
  it('embeds every active page as its own full-size PDF page, no grid/margins/decoration', async () => {
    const fakeCanvas = {
      width: 40,
      height: 30,
      getContext: () => ({ putImageData: () => {} }),
      toBlob: (cb: BlobCallback) => cb({ arrayBuffer: async () => fakeJpegBytes().buffer, size: fakeJpegBytes().length } as Blob),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(memoryManager, 'acquireCanvas').mockReturnValue(fakeCanvas);
    vi.spyOn(memoryManager, 'disposeCanvas').mockImplementation(() => {});
    vi.spyOn(memoryManager, 'yieldToUI').mockResolvedValue(undefined);

    const pages = [makeProcessedPage(0), makeProcessedPage(1), makeProcessedPage(2)];
    const { bytes, pageCount } = await PdfExporter.flattenActivePagesToPdf(pages);

    expect(pageCount).toBe(3);
    // Round-trip through pdf-lib to confirm the bytes are a real, loadable
    // PDF — not just a page-count number that happens to match.
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(3);
  });

  it('reports progress once per page', async () => {
    const fakeCanvas = {
      width: 10, height: 10,
      getContext: () => ({ putImageData: () => {} }),
      toBlob: (cb: BlobCallback) => cb({ arrayBuffer: async () => fakeJpegBytes().buffer, size: fakeJpegBytes().length } as Blob),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(memoryManager, 'acquireCanvas').mockReturnValue(fakeCanvas);
    vi.spyOn(memoryManager, 'disposeCanvas').mockImplementation(() => {});
    vi.spyOn(memoryManager, 'yieldToUI').mockResolvedValue(undefined);

    const onProgress = vi.fn();
    await PdfExporter.flattenActivePagesToPdf([makeProcessedPage(0), makeProcessedPage(1)], undefined, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it('never produces an unopenable 0-page PDF for an empty page list', async () => {
    // pdf-lib itself inserts a blank page on save() if the document would
    // otherwise have zero pages (a 0-page PDF isn't valid per spec) —
    // confirmed directly against pdf-lib's own behavior, not assumed. In
    // practice this path shouldn't be reached: WorkflowView.tsx guards
    // against calling this with an empty activePages list before it ever
    // gets here. This test documents what happens if that guard is ever
    // removed or bypassed — a valid (if pointless) PDF, not a crash.
    const { bytes, pageCount } = await PdfExporter.flattenActivePagesToPdf([]);
    expect(pageCount).toBe(1);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
  });
});

describe('PdfExporter.resolveFinalPageImage', () => {
  it('falls back to a blank page at the recorded dimensions when no image data is available', async () => {
    const page = makeProcessedPage(0, { width: 20, height: 15 });
    const img = await PdfExporter.resolveFinalPageImage(page);
    expect(img.width).toBe(20);
    expect(img.height).toBe(15);
    // Blank fallback is solid white — every RGBA byte should be 255.
    expect(Array.from(img.data.slice(0, 16)).every((b) => b === 255)).toBe(true);
  });

  it('does not attempt a kept-original swap when mergedPdfBytes is not provided', async () => {
    const page = makeProcessedPage(0);
    const keepOriginalPages = new Set([0]);
    // No mergedPdfBytes → must not throw trying to render from it, and
    // must still return a valid blank-fallback image.
    const img = await PdfExporter.resolveFinalPageImage(page, { keepOriginalPages });
    expect(img.width).toBe(page.width);
    expect(img.height).toBe(page.height);
  });
});
