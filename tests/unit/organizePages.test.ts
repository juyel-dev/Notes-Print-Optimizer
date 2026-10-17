import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  blankSizeFor,
  deletePages,
  duplicatePages,
  insertBlank,
  isUntouched,
  movePagesBefore,
  nudgePages,
  rotatePages,
  selectByParity,
  summarize,
} from '@/lib/organize/pageOps';
import { BLANK_INK_RATIO, isNearlyBlank, measureInk } from '@/lib/organize/blank';
import { INITIAL_ORGANIZE_STATE, organizeReducer, type OrganizeState } from '@/lib/organize/organizeReducer';
import { buildOrganizedPdf, readPageMetas } from '@/lib/organize/organizeExport';
import { A4, addRotation, type PageItem } from '@/lib/organize/types';

const mk = (n: number): PageItem[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, src: i, rot: 0 as const }));
const ids = (items: PageItem[]) => items.map((p) => p.id).join(',');
const set = (...v: string[]) => new Set(v);

describe('pageOps', () => {
  it('rotates only the chosen pages and wraps at 360', () => {
    const out = rotatePages(mk(3), set('p2'), 90);
    expect(out.map((p) => p.rot)).toEqual([0, 90, 0]);
    expect(addRotation(270, 90)).toBe(0);
    expect(addRotation(0, -90)).toBe(270);
  });

  it('deletes without mutating the input', () => {
    const src = mk(4);
    expect(ids(deletePages(src, set('p2', 'p3')))).toBe('p1,p4');
    expect(src).toHaveLength(4);
  });

  it('duplicates right after the original and reports the new ids', () => {
    let n = 10;
    const { items, copies } = duplicatePages(mk(3), set('p1', 'p3'), () => `p${n++}`);
    expect(ids(items)).toBe('p1,p10,p2,p3,p11');
    expect(copies).toEqual(['p10', 'p11']);
    expect(items[1].src).toBe(0);
  });

  it('nudges a group earlier/later keeping order, and stops at the edges', () => {
    expect(ids(nudgePages(mk(5), set('p3', 'p4'), -1))).toBe('p1,p3,p4,p2,p5');
    expect(ids(nudgePages(mk(5), set('p3', 'p4'), 1))).toBe('p1,p2,p5,p3,p4');
    expect(ids(nudgePages(mk(3), set('p1'), -1))).toBe('p1,p2,p3');
    expect(ids(nudgePages(mk(3), set('p3'), 1))).toBe('p1,p2,p3');
    expect(ids(nudgePages(mk(5), set('p1', 'p2'), -1))).toBe('p1,p2,p3,p4,p5');
  });

  it('moves pages before a target (drag and drop)', () => {
    expect(ids(movePagesBefore(mk(5), set('p4'), 'p2'))).toBe('p1,p4,p2,p3,p5');
    expect(ids(movePagesBefore(mk(5), set('p1', 'p2'), null))).toBe('p3,p4,p5,p1,p2');
    expect(ids(movePagesBefore(mk(5), set('p2', 'p4'), 'p5'))).toBe('p1,p3,p2,p4,p5');
    expect(ids(movePagesBefore(mk(5), set('p2'), 'p2'))).toBe('p1,p2,p3,p4,p5'); // onto itself
  });

  it('inserts a blank after the selection with the neighbour size', () => {
    const metas = [{ w: 300, h: 400 }, { w: 500, h: 700 }, { w: 300, h: 400 }];
    const out = insertBlank(mk(3), set('p2'), metas, 'b1');
    expect(ids(out)).toBe('p1,p2,b1,p3');
    expect(out[2]).toMatchObject({ src: null, w: 500, h: 700 });
    // a sideways page hands its swapped size to the blank
    const turned = rotatePages(mk(3), set('p2'), 90);
    expect(blankSizeFor(turned, metas, 2)).toEqual({ w: 700, h: 500 });
    expect(blankSizeFor([], [], 0)).toEqual(A4);
    expect(ids(insertBlank(mk(2), set(), metas, 'b'))).toBe('p1,p2,b'); // nothing selected → end
  });

  it('parity selection is by position, not by id', () => {
    const shuffled = [mk(4)[3], mk(4)[0], mk(4)[1], mk(4)[2]];
    expect(selectByParity(shuffled, 'odd')).toEqual(['p4', 'p2']);
    expect(selectByParity(shuffled, 'even')).toEqual(['p1', 'p3']);
  });

  it('summarizes what changed', () => {
    expect(isUntouched(mk(3), 3)).toBe(true);
    let n = 9;
    const dup = duplicatePages(mk(4), set('p1'), () => `p${n++}`).items;
    const items = rotatePages(deletePages(dup, set('p3')), set('p2'), 90);
    const s = summarize([...items, { id: 'b', src: null, rot: 0 }], 4);
    expect(s).toMatchObject({ kept: 3, deleted: 1, rotated: 1, duplicated: 1, blanks: 1 });
    expect(isUntouched(items, 4)).toBe(false);
    expect(summarize(nudgePages(mk(3), set('p3'), -1), 3).moved).toBe(true);
  });
});

describe('blank detection', () => {
  const page = (w: number, h: number, paper: number, inkPx: number, inkVal = 20) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = i < inkPx ? inkVal : paper;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
    return d;
  };
  it('white paper with scanner noise is blank; text is not', () => {
    expect(isNearlyBlank(measureInk(page(100, 100, 245, 0)))).toBe(true);
    expect(isNearlyBlank(measureInk(page(100, 100, 245, 12)))).toBe(true); // a few specks
    const text = measureInk(page(100, 100, 245, 900));
    expect(text.ratio).toBeGreaterThan(BLANK_INK_RATIO);
    expect(isNearlyBlank(text)).toBe(false);
  });
  it('a dark page is content, not blank', () => {
    expect(isNearlyBlank(measureInk(page(100, 100, 30, 0)))).toBe(false);
  });
  it('gray paper (not white) can still be blank', () => {
    expect(isNearlyBlank(measureInk(page(100, 100, 190, 0)))).toBe(true);
  });
});

describe('organizeReducer', () => {
  const studio = (n = 5): OrganizeState =>
    organizeReducer(
      organizeReducer(INITIAL_ORGANIZE_STATE, { type: 'LOAD_START', source: { name: 'a.pdf', baseName: 'a', size: 1 } }),
      { type: 'LOAD_DONE', pageCount: n, metas: Array.from({ length: n }, () => ({ w: 300, h: 400 })) },
    );
  const run = (s: OrganizeState, ...a: Parameters<typeof organizeReducer>[1][]) => a.reduce(organizeReducer, s);

  it('loads into the studio with pages in source order', () => {
    const s = studio(3);
    expect(s.step).toBe('studio');
    expect(ids(s.items)).toBe('p1,p2,p3');
    expect(s.source?.pageCount).toBe(3);
  });

  it('selects, ranges, parity and invert', () => {
    let s = run(studio(), { type: 'SELECT_TOGGLE', id: 'p2' }, { type: 'SELECT_TOGGLE', id: 'p4' });
    expect(s.selected).toEqual(['p2', 'p4']);
    s = run(s, { type: 'SELECT_TOGGLE', id: 'p2' });
    expect(s.selected).toEqual(['p4']);
    s = run(studio(), { type: 'SELECT_RANGE', fromId: 'p4', toId: 'p2' });
    expect(s.selected.sort()).toEqual(['p2', 'p3', 'p4']);
    expect(run(studio(), { type: 'SELECT_PARITY', parity: 'even' }).selected).toEqual(['p2', 'p4']);
    expect(run(s, { type: 'SELECT_INVERT' }).selected.sort()).toEqual(['p1', 'p5']);
    expect(run(s, { type: 'SELECT_NONE' }).selected).toEqual([]);
  });

  it('edits push history; undo/redo round-trips; a new edit clears redo', () => {
    let s = run(studio(), { type: 'SELECT_ONLY', id: 'p2' }, { type: 'ROTATE', delta: 90 });
    expect(s.items[1].rot).toBe(90);
    s = run(s, { type: 'DELETE' });
    expect(ids(s.items)).toBe('p1,p3,p4,p5');
    expect(s.selected).toEqual([]); // the deleted page is no longer selected
    s = run(s, { type: 'UNDO' });
    expect(ids(s.items)).toBe('p1,p2,p3,p4,p5');
    s = run(s, { type: 'UNDO' });
    expect(s.items[1].rot).toBe(0);
    s = run(s, { type: 'REDO' });
    expect(s.items[1].rot).toBe(90);
    s = run(s, { type: 'SELECT_ONLY', id: 'p1' }, { type: 'ROTATE', delta: 180 });
    expect(s.future).toHaveLength(0);
    expect(run(studio(), { type: 'UNDO' }).past).toHaveLength(0); // nothing to undo is a no-op
  });

  it('duplicate selects the copies; blank is selected after insert', () => {
    let s = run(studio(3), { type: 'SELECT_ONLY', id: 'p2' }, { type: 'DUPLICATE' });
    expect(s.items).toHaveLength(4);
    expect(s.selected).toHaveLength(1);
    expect(s.selected[0]).not.toBe('p2');
    expect(s.items[2].id).toBe(s.selected[0]);
    s = run(s, { type: 'INSERT_BLANK' });
    expect(s.items.some((p) => p.src === null)).toBe(true);
    expect(s.items[s.items.findIndex((p) => p.id === s.selected[0])].src).toBeNull();
  });

  it('nudge and drag move pages; a no-op does not pollute history', () => {
    let s = run(studio(), { type: 'SELECT_ONLY', id: 'p3' }, { type: 'NUDGE', dir: -1 });
    expect(ids(s.items)).toBe('p1,p3,p2,p4,p5');
    const before = s.past.length;
    s = run(s, { type: 'SELECT_ONLY', id: 'p1' }, { type: 'NUDGE', dir: -1 });
    expect(s.past.length).toBe(before);
    s = run(s, { type: 'MOVE_BEFORE', ids: ['p5'], beforeId: 'p1' });
    expect(ids(s.items)).toBe('p5,p1,p3,p2,p4');
  });

  it('revert restores the original and is itself undoable', () => {
    let s = run(studio(3), { type: 'SELECT_ONLY', id: 'p1' }, { type: 'DELETE' }, { type: 'REVERT_ALL' });
    expect(ids(s.items)).toBe('p1,p2,p3');
    s = run(s, { type: 'UNDO' });
    expect(ids(s.items)).toBe('p2,p3');
  });

  it('blank scan selects what it found; export lifecycle surfaces errors', () => {
    let s = run(studio(), { type: 'BLANK_SCAN_PROGRESS', done: 2, total: 5 });
    expect(s.blankScan).toEqual({ done: 2, total: 5 });
    s = run(s, { type: 'BLANK_SCAN_DONE', ids: ['p2', 'p5'] });
    expect(s).toMatchObject({ blankScan: null, blankFound: 2, selected: ['p2', 'p5'] });
    s = run(s, { type: 'EXPORT_START' });
    expect(s.step).toBe('exporting');
    expect(run(s, { type: 'EXPORT_FAIL', error: 'x' })).toMatchObject({ step: 'studio', error: 'x' });
    s = run(s, { type: 'EXPORT_DONE', result: { blob: new Blob(['x']), size: 1, pages: 3, selectionOnly: false } });
    expect(s.step).toBe('done');
    expect(run(s, { type: 'BACK_TO_STUDIO' }).result).toBeNull();
    expect(run(s, { type: 'RESET' })).toEqual(INITIAL_ORGANIZE_STATE);
  });
});

describe('buildOrganizedPdf', () => {
  /** A PDF whose page i is 200+10i points wide, so the order is readable from the output. */
  async function sourcePdf(n: number, rotated: Record<number, number> = {}) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < n; i++) {
      const p = doc.addPage([200 + i * 10, 300]);
      if (rotated[i]) p.setRotation(degrees(rotated[i]));
    }
    return doc.save();
  }
  const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));
  const rots = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);

  it('reorders, deletes, duplicates and rotates', async () => {
    const src = await sourcePdf(4);
    let n = 10;
    const dup = duplicatePages(mk(4), set('p1'), () => `p${n++}`).items; // p1,p10,p2,p3,p4
    const edited = rotatePages(deletePages(nudgePages(dup, set('p4'), -1), set('p2')), set('p10'), 90);
    // order: p1, p10(copy of page 1, rotated), p4, p3  (p2 deleted, p4 nudged before p3)
    const out = await buildOrganizedPdf(src, edited);
    expect(await widths(out)).toEqual([200, 200, 230, 220]);
    expect(await rots(out)).toEqual([0, 90, 0, 0]);
  });

  it('adds the rotation on top of a page that is already rotated', async () => {
    const src = await sourcePdf(2, { 1: 90 });
    const out = await buildOrganizedPdf(src, rotatePages(mk(2), set('p2'), 90));
    expect(await rots(out)).toEqual([0, 180]);
    expect((await readPageMetas(src)).metas[1]).toEqual({ w: 300, h: 210 }); // sideways → swapped
  });

  it('inserts blank pages at the requested size and rotation', async () => {
    const src = await sourcePdf(2);
    const items: PageItem[] = [mk(2)[0], { id: 'b', src: null, rot: 0, w: 400, h: 500 }, mk(2)[1]];
    const out = await buildOrganizedPdf(src, items);
    expect(await widths(out)).toEqual([200, 400, 210]);
  });

  it('keeps duplicates independent (rotating one copy leaves the other alone)', async () => {
    const src = await sourcePdf(1);
    const a: PageItem = { id: 'a', src: 0, rot: 0 };
    const b: PageItem = { id: 'b', src: 0, rot: 180 };
    expect(await rots(await buildOrganizedPdf(src, [a, b, a]))).toEqual([0, 180, 0]);
  });

  it('refuses to build a document with no pages', async () => {
    await expect(buildOrganizedPdf(await sourcePdf(2), [])).rejects.toThrow(/no pages/i);
  });
});
