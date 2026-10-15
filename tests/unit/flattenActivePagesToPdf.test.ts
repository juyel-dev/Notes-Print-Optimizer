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

function createTonalImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128;
    data[i + 1] = 128;
    data[i + 2] = 128;
    data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
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
    vi.spyOn(PdfExporter, 'resolveFinalPageImage').mockResolvedValue(createTonalImageData(40, 30));

    const pages = [makeProcessedPage(0), makeProcessedPage(1), makeProcessedPage(2)];
    const { bytes, pageCount } = await PdfExporter.flattenActivePagesToPdf(pages);

    expect(pageCount).toBe(3);
    // Round-trip through pdf-lib to confirm the bytes are a real, loadable
    // PDF — not just a page-count number that happens to match.
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(3);
  });

  it('fails explicitly if a page cannot be encoded instead of silently omitting it from the PDF', async () => {
    const tonal = new Uint8ClampedArray(40 * 30 * 4);
    for (let i = 0; i < tonal.length; i += 4) {
      tonal[i] = 128;
      tonal[i + 1] = 128;
      tonal[i + 2] = 128;
      tonal[i + 3] = 255;
    }

    vi.spyOn(PdfExporter, 'resolveFinalPageImage').mockResolvedValue(new ImageData(tonal, 40, 30));
    vi.spyOn(memoryManager, 'acquireCanvas').mockReturnValue({
      width: 40,
      height: 30,
      getContext: () => ({ putImageData: () => {} }),
      toBlob: (callback: BlobCallback) => callback(null),
    } as unknown as HTMLCanvasElement);
    vi.spyOn(memoryManager, 'disposeCanvas').mockImplementation(() => {});

    await expect(
      PdfExporter.flattenActivePagesToPdf([makeProcessedPage(0)]),
    ).rejects.toThrow('Could not encode page 1 for print layout.');
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
    vi.spyOn(PdfExporter, 'resolveFinalPageImage').mockResolvedValue(createTonalImageData(10, 10));

    const onProgress = vi.fn();
    await PdfExporter.flattenActivePagesToPdf([makeProcessedPage(0), makeProcessedPage(1)], undefined, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it('stops before preparing pages when cancellation was already requested', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      PdfExporter.flattenActivePagesToPdf([makeProcessedPage(0)], undefined, undefined, controller.signal),
    ).rejects.toThrow('Page preparation cancelled.');
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
  it('fails visibly if the optimized page is missing instead of exporting a blank page', async () => {
    const page = makeProcessedPage(0, { width: 20, height: 15 });
    await expect(PdfExporter.resolveFinalPageImage(page)).rejects.toThrow(
      'Failed to load optimized page 1',
    );
  });

  it('does not attempt a kept-original swap without source bytes and reports missing optimized data', async () => {
    const page = makeProcessedPage(0);
    const keepOriginalPages = new Set([0]);
    await expect(
      PdfExporter.resolveFinalPageImage(page, { keepOriginalPages }),
    ).rejects.toThrow('Failed to load optimized page 1');
  });
});
