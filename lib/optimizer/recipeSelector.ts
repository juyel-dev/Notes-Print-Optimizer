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
  /* A dark frame means a dark slide even when a large light panel (diagram,
     table, photo) pulls the global dark ratio under the threshold. */
  if (profile.darkFrame === true) {
    return profile.classification === 'DIAGRAM_EQUATION'
      ? 'DIAGRAM_HIGH_CONTRAST'
      : 'PW_DARK_SLIDE';
  }

  if (profile.foregroundPolarity === 'mixed') {
    return 'LIGHT_HANDWRITTEN';
  }

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
