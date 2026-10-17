/**
 * organizeExport — builds the new PDF from the page list with pdf-lib.
 * Pages are copied (text, links and images stay intact); rotation is applied
 * on top of the page's own /Rotate; blank pages are fresh sheets.
 */

import { PDFDocument, degrees } from 'pdf-lib';
import type { PageItem } from './types';

export async function buildOrganizedPdf(source: Uint8Array, items: readonly PageItem[]): Promise<Uint8Array> {
  if (items.length === 0) throw new Error('There are no pages to export.');
  const src = await PDFDocument.load(source.slice(0), { updateMetadata: false });
  const out = await PDFDocument.create();
  out.setProducer('Print Optimizer');

  // Copy every distinct source page once; extra uses (duplicates) are copied again so each is independent.
  const used = new Map<number, number>();
  const firstCopies = new Map<number, Awaited<ReturnType<PDFDocument['copyPages']>>[number]>();
  const distinct = Array.from(new Set(items.filter((p) => p.src !== null).map((p) => p.src as number)));
  if (distinct.length > 0) {
    const pages = await out.copyPages(src, distinct);
    distinct.forEach((idx, i) => firstCopies.set(idx, pages[i]));
  }

  for (const item of items) {
    if (item.src === null) {
      out.addPage([item.w ?? 595.28, item.h ?? 841.89]).setRotation(degrees(item.rot));
      continue;
    }
    const n = used.get(item.src) ?? 0;
    used.set(item.src, n + 1);
    const page = n === 0 ? firstCopies.get(item.src)! : (await out.copyPages(src, [item.src]))[0];
    const base = page.getRotation().angle;
    page.setRotation(degrees((((base + item.rot) % 360) + 360) % 360));
    out.addPage(page);
  }
  return out.save({ useObjectStreams: true });
}

/** Reads the visual size (rotation-aware, in points) of every page. */
export async function readPageMetas(source: Uint8Array): Promise<{ metas: Array<{ w: number; h: number }>; pageCount: number }> {
  const doc = await PDFDocument.load(source.slice(0), { updateMetadata: false });
  const metas = doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    const turned = Math.abs(p.getRotation().angle) % 180 === 90;
    return turned ? { w: height, h: width } : { w: width, h: height };
  });
  return { metas, pageCount: metas.length };
}
