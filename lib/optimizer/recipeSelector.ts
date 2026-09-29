import type { PageProfile, PresetMode } from './types';
import { DARK_BG_RATIO_THRESHOLD } from '../kernels/constants';

/**
 * Deterministic page-level recipe selection for Auto mode.
 *
 * The selector is intentionally conservative: when the analyzer is unsure,
 * prefer the light handwritten recipe rather than applying a dark-slide
 * transformation that could destroy handwriting, equations, or diagrams.
 */
export function selectPresetForPage(profile: PageProfile): PresetMode {
  switch (profile.classification) {
    case 'DARK_SLIDE':
      return 'PW_DARK_SLIDE';
    case 'DIAGRAM_EQUATION':
      return 'DIAGRAM_HIGH_CONTRAST';
    case 'LIGHT_SLIDE':
    case 'HANDWRITTEN_NOTES':
      return 'LIGHT_HANDWRITTEN';
    case 'SCREENSHOT_HEAVY':
      return 'SCREENSHOT_PRINT';
    case 'MIXED':
    default:
      return profile.darkBackgroundRatio > DARK_BG_RATIO_THRESHOLD
        ? 'PW_DARK_SLIDE'
        : 'LIGHT_HANDWRITTEN';
  }
}
