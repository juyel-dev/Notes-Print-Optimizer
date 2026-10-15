/**
 * Compress PDF — pure state machine: upload → analyzing → studio → working → done.
 */

import type { PdfAnalysis } from './analyze';
import { pickLevelForTarget, type CompressLevel, type CompressMode } from './types';

export type CompressStep = 'upload' | 'analyzing' | 'studio' | 'working' | 'done';

export interface CompressSource {
  name: string;
  baseName: string;
  size: number;
}

export interface CompressResult {
  blob: Blob;
  size: number;
  mode: CompressMode;
  level: CompressLevel;
  unchanged: boolean;
  /** Target the user asked for (null = chose a strength by hand). */
  target: number | null;
  /** null when no target was set. */
  reachedTarget: boolean | null;
  attempts: number;
}

export interface CompressProgress {
  pct: number;
  label: string;
}

export interface CompressState {
  step: CompressStep;
  source: CompressSource | null;
  analysis: PdfAnalysis | null;
  mode: CompressMode;
  /** Predicted output sizes (levels 1..5) per mode, filled in lazily. */
  estimates: Partial<Record<CompressMode, number[]>>;
  estimating: CompressMode | null;
  estimateProgress: { done: number; total: number } | null;
  level: CompressLevel;
  target: number | null;
  progress: CompressProgress | null;
  result: CompressResult | null;
  error: string | null;
}

export const DEFAULT_LEVEL: CompressLevel = 3;

export const INITIAL_COMPRESS_STATE: CompressState = {
  step: 'upload',
  source: null,
  analysis: null,
  mode: 'smart',
  estimates: {},
  estimating: null,
  estimateProgress: null,
  level: DEFAULT_LEVEL,
  target: null,
  progress: null,
  result: null,
  error: null,
};

export type CompressAction =
  | { type: 'RESET' }
  | { type: 'ANALYZE_START'; source: CompressSource }
  | { type: 'ANALYZE_DONE'; analysis: PdfAnalysis }
  | { type: 'SET_MODE'; mode: CompressMode }
  | { type: 'ESTIMATE_START'; mode: CompressMode }
  | { type: 'ESTIMATE_PROGRESS'; done: number; total: number }
  | { type: 'ESTIMATE_DONE'; mode: CompressMode; sizes: number[] }
  | { type: 'ESTIMATE_FAIL'; error: string }
  | { type: 'SET_LEVEL'; level: CompressLevel }
  | { type: 'SET_TARGET'; target: number | null }
  | { type: 'RUN_START' }
  | { type: 'RUN_PROGRESS'; progress: CompressProgress }
  | { type: 'RUN_DONE'; result: CompressResult }
  | { type: 'RUN_CANCEL' }
  | { type: 'BACK_TO_STUDIO' }
  | { type: 'ERROR'; error: string; step?: CompressStep };

/** With a target set, the level follows the prediction; otherwise the user's level stands. */
function levelFor(state: Pick<CompressState, 'target' | 'level' | 'estimates' | 'mode'>): CompressLevel {
  const sizes = state.estimates[state.mode];
  if (state.target === null || !sizes) return state.level;
  return pickLevelForTarget(sizes, state.target).level;
}

export function compressReducer(state: CompressState, action: CompressAction): CompressState {
  switch (action.type) {
    case 'RESET':
      return { ...INITIAL_COMPRESS_STATE };

    case 'ANALYZE_START':
      // A target picked on the upload screen ("I need it under 2 MB") survives the file drop.
      return { ...INITIAL_COMPRESS_STATE, step: 'analyzing', source: action.source, target: state.target };

    case 'ANALYZE_DONE':
      return { ...state, step: 'studio', analysis: action.analysis, mode: action.analysis.recommendedMode, error: null };

    case 'SET_MODE': {
      const next = { ...state, mode: action.mode };
      return { ...next, level: levelFor(next) };
    }

    case 'ESTIMATE_START':
      return { ...state, estimating: action.mode, estimateProgress: null, error: null };

    case 'ESTIMATE_PROGRESS':
      return { ...state, estimateProgress: { done: action.done, total: action.total } };

    case 'ESTIMATE_DONE': {
      const next = { ...state, estimates: { ...state.estimates, [action.mode]: action.sizes }, estimating: null, estimateProgress: null };
      return { ...next, level: levelFor(next) };
    }

    case 'ESTIMATE_FAIL':
      return { ...state, estimating: null, estimateProgress: null, error: action.error };

    case 'SET_LEVEL':
      // Choosing a strength by hand drops the target — they are two ways of asking for the same thing.
      return { ...state, level: action.level, target: null };

    case 'SET_TARGET': {
      const next = { ...state, target: action.target };
      return { ...next, level: levelFor(next) };
    }

    case 'RUN_START':
      return { ...state, step: 'working', progress: { pct: 2, label: 'Starting…' }, error: null, result: null };

    case 'RUN_PROGRESS':
      return { ...state, progress: action.progress };

    case 'RUN_DONE':
      return { ...state, step: 'done', progress: null, result: action.result };

    case 'RUN_CANCEL':
      return { ...state, step: 'studio', progress: null };

    case 'BACK_TO_STUDIO':
      return { ...state, step: 'studio', result: null, error: null };

    case 'ERROR':
      return { ...state, step: action.step ?? state.step, progress: null, estimating: null, estimateProgress: null, error: action.error };

    default:
      return state;
  }
}
