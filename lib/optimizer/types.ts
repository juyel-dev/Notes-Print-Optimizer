export type PageDensity = 'sparse' | 'medium' | 'dense';

export type RasterSource = 'screenshot' | 'photo-scan';

export type PageClassification =
  | 'DARK_SLIDE'
  | 'LIGHT_SLIDE'
  | 'HANDWRITTEN_NOTES'
  | 'SCREENSHOT_HEAVY'
  | 'DIAGRAM_EQUATION'
  | 'MIXED';

import type { WhiteBoxRegion } from '../kernels/whiteBox';

export interface PageProfile {
  pageIndex: number;
  width: number;
  height: number;
  averageBrightness: number; // 0 - 255
  contrast: number; // Standard deviation of luminance
  /** Legacy non-light-pixel ratio; use foregroundCoverage for polarity-aware content density. */
  inkDensity: number;
  darkBackgroundRatio: number; // Ratio of pixels < 60 brightness
  lightBackgroundRatio: number; // Ratio of pixels > 200 brightness
  dominantHue: number; // 0 - 360
  hasTopBanner: boolean;
  topBannerHeightPct: number;
  hasBottomBanner: boolean;
  bottomBannerHeightPct: number;
  /** Legacy isolated-foreground ratio proxy; not a scan-noise measurement by itself. */
  estimatedNoise: number;
  strokeThickness: number;
  /** Sampled structural edge density used by future recipe selection. */
  edgeDensity?: number;
  /** Sampled ratio of pixels with meaningful color saturation. */
  colorfulPixelRatio?: number;
  /** Dominant foreground/background polarity inferred from the sampled page. */
  foregroundPolarity?: 'light-on-dark' | 'dark-on-light' | 'mixed';
  /** Confidence in the page-level polarity estimate (0-1). */
  polarityConfidence?: number;
  /** Polarity-aware fraction of the full page occupied by foreground/content samples. */
  foregroundCoverage?: number;
  /** Normalized bounding box of detected foreground content. */
  contentBoundingBox?: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  };
  /** Normalized empty margins around detected foreground content. */
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** True when foreground coverage is low enough to treat the page as sparse. */
  sparseContent?: boolean;
  /** True when meaningful saturated pixels are present in the page. */
  coloredAnnotationPresent?: boolean;
  /** Conservative preservation signal for thin foreground structure. */
  thinStrokeRisk?: boolean;
  /** Coarse visual content density inferred from foreground coverage and structural edge coverage. */
  density?: PageDensity;
  /** Ratio of foreground samples participating in long horizontal/vertical runs. */
  longLineDensity?: number;
  /** Conservative 0-1 structural signal for diagram/equation-like content. */
  diagramEquationScore?: number;
  /** Conservative raster provenance hint for raster-heavy non-dark pages. */
  rasterSource?: RasterSource;
  classification: PageClassification;
}

export interface DocumentProfile {
  totalPages: number;
  averageBrightness: number;
  darkSlideRatio: number;
  recommendedPreset: PresetMode;
  pages: PageProfile[];
  detectedBanners: {
    topPct: number;
    bottomPct: number;
  };
}

export type PresetMode =
  | 'AUTO_ADAPTIVE'
  | 'PW_DARK_SLIDE'
  | 'LIGHT_HANDWRITTEN'
  | 'SCREENSHOT_PRINT'
  | 'INK_SAVER_EXTREME'
  | 'DIAGRAM_HIGH_CONTRAST';

export interface ProcessingParameters {
  preset: PresetMode;
  invertMode: 'smart' | 'simple' | 'none';
  smartColorMapping: boolean; // Map bright yellow/cyan pens to dark high-contrast printable inks
  backgroundWhiteningThreshold: number; // 200 - 255 (pixels above become 255)
  contrastEnhancement: number; // 0 - 100
  sharpenAmount: number; // 0 - 100
  denoiseAmount: number; // 0 - 100
  bannerCropTopPct: number; // 0 - 30%
  bannerCropBottomPct: number; // 0 - 30%
  autoTrimMargins: boolean;
  binaizationThreshold: number; // 0 = disabled, 1-255 = threshold
  outputQuality: number; // JPEG quality 0.5 - 1.0
  strokeEnhancement?: 'none' | 'normal' | 'strong';
  dilationKernelSize?: number; // 0=off, 3=light, 5=medium, 7=heavy (overrides strokeEnhancement)
  /** Pipeline flag (not a pixel op): restore large white boxes on dark
   *  pages from the original render. Default ON; see kernels/whiteBox. */
  autoWhiteBoxFix?: boolean;
}

export type GridFormat = '1x1' | '2x1' | '1x2' | '2x2' | '2x3' | '2x4' | '2x5' | '3x3' | 'original' | '2up' | '4up' | '6up' | '8up' | '10up';
export type PaperSize = 'A4' | 'LETTER' | 'LEGAL';
export type Orientation = 'PORTRAIT' | 'LANDSCAPE' | 'AUTO';

export interface OuterMarginConfig {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface LayoutConfig {
  gridFormat: GridFormat;
  paperSize: PaperSize;
  orientation: Orientation;
  outerMarginMm: OuterMarginConfig;
  innerMarginMm: number;
  marginMm?: number;
  spacingMm?: number;
  showSlideBorders: boolean;
  showPageNumbers: boolean;
  headerTitle: string;
}

export interface ProcessingProgress {
  stage: 'INITIALIZING' | 'ANALYZING' | 'OPTIMIZING' | 'BUILDING_GRID' | 'EXPORTING_PDF' | 'COMPLETE' | 'ERROR';
  currentPage: number;
  totalPages: number;
  percent: number;
  currentAction: string;
  errorMessage?: string;
  elapsedMs: number;
}

export interface OptimizationMetrics {
  totalOriginalSizeMB: number;
  totalOptimizedSizeMB: number;
  originalInkCoveragePct: number;
  optimizedInkCoveragePct: number;
  inkSavedPct: number;
  processingTimeMs: number;
  pagesPerSecond: number;
  throughputMPixelsPerSec: number;
}

export interface ProcessedPage {
  pageIndex: number;
  thumbnailDataUrl: string;
  profile: PageProfile;
  parameters: ProcessingParameters;
  inkCoverageBeforePct: number;
  inkCoverageAfterPct: number;
  width?: number;
  height?: number;
  storageKey?: string;
  /** White boxes auto-restored from the original render (dark pages only).
   *  Powers the thumbnail badge and the future manual region editor. */
  whiteBoxRegions?: WhiteBoxRegion[];
  /** True when the preservation guard softened the initial recipe. */
  preservationGuardTriggered?: boolean;
}
