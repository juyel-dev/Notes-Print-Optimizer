import { describe, it, expect } from 'vitest';
import type { PageProfile } from '../../lib/optimizer/types';
import { selectPresetForPage } from '../../lib/optimizer/recipeSelector';

function profile(classification: PageProfile['classification'], darkBackgroundRatio = 0.05): PageProfile {
  return {
    pageIndex: 0,
    width: 1000,
    height: 1400,
    averageBrightness: 220,
    contrast: 35,
    inkDensity: 0.2,
    darkBackgroundRatio,
    lightBackgroundRatio: 0.75,
    dominantHue: 0,
    hasTopBanner: false,
    topBannerHeightPct: 0,
    hasBottomBanner: false,
    bottomBannerHeightPct: 0,
    estimatedNoise: 10,
    strokeThickness: 1.8,
    classification,
  };
}

describe('selectPresetForPage', () => {
  it('maps dark pages to the dark-slide recipe', () => {
    expect(selectPresetForPage(profile('DARK_SLIDE', 0.8))).toBe('PW_DARK_SLIDE');
  });

  it('maps diagram/equation pages to the diagram recipe', () => {
    expect(selectPresetForPage(profile('DIAGRAM_EQUATION'))).toBe('DIAGRAM_HIGH_CONTRAST');
  });

  it('maps light handwritten and light-slide pages to the light recipe', () => {
    expect(selectPresetForPage(profile('HANDWRITTEN_NOTES'))).toBe('LIGHT_HANDWRITTEN');
    expect(selectPresetForPage(profile('LIGHT_SLIDE'))).toBe('LIGHT_HANDWRITTEN');
  });

  it('uses the conservative light recipe for mixed pages unless they are clearly dark', () => {
    expect(selectPresetForPage(profile('MIXED', 0.1))).toBe('LIGHT_HANDWRITTEN');
    expect(selectPresetForPage(profile('MIXED', 0.75))).toBe('PW_DARK_SLIDE');
  });

  it('routes screenshot-heavy pages to the dedicated screenshot recipe', () => {
    expect(selectPresetForPage(profile('SCREENSHOT_HEAVY'))).toBe('SCREENSHOT_PRINT');
  });
});
