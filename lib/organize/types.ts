/**
 * Organize Pages — page model. A page is either a reference to a page of the
 * source PDF (with an extra rotation) or a blank sheet we insert.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface PageItem {
  id: string;
  /** 0-based index in the source PDF, or null for an inserted blank page. */
  src: number | null;
  /** Extra clockwise rotation applied on top of the page's own /Rotate. */
  rot: Rotation;
  /** Blank pages only: size in PDF points (already as it should be displayed). */
  w?: number;
  h?: number;
}

/** Visual (rotation-aware) size of one source page, in points. */
export interface PageMeta {
  w: number;
  h: number;
}

export const A4: PageMeta = { w: 595.28, h: 841.89 };
export const MAX_ORGANIZE_PAGES = 500;
export const MAX_HISTORY = 100;

export function addRotation(rot: Rotation, delta: number): Rotation {
  return ((((rot + delta) % 360) + 360) % 360) as Rotation;
}

/** Whether a page is shown sideways (quarter turn) — swaps its width and height. */
export function isSideways(rot: Rotation): boolean {
  return rot === 90 || rot === 270;
}
