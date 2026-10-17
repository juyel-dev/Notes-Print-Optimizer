/**
 * pageOps — pure list operations behind Organize Pages. Every function returns
 * a NEW array and never mutates its input, so the reducer can keep undo history.
 */

import { A4, addRotation, isSideways, type PageItem, type PageMeta, type Rotation } from './types';

export function rotatePages(items: readonly PageItem[], ids: ReadonlySet<string>, delta: number): PageItem[] {
  return items.map((p) => (ids.has(p.id) ? { ...p, rot: addRotation(p.rot, delta) } : p));
}

export function deletePages(items: readonly PageItem[], ids: ReadonlySet<string>): PageItem[] {
  return items.filter((p) => !ids.has(p.id));
}

/** Inserts a copy right after each selected page. `makeId` supplies fresh ids. */
export function duplicatePages(
  items: readonly PageItem[],
  ids: ReadonlySet<string>,
  makeId: () => string,
): { items: PageItem[]; copies: string[] } {
  const out: PageItem[] = [];
  const copies: string[] = [];
  for (const p of items) {
    out.push(p);
    if (ids.has(p.id)) {
      const id = makeId();
      copies.push(id);
      out.push({ ...p, id });
    }
  }
  return { items: out, copies };
}

/** Moves the selected pages one step earlier (-1) or later (+1), keeping their relative order. */
export function nudgePages(items: readonly PageItem[], ids: ReadonlySet<string>, dir: -1 | 1): PageItem[] {
  const a = items.slice();
  if (dir === -1) {
    for (let i = 1; i < a.length; i++) {
      if (ids.has(a[i].id) && !ids.has(a[i - 1].id)) [a[i - 1], a[i]] = [a[i], a[i - 1]];
    }
  } else {
    for (let i = a.length - 2; i >= 0; i--) {
      if (ids.has(a[i].id) && !ids.has(a[i + 1].id)) [a[i + 1], a[i]] = [a[i], a[i + 1]];
    }
  }
  return a;
}

/** Drag & drop: moves the selected pages (in their current order) to sit before `beforeId` (null = end). */
export function movePagesBefore(items: readonly PageItem[], ids: ReadonlySet<string>, beforeId: string | null): PageItem[] {
  if (beforeId !== null && ids.has(beforeId)) return items.slice(); // dropped onto itself
  const moving = items.filter((p) => ids.has(p.id));
  const rest = items.filter((p) => !ids.has(p.id));
  const at = beforeId === null ? rest.length : rest.findIndex((p) => p.id === beforeId);
  if (at < 0) return items.slice();
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/** Size a new blank page should take: that of the page before it (or after, or A4). */
export function blankSizeFor(items: readonly PageItem[], metas: readonly PageMeta[], index: number): PageMeta {
  const sizeOf = (p: PageItem | undefined): PageMeta | null => {
    if (!p) return null;
    const base = p.src === null ? { w: p.w ?? A4.w, h: p.h ?? A4.h } : (metas[p.src] ?? A4);
    // a blank already carries its display size; source pages swap when turned sideways
    return p.src === null ? base : isSideways(p.rot) ? { w: base.h, h: base.w } : base;
  };
  return sizeOf(items[index - 1]) ?? sizeOf(items[index]) ?? A4;
}

/** Inserts a blank page after the last selected page (or at the end when nothing is selected). */
export function insertBlank(
  items: readonly PageItem[],
  ids: ReadonlySet<string>,
  metas: readonly PageMeta[],
  id: string,
): PageItem[] {
  let at = items.length;
  for (let i = items.length - 1; i >= 0; i--) {
    if (ids.has(items[i].id)) {
      at = i + 1;
      break;
    }
  }
  const size = blankSizeFor(items, metas, at);
  const blank: PageItem = { id, src: null, rot: 0, w: size.w, h: size.h };
  return [...items.slice(0, at), blank, ...items.slice(at)];
}

/** Position-based selections (1-based position → "odd" means 1st, 3rd, 5th …). */
export function selectByParity(items: readonly PageItem[], parity: 'odd' | 'even'): string[] {
  return items.filter((_, i) => (parity === 'odd' ? i % 2 === 0 : i % 2 === 1)).map((p) => p.id);
}

export function invertSelection(items: readonly PageItem[], ids: ReadonlySet<string>): string[] {
  return items.filter((p) => !ids.has(p.id)).map((p) => p.id);
}

/** Items in current page order that are selected. */
export function selectedInOrder(items: readonly PageItem[], ids: ReadonlySet<string>): PageItem[] {
  return items.filter((p) => ids.has(p.id));
}

/** True when the list is exactly the source order with no changes. */
export function isUntouched(items: readonly PageItem[], pageCount: number): boolean {
  return items.length === pageCount && items.every((p, i) => p.src === i && p.rot === 0);
}

export interface ChangeSummary {
  kept: number;
  deleted: number;
  rotated: number;
  duplicated: number;
  blanks: number;
  moved: boolean;
}

/** Human-readable counts of what changed relative to the original document. */
export function summarize(items: readonly PageItem[], pageCount: number): ChangeSummary {
  const seen = new Set<number>();
  let duplicated = 0;
  let blanks = 0;
  let rotated = 0;
  for (const p of items) {
    if (p.src === null) blanks++;
    else if (seen.has(p.src)) duplicated++;
    else seen.add(p.src);
    if (p.rot !== 0) rotated++;
  }
  const order = items.filter((p) => p.src !== null).map((p) => p.src as number);
  const moved = order.some((v, i) => i > 0 && v < order[i - 1]);
  return { kept: seen.size, deleted: pageCount - seen.size, rotated, duplicated, blanks, moved };
}

export type { Rotation };
