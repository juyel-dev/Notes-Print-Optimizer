/**
 * PageThumbnails — renders page thumbnails one at a time (pdf.js) so a 300-page
 * PDF never floods memory, and measures how much ink each page has for the
 * blank-page finder. Visible pages jump the queue.
 */

import { openPdfjs } from '@/lib/compress/flatten';
import { memoryManager } from '@/lib/optimizer/memoryManager';
import { measureInk, type InkStats } from './blank';

export interface Thumb {
  url: string;
  ink: InkStats;
}

const THUMB_WIDTH = 320;

type PdfjsDoc = Awaited<ReturnType<typeof openPdfjs>>;

export class PageThumbnails {
  private doc: Promise<PdfjsDoc> | null = null;
  private thumbs = new Map<number, Thumb>();
  private pending = new Map<number, Array<(t: Thumb | null) => void>>();
  private queue: number[] = [];
  private running = false;
  private disposed = false;
  private listeners = new Set<() => void>();

  constructor(private readonly bytes: Uint8Array) {}

  get(index: number): Thumb | undefined {
    return this.thumbs.get(index);
  }

  has(index: number): boolean {
    return this.thumbs.has(index);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Ask for a thumbnail. `urgent` (on-screen) requests are rendered before background ones. */
  request(index: number, urgent = false): Promise<Thumb | null> {
    const have = this.thumbs.get(index);
    if (have) return Promise.resolve(have);
    if (this.disposed) return Promise.resolve(null);
    return new Promise((resolve) => {
      const waiting = this.pending.get(index);
      if (waiting) {
        waiting.push(resolve);
        if (urgent) {
          this.queue = this.queue.filter((i) => i !== index);
          this.queue.unshift(index);
        }
        return;
      }
      this.pending.set(index, [resolve]);
      if (urgent) this.queue.unshift(index);
      else this.queue.push(index);
      void this.pump();
    });
  }

  /** Renders every page (for the blank finder). Resolves when all are done. */
  async requestAll(count: number, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> {
    let done = 0;
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        this.request(i).then(() => {
          if (signal?.aborted) return;
          onProgress?.(++done, count);
        }),
      ),
    );
  }

  dispose(): void {
    this.disposed = true;
    this.queue = [];
    for (const waiters of this.pending.values()) waiters.forEach((r) => r(null));
    this.pending.clear();
    this.listeners.clear();
    this.thumbs.clear();
    void this.doc?.then((d) => d.destroy()).catch(() => {});
    this.doc = null;
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0 && !this.disposed) {
        const index = this.queue.shift()!;
        let thumb: Thumb | null = null;
        try {
          thumb = await this.render(index);
        } catch {
          thumb = null;
        }
        if (thumb) {
          this.thumbs.set(index, thumb);
          this.notify();
        }
        const waiters = this.pending.get(index) ?? [];
        this.pending.delete(index);
        waiters.forEach((r) => r(thumb));
        await new Promise((r) => setTimeout(r, 0)); // let the UI breathe between pages
      }
    } finally {
      this.running = false;
    }
  }

  private async render(index: number): Promise<Thumb | null> {
    if (!this.doc) this.doc = openPdfjs(this.bytes);
    const doc = await this.doc;
    if (this.disposed) return null;
    const page = await doc.getPage(index + 1);
    try {
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
      const canvas = memoryManager.acquireCanvas(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)));
      try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const ink = measureInk(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
        return { url: canvas.toDataURL('image/jpeg', 0.8), ink };
      } finally {
        memoryManager.disposeCanvas(canvas);
      }
    } finally {
      page.cleanup();
    }
  }
}
