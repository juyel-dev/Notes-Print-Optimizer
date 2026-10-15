/**
 * Compress PDF — shared types, the five strength levels and the pure helpers
 * that turn size predictions into a recommendation.
 */

export type CompressMode = 'smart' | 'flatten';
export type CompressLevel = 1 | 2 | 3 | 4 | 5;

export interface LevelSpec {
  level: CompressLevel;
  label: string;
  blurb: string;
  /** Keep-text mode: longest image edge (px) and JPEG quality for embedded images. */
  smart: { maxEdge: number; quality: number };
  /** Flatten mode: page raster DPI and JPEG quality. */
  flatten: { dpi: number; quality: number };
}

/** Gentlest → smallest. Predicted size is monotonic in this order. */
export const COMPRESS_LEVELS: readonly LevelSpec[] = [
  { level: 1, label: 'Gentle', blurb: 'Looks identical', smart: { maxEdge: 2400, quality: 0.85 }, flatten: { dpi: 150, quality: 0.82 } },
  { level: 2, label: 'Light', blurb: 'Hard to tell apart', smart: { maxEdge: 1800, quality: 0.75 }, flatten: { dpi: 130, quality: 0.72 } },
  { level: 3, label: 'Balanced', blurb: 'Great for sharing', smart: { maxEdge: 1400, quality: 0.65 }, flatten: { dpi: 110, quality: 0.62 } },
  { level: 4, label: 'Strong', blurb: 'Small, still readable', smart: { maxEdge: 1100, quality: 0.55 }, flatten: { dpi: 96, quality: 0.52 } },
  { level: 5, label: 'Extreme', blurb: 'Smallest possible', smart: { maxEdge: 800, quality: 0.45 }, flatten: { dpi: 80, quality: 0.42 } },
];

export const MODE_LABEL: Record<CompressMode, string> = {
  smart: 'Keep text',
  flatten: 'Flatten pages',
};

/** Common upload limits people actually run into. */
export const TARGET_PRESETS: ReadonlyArray<{ id: string; label: string; hint: string; bytes: number }> = [
  { id: '500k', label: '500 KB', hint: 'Strict forms', bytes: 500 * 1024 },
  { id: '1m', label: '1 MB', hint: 'Govt portals', bytes: 1024 * 1024 },
  { id: '2m', label: '2 MB', hint: 'Applications', bytes: 2 * 1024 * 1024 },
  { id: '5m', label: '5 MB', hint: 'Quick share', bytes: 5 * 1024 * 1024 },
  { id: '10m', label: '10 MB', hint: 'Chat apps', bytes: 10 * 1024 * 1024 },
  { id: '25m', label: '25 MB', hint: 'Email limit', bytes: 25 * 1024 * 1024 },
];

/** Safety margin: real output can differ a little from the estimate. */
export const TARGET_MARGIN = 0.03;

export function levelSpec(level: CompressLevel): LevelSpec {
  return COMPRESS_LEVELS[level - 1];
}

/** "812 KB", "1.8 MB", "240 MB" — one consistent size format for the whole tool. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 100 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export interface TargetPick {
  level: CompressLevel;
  /** False when even the strongest level is predicted to miss the target. */
  reachable: boolean;
}

/** Gentlest level whose prediction (plus margin) fits the target; Extreme + unreachable otherwise. */
export function pickLevelForTarget(predicted: readonly number[], target: number): TargetPick {
  for (let i = 0; i < predicted.length; i++) {
    if (predicted[i] * (1 + TARGET_MARGIN) <= target) return { level: (i + 1) as CompressLevel, reachable: true };
  }
  return { level: 5, reachable: false };
}

/** Percentage saved, clamped to 0–99 for display (never claims 100%). */
export function savedPercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.max(0, Math.min(99, Math.round((1 - after / before) * 100)));
}

/** Parses a free-typed size ("1.5", "800 kb", "2mb") into bytes; null when unusable. */
export function parseTargetInput(raw: string, defaultUnit: 'kb' | 'mb' = 'mb'): number | null {
  const m = raw.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*(kb|mb|k|m)?$/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2] ? (m[2].startsWith('k') ? 'kb' : 'mb') : defaultUnit;
  const bytes = Math.round(n * (unit === 'kb' ? 1024 : 1024 * 1024));
  return bytes >= 50 * 1024 && bytes <= 200 * 1024 * 1024 ? bytes : null;
}

export const MAX_COMPRESS_SAMPLE_IMAGES = 40;
export const MAX_COMPRESS_SAMPLE_PAGES = 8;

/** Evenly spaced indices (always includes the first and, when possible, last). */
export function evenSample(count: number, max: number): number[] {
  if (count <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const out = new Set<number>();
  for (let i = 0; i < max; i++) out.add(Math.round((i * (count - 1)) / (max - 1)));
  return Array.from(out).sort((a, b) => a - b);
}
