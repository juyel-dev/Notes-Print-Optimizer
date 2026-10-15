/**
 * enhanceReducer — pure state machine for the Enhance tool.
 * Kept free of side effects so every transition is unit-testable.
 */

import { INITIAL_ENHANCE_STATE, type EnhanceAction, type EnhanceState } from './types';

/** Derive a clean output base name from processor/export filenames. */
export function defaultEnhanceBaseName(fileName: string): string {
  let base = fileName.replace(/\.pdf$/i, '');
  // Strip export suffixes repeatedly (`x-enhanced-enhanced.pdf`) and
  // case-insensitively (`Enhanced-print.PDF`).
  let prev = '';
  while (prev !== base) {
    prev = base;
    base = base.replace(/(-enhanced|-PrintReady)$/i, '');
  }
  return !base || base.toLowerCase() === 'enhanced-print' ? 'Enhanced' : base;
}

export function buildEnhanceFileName(sources: { name: string }[]): string {
  if (sources.length === 1) {
    const base = sources[0].name.replace(/\.pdf$/i, '');
    return `${base}-enhanced.pdf`;
  }
  return 'enhanced-print.pdf';
}

export function enhanceReducer(state: EnhanceState, action: EnhanceAction): EnhanceState {
  switch (action.type) {
    case 'RESET':
      return { ...INITIAL_ENHANCE_STATE };

    case 'SET_STEP':
      return { ...state, step: action.step, error: null };

    case 'SET_FILES':
      return {
        ...state,
        files: action.files,
        step: action.step,
        results: [],
        selectedIndex: 0,
        pdfBlob: null,
        error: null,
      };

    case 'SET_SETTINGS':
      return { ...state, settings: action.settings, pdfBlob: null };

    case 'SET_SELECTED':
      // Selecting a different page changes only the preview, not the rendered output.
      return { ...state, selectedIndex: action.index };

    case 'MOVE_FILE': {
      const target = action.direction === 'UP' ? action.index - 1 : action.index + 1;
      if (action.index < 0 || action.index >= state.files.length) return state;
      if (target < 0 || target >= state.files.length) return state;
      const files = [...state.files];
      [files[action.index], files[target]] = [files[target], files[action.index]];
      // Order change invalidates any previously enhanced output.
      return { ...state, files, results: [], selectedIndex: 0, pdfBlob: null };
    }

    case 'REORDER_FILES': {
      const { fromIndex, toIndex } = action;
      if (fromIndex === toIndex) return state;
      if (fromIndex < 0 || fromIndex >= state.files.length) return state;
      if (toIndex < 0 || toIndex >= state.files.length) return state;
      const files = [...state.files];
      const [moved] = files.splice(fromIndex, 1);
      files.splice(toIndex, 0, moved);
      return { ...state, files, results: [], selectedIndex: 0, pdfBlob: null };
    }

    case 'REMOVE_FILE': {
      const files = state.files.filter((_, i) => i !== action.index);
      if (files.length === 0) {
        // Last file removed → back to a fresh upload screen (keep settings).
        return { ...INITIAL_ENHANCE_STATE, settings: state.settings };
      }
      return { ...state, files, selectedIndex: 0, results: [], pdfBlob: null };
    }

    case 'SMART_ARRANGE':
      return { ...state, files: action.files, results: [], selectedIndex: 0, pdfBlob: null };

    case 'BACK_TO_ARRANGE':
      return {
        ...state,
        step: 'arrange',
        results: [],
        selectedIndex: 0,
        pdfBlob: null,
        error: null,
      };

    case 'PROCESS_START':
      return { ...state, isProcessing: true, progress: { current: 0, total: 1, phase: 'Preparing…' }, error: null, pdfBlob: null };

    case 'PROCESS_PROGRESS':
      return { ...state, progress: action.progress };

    case 'PROCESS_COMPLETE':
      return {
        ...state,
        isProcessing: false,
        progress: null,
        results: action.results,
        appliedSettings: action.settings,
        selectedIndex: 0,
        fileName: action.fileName,
        step: 'enhance',
      };

    case 'PROCESS_ERROR':
      return { ...state, isProcessing: false, progress: null, error: action.error };

    case 'PROCESS_CANCEL':
      return { ...state, isProcessing: false, progress: null, error: null };

    case 'EXPORT_START':
      return { ...state, exportBusy: true, error: null };

    case 'EXPORT_COMPLETE':
      // Stays on the workbench — the hook triggers the browser download.
      return { ...state, exportBusy: false, pdfBlob: action.blob, fileName: action.fileName };

    case 'EXPORT_ERROR':
      return { ...state, exportBusy: false, error: action.error };

    default:
      return state;
  }
}