/**
 * Organize Pages — pure state machine with undo/redo:
 * upload → loading → studio → exporting → done.
 */

import {
  deletePages,
  duplicatePages,
  insertBlank,
  invertSelection,
  movePagesBefore,
  nudgePages,
  rotatePages,
  selectByParity,
} from './pageOps';
import { MAX_HISTORY, type PageItem, type PageMeta } from './types';

export type OrganizeStep = 'upload' | 'loading' | 'studio' | 'exporting' | 'done';

export interface OrganizeSource {
  name: string;
  baseName: string;
  size: number;
  pageCount: number;
}

export interface OrganizeResult {
  blob: Blob;
  size: number;
  pages: number;
  /** True when only the selected pages were exported. */
  selectionOnly: boolean;
}

export interface OrganizeState {
  step: OrganizeStep;
  source: OrganizeSource | null;
  metas: PageMeta[];
  items: PageItem[];
  /** Selected page ids (order is irrelevant — page order comes from `items`). */
  selected: string[];
  past: PageItem[][];
  future: PageItem[][];
  nextId: number;
  /** Progress of the "find blank pages" scan. */
  blankScan: { done: number; total: number } | null;
  /** How many blank pages the last scan found (null = never scanned). */
  blankFound: number | null;
  result: OrganizeResult | null;
  error: string | null;
}

export const INITIAL_ORGANIZE_STATE: OrganizeState = {
  step: 'upload',
  source: null,
  metas: [],
  items: [],
  selected: [],
  past: [],
  future: [],
  nextId: 1,
  blankScan: null,
  blankFound: null,
  result: null,
  error: null,
};

export type OrganizeAction =
  | { type: 'RESET' }
  | { type: 'LOAD_START'; source: Pick<OrganizeSource, 'name' | 'baseName' | 'size'> }
  | { type: 'LOAD_DONE'; pageCount: number; metas: PageMeta[] }
  | { type: 'SELECT_TOGGLE'; id: string }
  | { type: 'SELECT_ONLY'; id: string }
  | { type: 'SELECT_RANGE'; fromId: string; toId: string }
  | { type: 'SELECT_ALL' }
  | { type: 'SELECT_NONE' }
  | { type: 'SELECT_PARITY'; parity: 'odd' | 'even' }
  | { type: 'SELECT_INVERT' }
  | { type: 'SELECT_IDS'; ids: string[] }
  | { type: 'ROTATE'; delta: number; ids?: string[] }
  | { type: 'DELETE' }
  | { type: 'DUPLICATE' }
  | { type: 'NUDGE'; dir: -1 | 1 }
  | { type: 'MOVE_BEFORE'; beforeId: string | null; ids?: string[] }
  | { type: 'INSERT_BLANK' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'REVERT_ALL' }
  | { type: 'BLANK_SCAN_PROGRESS'; done: number; total: number }
  | { type: 'BLANK_SCAN_DONE'; ids: string[] }
  | { type: 'BLANK_SCAN_FAIL' }
  | { type: 'EXPORT_START' }
  | { type: 'EXPORT_DONE'; result: OrganizeResult }
  | { type: 'EXPORT_FAIL'; error: string }
  | { type: 'BACK_TO_STUDIO' }
  | { type: 'ERROR'; error: string; step?: OrganizeStep };

const keep = (state: OrganizeState): PageItem[][] => [...state.past, state.items].slice(-MAX_HISTORY);

/** Applies an edit: pushes history, clears redo, drops selection of pages that no longer exist. */
function commit(state: OrganizeState, items: PageItem[], extra: Partial<OrganizeState> = {}): OrganizeState {
  const alive = new Set(items.map((p) => p.id));
  return {
    ...state,
    items,
    past: keep(state),
    future: [],
    selected: state.selected.filter((id) => alive.has(id)),
    ...extra,
  };
}

function originalItems(pageCount: number): PageItem[] {
  return Array.from({ length: pageCount }, (_, i) => ({ id: `p${i + 1}`, src: i, rot: 0 as const }));
}

export function organizeReducer(state: OrganizeState, action: OrganizeAction): OrganizeState {
  const sel = new Set(state.selected);
  switch (action.type) {
    case 'RESET':
      return { ...INITIAL_ORGANIZE_STATE };

    case 'LOAD_START':
      return { ...INITIAL_ORGANIZE_STATE, step: 'loading', source: { ...action.source, pageCount: 0 } };

    case 'LOAD_DONE':
      return {
        ...state,
        step: 'studio',
        source: state.source ? { ...state.source, pageCount: action.pageCount } : state.source,
        metas: action.metas,
        items: originalItems(action.pageCount),
        nextId: action.pageCount + 1,
        error: null,
      };

    case 'SELECT_TOGGLE':
      return { ...state, selected: sel.has(action.id) ? state.selected.filter((i) => i !== action.id) : [...state.selected, action.id] };

    case 'SELECT_ONLY':
      return { ...state, selected: [action.id] };

    case 'SELECT_RANGE': {
      const a = state.items.findIndex((p) => p.id === action.fromId);
      const b = state.items.findIndex((p) => p.id === action.toId);
      if (a < 0 || b < 0) return state;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const range = state.items.slice(lo, hi + 1).map((p) => p.id);
      return { ...state, selected: Array.from(new Set([...state.selected, ...range])) };
    }

    case 'SELECT_ALL':
      return { ...state, selected: state.items.map((p) => p.id) };

    case 'SELECT_NONE':
      return { ...state, selected: [] };

    case 'SELECT_PARITY':
      return { ...state, selected: selectByParity(state.items, action.parity) };

    case 'SELECT_INVERT':
      return { ...state, selected: invertSelection(state.items, sel) };

    case 'SELECT_IDS':
      return { ...state, selected: action.ids };

    case 'ROTATE': {
      const ids = new Set(action.ids ?? state.selected);
      if (ids.size === 0) return state;
      return commit(state, rotatePages(state.items, ids, action.delta));
    }

    case 'DELETE':
      if (sel.size === 0) return state;
      return commit(state, deletePages(state.items, sel));

    case 'DUPLICATE': {
      if (sel.size === 0) return state;
      let n = state.nextId;
      const { items, copies } = duplicatePages(state.items, sel, () => `p${n++}`);
      return commit(state, items, { nextId: n, selected: copies });
    }

    case 'NUDGE': {
      if (sel.size === 0) return state;
      const items = nudgePages(state.items, sel, action.dir);
      return items.every((p, i) => p === state.items[i]) ? state : commit(state, items);
    }

    case 'MOVE_BEFORE': {
      const ids = new Set(action.ids ?? state.selected);
      if (ids.size === 0) return state;
      const items = movePagesBefore(state.items, ids, action.beforeId);
      return items.every((p, i) => p === state.items[i]) ? state : commit(state, items, { selected: Array.from(ids) });
    }

    case 'INSERT_BLANK': {
      const id = `p${state.nextId}`;
      const items = insertBlank(state.items, sel, state.metas, id);
      return commit(state, items, { nextId: state.nextId + 1, selected: [id] });
    }

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      const alive = new Set(prev.map((p) => p.id));
      return {
        ...state,
        items: prev,
        past: state.past.slice(0, -1),
        future: [state.items, ...state.future].slice(0, MAX_HISTORY),
        selected: state.selected.filter((id) => alive.has(id)),
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const alive = new Set(next.map((p) => p.id));
      return {
        ...state,
        items: next,
        past: [...state.past, state.items].slice(-MAX_HISTORY),
        future: state.future.slice(1),
        selected: state.selected.filter((id) => alive.has(id)),
      };
    }

    case 'REVERT_ALL': {
      const count = state.source?.pageCount ?? 0;
      return commit(state, originalItems(count), { selected: [], nextId: Math.max(state.nextId, count + 1) });
    }

    case 'BLANK_SCAN_PROGRESS':
      return { ...state, blankScan: { done: action.done, total: action.total } };

    case 'BLANK_SCAN_DONE':
      return { ...state, blankScan: null, blankFound: action.ids.length, selected: action.ids };

    case 'BLANK_SCAN_FAIL':
      return { ...state, blankScan: null };

    case 'EXPORT_START':
      return { ...state, step: 'exporting', error: null };

    case 'EXPORT_DONE':
      return { ...state, step: 'done', result: action.result };

    case 'EXPORT_FAIL':
      return { ...state, step: 'studio', error: action.error };

    case 'BACK_TO_STUDIO':
      return { ...state, step: 'studio', result: null, error: null };

    case 'ERROR':
      return { ...state, step: action.step ?? state.step, error: action.error };

    default:
      return state;
  }
}
