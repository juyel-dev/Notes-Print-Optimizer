/**
 * Enhance Light PDF — types and constants.
 *
 * Tool scope (v1): enhance light-background / faint-ink PDFs (handwritten
 * notebook scans, photographed module pages) so they survive printing and
 * photocopying. Mobile-only UI; the engine itself is platform-agnostic.
 */

import type { UploadedPdfItem } from '@/lib/workflow/types';

/** App-level tool selection (landing tools box). */
export type ToolMode =
  | 'dark-print'
  | 'enhance'
  | 'protect'
  | 'to-images'
  | 'merge'
  | 'split'
  | 'to-pdf'
  | 'password-gen'
  | 'qr-gen'
  | 'word-count'
  | 'case-convert'
  | 'nup'
  | 'compress'
  | 'organize';

export type EnhanceStep = 'upload' | 'arrange' | 'enhance';

/** Hard cap on PDFs per enhance session (mirrors the main flow's queue cap). */
export const MAX_ENHANCE_FILES = 10;

export interface EnhanceSettings {
  /** 0-100 — how much faint ink is pushed toward black. */
  darken: number;
  /** 0-100 — histogram stretch strength (removes flat gray). */
  contrast: number;
  /** 0-100 — unsharp strength; 0 disables the sharpen pass. */
  sharpen: number;
  /** Remove page tint/shadow by mapping near-background pixels to pure white. */
  cleanBackground: boolean;
  /** Convert to grayscale before sharpening (mono print output). */
  grayscale: boolean;
  /** Flatten uneven lighting (camera shadows, gradients) before everything else. */
  evenLighting: boolean;
  /** Render resolution. Needs a re-run (Apply) to take effect. */
  detail: EnhanceDetail;
}

export type EnhanceDetail = 'standard' | 'high' | 'ultra';

/** Render DPI per detail level (72 pt/in PDF space). */
export const ENHANCE_DETAIL_DPI: Record<EnhanceDetail, number> = { standard: 120, high: 150, ultra: 200 };
export const ENHANCE_DETAIL_LABEL: Record<EnhanceDetail, string> = { standard: 'Standard', high: 'High', ultra: 'Ultra' };

export const DEFAULT_ENHANCE_SETTINGS: EnhanceSettings = {
  darken: 45,
  contrast: 35,
  sharpen: 25,
  cleanBackground: true,
  grayscale: false,
  evenLighting: true,
  detail: 'standard',
};

export interface EnhancePreset {
  id: string;
  label: string;
  hint: string;
  settings: Omit<EnhanceSettings, 'detail'>;
}

/** One-tap starting points. Applying a preset keeps the chosen detail level. */
export const ENHANCE_PRESETS: readonly EnhancePreset[] = [
  { id: 'balanced', label: 'Balanced', hint: 'Good for most notebook scans', settings: { darken: 45, contrast: 35, sharpen: 25, cleanBackground: true, grayscale: false, evenLighting: true } },
  { id: 'pencil', label: 'Faint pencil', hint: 'Very light ink — strong, black & white', settings: { darken: 80, contrast: 55, sharpen: 35, cleanBackground: true, grayscale: true, evenLighting: true } },
  { id: 'photo', label: 'Phone photo', hint: 'Shadows and uneven light', settings: { darken: 50, contrast: 40, sharpen: 30, cleanBackground: true, grayscale: false, evenLighting: true } },
  { id: 'gentle', label: 'Gentle', hint: 'Keeps colour, light touch', settings: { darken: 20, contrast: 15, sharpen: 15, cleanBackground: true, grayscale: false, evenLighting: false } },
  { id: 'max', label: 'Max print', hint: 'Darkest output for photocopying', settings: { darken: 100, contrast: 70, sharpen: 40, cleanBackground: true, grayscale: true, evenLighting: true } },
];

/** Settings that change the pixels of a re-enhanced page (everything except `detail`). */
export function sameTone(a: EnhanceSettings, b: EnhanceSettings): boolean {
  return (
    a.darken === b.darken &&
    a.contrast === b.contrast &&
    a.sharpen === b.sharpen &&
    a.cleanBackground === b.cleanBackground &&
    a.grayscale === b.grayscale &&
    a.evenLighting === b.evenLighting
  );
}

export function matchPreset(s: EnhanceSettings): EnhancePreset | null {
  return ENHANCE_PRESETS.find((p) => sameTone({ ...p.settings, detail: s.detail }, s)) ?? null;
}

export const ENHANCE_SETTING_RANGE = { darken: [0, 100], contrast: [0, 100], sharpen: [0, 100] } as const;

export interface EnhancePageResult {
  index: number;
  /** Raster size in pixels of `dataUrl`. */
  width: number;
  height: number;
  /** Original page size in PDF points (72/in). Export uses this so the output keeps the source page size. */
  pdfWidth?: number;
  pdfHeight?: number;
  /** JPEG data URL of the enhanced page (used for preview + export). */
  dataUrl: string;
  /** JPEG data URL of the original page, downscaled (before/after + live preview source). */
  originalDataUrl: string;
}

export interface EnhanceProgress {
  current: number;
  total: number;
  phase: string;
}

export interface EnhanceState {
  step: EnhanceStep;
  files: UploadedPdfItem[];
  isProcessing: boolean;
  progress: EnhanceProgress | null;
  settings: EnhanceSettings;
  /** The exact settings the current `results` were produced with (null until a run completes). */
  appliedSettings: EnhanceSettings | null;
  results: EnhancePageResult[];
  selectedIndex: number;
  pdfBlob: Blob | null;
  fileName: string;
  exportBusy: boolean;
  error: string | null;
}

export const INITIAL_ENHANCE_STATE: EnhanceState = {
  step: 'upload',
  files: [],
  isProcessing: false,
  progress: null,
  settings: DEFAULT_ENHANCE_SETTINGS,
  appliedSettings: null,
  results: [],
  selectedIndex: 0,
  pdfBlob: null,
  fileName: 'enhanced-print.pdf',
  exportBusy: false,
  error: null,
};

export type EnhanceAction =
  | { type: 'RESET' }
  | { type: 'SET_STEP'; step: EnhanceStep }
  | { type: 'SET_FILES'; files: UploadedPdfItem[]; step: EnhanceStep }
  | { type: 'SET_SETTINGS'; settings: EnhanceSettings }
  | { type: 'SET_SELECTED'; index: number }
  /** Arrange stage: adjacent swap (accessible fallback for touch). */
  | { type: 'MOVE_FILE'; index: number; direction: 'UP' | 'DOWN' }
  /** Arrange stage: drag & drop — move item at fromIndex into toIndex. */
  | { type: 'REORDER_FILES'; fromIndex: number; toIndex: number }
  /** Arrange stage: delete one uploaded PDF. */
  | { type: 'REMOVE_FILE'; index: number }
  /** Arrange stage: replace the whole order with a Smart Arrange plan. */
  | { type: 'SMART_ARRANGE'; files: UploadedPdfItem[] }
  /** Workbench/export → back to arrange (invalidates stale results). */
  | { type: 'BACK_TO_ARRANGE' }
  | { type: 'PROCESS_START' }
  | { type: 'PROCESS_PROGRESS'; progress: EnhanceProgress }
  | { type: 'PROCESS_COMPLETE'; results: EnhancePageResult[]; fileName: string; settings: EnhanceSettings }
  | { type: 'PROCESS_ERROR'; error: string }
  | { type: 'PROCESS_CANCEL' }
  | { type: 'EXPORT_START' }
  | { type: 'EXPORT_COMPLETE'; blob: Blob; fileName: string }
  | { type: 'EXPORT_ERROR'; error: string };